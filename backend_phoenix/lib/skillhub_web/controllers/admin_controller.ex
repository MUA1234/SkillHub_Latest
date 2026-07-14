defmodule SkillHubWeb.AdminController do
  @moduledoc """
  Ported admin endpoints (admin.py): platform dashboard, teacher verification,
  report moderation, and the manual teacher-payout queue, plus the teacher-
  facing earnings summary. `/admin/send-session-reminders` (email/SMS fan-out)
  stays proxied to Python. Every /admin route is gated to the `admin` role.
  """
  use SkillHubWeb, :controller

  import SkillHubWeb.AuthHelpers
  alias SkillHub.SQL

  def dashboard(conn, _params) do
    with {:ok, _} <- require_role(conn, "admin") do
      u = SQL.one("select count(*)::int total, count(*) filter (where is_active)::int active, count(*) filter (where is_verified)::int verified from public.users")
      by_role = SQL.maps("select coalesce(role::text, 'unknown') role, count(*)::int c from public.users group by 1") |> Map.new(&{&1.role, &1.c})
      c = SQL.one("select count(*)::int total, count(*) filter (where status = 'published')::int active from public.courses")
      rev = SQL.one("select coalesce(sum(amount), 0)::float total, coalesce(sum(amount) filter (where payment_gateway = 'demo'), 0)::float demo from public.live_session_payments where payment_status = 'completed'")
      sch = SQL.one("select coalesce(sum(total_amount_lkr), 0)::float value, count(*) filter (where status = 'open')::int open, count(*)::int total from public.scholarships")
      pending_teachers = SQL.scalar("select count(*)::int from public.teacher_profiles where is_verified = false", [], 0)
      open_reports = SQL.scalar("select count(*)::int from public.reports where status::text in ('pending','open','under_review')", [], 0)

      json(conn, %{
        success: true,
        users: %{total: u.total, active: u.active, verified: u.verified, by_role: by_role},
        courses: %{total: c.total, active: c.active},
        revenue: %{currency: "LKR", total: rev.total, demo: rev.demo, live: rev.total - rev.demo},
        scholarships: %{total_value_lkr: sch.value, open: sch.open, total: sch.total},
        moderation: %{pending_teachers: pending_teachers, open_reports: open_reports}
      })
    end
  end

  def pending_teachers(conn, _params) do
    with {:ok, _} <- require_role(conn, "admin") do
      rows =
        SQL.json_all("""
        select to_jsonb(tp) || jsonb_build_object(
          'email', u.email, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_url', p.avatar_url) as row
        from public.teacher_profiles tp
        left join public.users u on u.id = tp.user_id
        left join public.user_profiles p on p.user_id = tp.user_id
        where tp.is_verified = false order by tp.created_at desc
        """)

      teachers =
        Enum.map(rows, fn r ->
          %{
            teacher_profile_id: r["id"], user_id: r["user_id"], email: r["email"],
            first_name: r["first_name"], last_name: r["last_name"], avatar_url: r["avatar_url"],
            qualifications: r["qualifications"], experience_years: r["experience_years"],
            bio: r["bio"], created_at: r["created_at"]
          }
        end)

      json(conn, %{success: true, teachers: teachers})
    end
  end

  def verify_teacher(conn, %{"teacher_profile_id" => tp_id} = params) do
    with {:ok, _} <- require_role(conn, "admin") do
      case SQL.one("select user_id::text from public.teacher_profiles where id = $1::uuid", [tp_id]) do
        nil ->
          conn |> put_status(404) |> json(%{detail: "Teacher profile not found."})

        %{user_id: user_id} ->
          approve = params["approve"] == true
          notes = params["notes"]

          if approve do
            SQL.maps("update public.teacher_profiles set is_verified = true, verified_at = now(), verification_notes = $2, updated_at = now() where id = $1::uuid", [tp_id, notes])
            notify(user_id, "teacher_verified", "You're verified!", "Your teacher account has been approved. You can now publish courses.")
          else
            SQL.maps("update public.teacher_profiles set is_verified = false, verification_notes = $2, updated_at = now() where id = $1::uuid", [tp_id, notes])
            notify(user_id, "teacher_rejected", "Verification update", notes || "Your verification could not be completed.")
          end

          json(conn, %{success: true, approved: approve})
      end
    end
  end

  def reports(conn, _params) do
    with {:ok, _} <- require_role(conn, "admin") do
      rows = SQL.json_all("select to_jsonb(r) as row from public.reports r where r.status::text in ('pending','open','under_review') order by r.created_at desc")
      json(conn, %{success: true, reports: rows})
    end
  end

  def resolve_report(conn, %{"report_id" => report_id} = params) do
    with {:ok, _} <- require_role(conn, "admin") do
      action = params["action"]

      cond do
        action not in ~w(warn hide suspend dismiss) ->
          conn |> put_status(400) |> json(%{detail: "Invalid action: #{action}"})

        is_nil(SQL.one("select id from public.reports where id = $1::uuid", [report_id])) ->
          conn |> put_status(404) |> json(%{detail: "Report not found."})

        true ->
          SQL.maps(
            "update public.reports set status = 'resolved', admin_notes = $2, resolved_by = $3::uuid, resolved_at = now(), resolution_action = $4 where id = $1::uuid",
            [report_id, params["admin_notes"], uid(conn), action]
          )

          json(conn, %{success: true, action: action})
      end
    end
  end

  # ---- payouts --------------------------------------------------------------

  def list_payouts(conn, params) do
    with {:ok, _} <- require_role(conn, "admin") do
      {where, args} =
        case params["status_filter"] do
          nil -> {"", []}
          st -> {"where p.status = $1", [st]}
        end

      rows =
        SQL.json_all(
          """
          select to_jsonb(p) || jsonb_build_object(
            'teacher_name', nullif(trim(coalesce(up.first_name, '') || ' ' || coalesce(up.last_name, '')), ''),
            'teacher_email', u.email) as row
          from public.teacher_payouts p
          left join public.teacher_profiles tp on tp.id = p.teacher_profile_id
          left join public.users u on u.id = tp.user_id
          left join public.user_profiles up on up.user_id = tp.user_id
          #{where} order by p.requested_at desc limit 500
          """,
          args
        )

      json(conn, %{success: true, payouts: rows})
    end
  end

  def create_payout(conn, params) do
    with {:ok, _} <- require_role(conn, "admin") do
      amount = num(params["amount_lkr"])

      case SQL.one("select user_id::text from public.teacher_profiles where id = $1::uuid", [params["teacher_profile_id"]]) do
        nil -> conn |> put_status(404) |> json(%{detail: "Teacher not found."})
        _ when amount <= 0 -> conn |> put_status(400) |> json(%{detail: "amount_lkr must be > 0"})
        %{user_id: user_id} ->
          payout =
            SQL.json_one(
              """
              insert into public.teacher_payouts
                (teacher_profile_id, amount_lkr, currency, status, period_start, period_end,
                 bank_name, bank_account_number, bank_account_holder, admin_notes, requested_at, created_at, updated_at)
              values ($1::uuid, $2, 'LKR', 'pending', $3::text::date, $4::text::date, $5, $6, $7, $8, now(), now(), now())
              returning to_jsonb(teacher_payouts) as row
              """,
              [params["teacher_profile_id"], amount, params["period_start"], params["period_end"],
               params["bank_name"], params["bank_account_number"], params["bank_account_holder"], params["admin_notes"]]
            )

          notify(user_id, "payout_requested", "Payout requested", "A payout of LKR #{fmt(amount)} has been queued for you.")
          json(conn, %{success: true, payout: payout})
      end
    end
  end

  def approve_payout(conn, %{"payout_id" => id} = params) do
    transition(conn, id, ["pending"], "cannot approve", fn p ->
      SQL.maps("update public.teacher_payouts set status = 'approved', approved_at = now(), approved_by = $2::uuid, admin_notes = coalesce($3, admin_notes), updated_at = now() where id = $1::uuid",
        [id, uid(conn), params["admin_notes"]])
      notify_teacher(p, "payout_approved", "Payout approved", "Your LKR #{fmt(p["amount_lkr"])} payout is approved and will be transferred shortly.")
      json(conn, %{success: true})
    end)
  end

  def mark_paid(conn, %{"payout_id" => id} = params) do
    ref = (params["bank_reference"] || "") |> to_string() |> String.trim()

    if ref == "" do
      conn |> put_status(400) |> json(%{detail: "bank_reference is required."})
    else
      transition(conn, id, ["pending", "approved"], "cannot mark paid", fn p ->
        SQL.maps("update public.teacher_payouts set status = 'paid', paid_at = now(), paid_by = $2::uuid, bank_reference = $3, admin_notes = coalesce($4, admin_notes), updated_at = now() where id = $1::uuid",
          [id, uid(conn), ref, params["admin_notes"]])
        notify_teacher(p, "payout_paid", "Payout sent", "LKR #{fmt(p["amount_lkr"])} has been transferred. Ref: #{ref}")
        json(conn, %{success: true})
      end)
    end
  end

  def cancel_payout(conn, %{"payout_id" => id} = params) do
    with {:ok, _} <- require_role(conn, "admin"),
         %{} = p <- SQL.json_one("select to_jsonb(x) as row from public.teacher_payouts x where x.id = $1::uuid", [id]) do
      if p["status"] == "paid" do
        conn |> put_status(400) |> json(%{detail: "Paid payouts cannot be cancelled."})
      else
        SQL.maps("update public.teacher_payouts set status = 'cancelled', admin_notes = coalesce($2, admin_notes), updated_at = now() where id = $1::uuid", [id, params["admin_notes"]])
        json(conn, %{success: true})
      end
    else
      nil -> conn |> put_status(404) |> json(%{detail: "Payout not found."})
      other -> other
    end
  end

  def earnings_summary(conn, _params) do
    case SQL.one("select id::text from public.teacher_profiles where user_id = $1::uuid", [uid(conn)]) do
      nil ->
        conn |> put_status(403) |> json(%{detail: "Teacher account required."})

      %{id: tp_id} ->
        gross =
          SQL.scalar(
            """
            select coalesce(sum(pmt.amount), 0)::float from public.live_session_payments pmt
            join public.live_sessions s on s.id = pmt.session_id
            where s.teacher_id = $1::uuid and pmt.payment_status = 'completed'
            """,
            [tp_id], 0.0
          )

        payouts = SQL.json_all("select to_jsonb(p) as row from public.teacher_payouts p where p.teacher_profile_id = $1::uuid order by p.requested_at desc limit 200", [tp_id])
        counted = payouts |> Enum.filter(&(&1["status"] in ["pending", "approved", "paid"])) |> Enum.reduce(0.0, &(&2 + num(&1["amount_lkr"])))
        paid_out = payouts |> Enum.filter(&(&1["status"] == "paid")) |> Enum.reduce(0.0, &(&2 + num(&1["amount_lkr"])))

        json(conn, %{success: true, currency: "LKR", gross_earned: gross, paid_out: paid_out, outstanding: max(0.0, gross - counted), payouts: payouts})
    end
  end

  # ---- helpers --------------------------------------------------------------

  defp transition(conn, id, allowed, verb, fun) do
    with {:ok, _} <- require_role(conn, "admin"),
         %{} = p <- SQL.json_one("select to_jsonb(x) as row from public.teacher_payouts x where x.id = $1::uuid", [id]) do
      if p["status"] in allowed do
        fun.(p)
      else
        conn |> put_status(400) |> json(%{detail: "Payout is already #{p["status"]}, #{verb}."})
      end
    else
      nil -> conn |> put_status(404) |> json(%{detail: "Payout not found."})
      other -> other
    end
  end

  defp notify_teacher(payout, type, title, message) do
    case SQL.one("select user_id::text from public.teacher_profiles where id = $1::uuid", [payout["teacher_profile_id"]]) do
      %{user_id: user_id} -> notify(user_id, type, title, message)
      _ -> :ok
    end
  end

  defp notify(user_id, type, title, message) do
    try do
      SQL.maps("insert into public.notifications (user_id, type, title, message) values ($1::uuid, $2::notification_type, $3, $4)", [user_id, type, title, message])
    rescue
      _ -> :ok
    end

    :ok
  end

  defp num(nil), do: 0.0
  defp num(n) when is_number(n), do: n * 1.0
  defp num(%Decimal{} = d), do: Decimal.to_float(d)
  defp num(n) when is_binary(n), do: (case Float.parse(n) do
    {f, _} -> f
    :error -> 0.0
  end)
  defp num(_), do: 0.0

  defp fmt(amount) do
    amount |> num() |> Float.round(0) |> trunc() |> Integer.to_string()
    |> String.reverse() |> String.replace(~r/(\d{3})(?=\d)/, "\\1,") |> String.reverse()
  end

  defp uid(conn), do: conn.assigns.current_user_id
end
