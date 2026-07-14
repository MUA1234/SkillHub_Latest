defmodule SkillHubWeb.ScholarshipController do
  @moduledoc """
  Ported scholarships + access codes (scholarships.py). Sponsors open
  scholarships, students apply, sponsors review; approving mints a
  `student_funding_grants` row. Access codes are a parallel instant-grant path.
  All money is LKR. Notifications are best-effort (and fire realtime via the
  trigger); email/SMS/push fan-out stays in the Python service for now.
  """
  use SkillHubWeb, :controller

  import SkillHubWeb.AuthHelpers
  alias SkillHub.SQL

  @code_alphabet ~c"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

  @legal_transitions %{
    "draft" => ~w(draft open archived),
    "open" => ~w(open closed archived),
    "closed" => ~w(closed archived),
    "archived" => ~w(archived)
  }

  # ---- Sponsor: scholarships ------------------------------------------------

  def list_mine(conn, params) do
    with {:ok, profile} <- sponsor_profile(conn) do
      {sql, args} =
        case params["status_filter"] do
          nil -> {"select to_jsonb(s) as row from public.scholarships s where s.sponsor_id = $1::uuid order by s.created_at desc limit 200", [profile["id"]]}
          st -> {"select to_jsonb(s) as row from public.scholarships s where s.sponsor_id = $1::uuid and s.status = $2 order by s.created_at desc limit 200", [profile["id"], st]}
        end

      json(conn, %{scholarships: Enum.map(SQL.json_all(sql, args), &serialize/1)})
    end
  end

  def create(conn, params) do
    with {:ok, profile} <- sponsor_profile(conn) do
      status = params["status"] || "draft"

      if status not in ["draft", "open"] do
        conn |> put_status(400) |> json(%{detail: "New scholarships must start as 'draft' or 'open'."})
      else
        id =
          SQL.scalar(
            """
            insert into public.scholarships
              (id, sponsor_id, title, description, total_amount_lkr, currency, eligibility_criteria,
               target_disability_types, target_locations, slots_available, slots_filled, status,
               start_date, end_date, created_at, updated_at)
            values (gen_random_uuid(), $1::uuid, $2, $3, $4, 'LKR', $5::text::jsonb,
                    $6::text[], $7::text[], $8, 0, $9, $10::text::date, $11::text::date, now(), now())
            returning id::text
            """,
            [
              profile["id"], params["title"], params["description"], num(params["total_amount_lkr"]),
              Jason.encode!(params["eligibility_criteria"] || %{}),
              params["target_disability_types"] || [], params["target_locations"] || [],
              params["slots_available"] || 1, status, params["start_date"], params["end_date"]
            ]
          )

        if status == "open", do: kick_off_matching(id)
        json(conn, %{scholarship: serialize(fetch(id))})
      end
    end
  end

  def get_mine(conn, %{"scholarship_id" => id}) do
    with {:ok, profile} <- sponsor_profile(conn) do
      case owned(id, profile["id"]) do
        nil -> not_found(conn, "Scholarship not found.")
        row -> json(conn, %{scholarship: serialize(row)})
      end
    end
  end

  def update(conn, %{"scholarship_id" => id} = params) do
    with {:ok, profile} <- sponsor_profile(conn),
         %{} = existing <- owned(id, profile["id"]),
         :ok <- legal_transition(existing, params) do
      {cols, args} = scholarship_updates(params)

      if cols != [] do
        set = cols |> Enum.with_index(1) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}#{cast(c)}" end)
        SQL.maps("update public.scholarships set #{set}, updated_at = now() where id = $#{length(args) + 1}::uuid", args ++ [id])
      end

      if params["status"] == "open" and existing["status"] != "open", do: kick_off_matching(id)
      json(conn, %{scholarship: serialize(fetch(id))})
    else
      nil -> not_found(conn, "Scholarship not found.")
      {:illegal, from, to} -> conn |> put_status(400) |> json(%{detail: "Cannot move scholarship from #{from} → #{to}."})
      other -> other
    end
  end

  def delete(conn, %{"scholarship_id" => id}) do
    with {:ok, profile} <- sponsor_profile(conn),
         %{} = existing <- owned(id, profile["id"]) do
      if existing["status"] != "draft" do
        conn |> put_status(400) |> json(%{detail: "Open / closed scholarships must be archived, not deleted."})
      else
        SQL.maps("delete from public.scholarships where id = $1::uuid", [id])
        json(conn, %{deleted: true})
      end
    else
      nil -> not_found(conn, "Scholarship not found.")
      other -> other
    end
  end

  def list_applications(conn, %{"scholarship_id" => id} = params) do
    with {:ok, profile} <- sponsor_profile(conn),
         %{} <- owned(id, profile["id"]) do
      {sql, args} =
        case params["status_filter"] do
          nil -> {"where a.scholarship_id = $1::uuid", [id]}
          st -> {"where a.scholarship_id = $1::uuid and a.status = $2", [id, st]}
        end

      apps =
        SQL.json_all(
          """
          select to_jsonb(a) || jsonb_build_object(
            'student_first_name', p.first_name,
            'student_last_name', p.last_name,
            'student_avatar_url', p.avatar_url) as row
          from public.scholarship_applications a
          left join public.user_profiles p on p.user_id = a.student_id
          #{sql} order by a.created_at desc limit 500
          """,
          args
        )

      json(conn, %{applications: apps})
    else
      nil -> not_found(conn, "Scholarship not found.")
      other -> other
    end
  end

  def review_application(conn, %{"application_id" => app_id} = params) do
    action = (params["action"] || "") |> to_string() |> String.downcase()

    with {:ok, profile} <- sponsor_profile(conn),
         %{} = app <- fetch_application(app_id),
         %{} = sch <- owned(app["scholarship_id"], profile["id"]),
         :pending <- app_status(app),
         true <- action in ["approve", "reject"] do
      if action == "reject", do: reject_application(conn, app, sch, params), else: approve_application(conn, app, sch, profile, params)
    else
      nil -> not_found(conn, "Application not found.")
      {:already, st} -> conn |> put_status(400) |> json(%{detail: "Application is already #{st}; cannot review again."})
      false -> conn |> put_status(400) |> json(%{detail: "action must be 'approve' or 'reject'."})
      other -> other
    end
  end

  # ---- Sponsor: access codes ------------------------------------------------

  def list_access_codes(conn, _params) do
    with {:ok, profile} <- sponsor_profile(conn) do
      rows = SQL.json_all("select to_jsonb(c) as row from public.access_codes c where c.sponsor_id = $1::uuid order by c.created_at desc limit 500", [profile["id"]])
      json(conn, %{access_codes: rows})
    end
  end

  def create_access_codes(conn, params) do
    with {:ok, profile} <- sponsor_profile(conn) do
      quantity = (params["quantity"] || 1) |> min(500) |> max(1)

      created =
        Enum.reduce(1..quantity, [], fn _, acc ->
          case mint_code(profile["id"], params) do
            nil -> acc
            row -> [row | acc]
          end
        end)
        |> Enum.reverse()

      json(conn, %{access_codes: created})
    end
  end

  def revoke_access_code(conn, %{"code_id" => code_id}) do
    with {:ok, profile} <- sponsor_profile(conn) do
      case SQL.one("select id from public.access_codes where id = $1::uuid and sponsor_id = $2::uuid", [code_id, profile["id"]]) do
        nil -> not_found(conn, "Access code not found.")
        _ ->
          SQL.maps("delete from public.access_codes where id = $1::uuid", [code_id])
          json(conn, %{revoked: true})
      end
    end
  end

  # ---- Student --------------------------------------------------------------

  def list_open(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      rows = SQL.json_all("select to_jsonb(s) as row from public.scholarships s where s.status = 'open' order by s.created_at desc limit 200")
      json(conn, %{scholarships: Enum.map(rows, &serialize/1)})
    end
  end

  def get_open(conn, %{"scholarship_id" => id}) do
    with {:ok, _} <- require_role(conn, "student") do
      case fetch(id) do
        %{"status" => "open"} = row -> json(conn, %{scholarship: serialize(row)})
        _ -> not_found(conn, "Scholarship not found.")
      end
    end
  end

  def apply(conn, %{"scholarship_id" => id} = params) do
    with {:ok, _} <- require_role(conn, "student"),
         %{"status" => "open"} = sch <- fetch(id) do
      student_id = uid(conn)
      existing = fetch_application_by(id, student_id)

      result =
        case existing do
          nil -> insert_application(id, student_id, params)
          %{"status" => st} when st in ["withdrawn", "rejected"] -> resubmit_application(existing["id"], params)
          %{"status" => st} -> {:conflict, st}
        end

      case result do
        {:conflict, st} ->
          conn |> put_status(400) |> json(%{detail: "You already have a #{st} application here."})

        app ->
          notify_sponsor_of_application(sch, app)
          json(conn, %{application: app})
      end
    else
      _ -> not_found(conn, "Scholarship is not open.")
    end
  end

  def my_applications(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      apps =
        SQL.json_all(
          """
          select to_jsonb(a) || jsonb_build_object(
            'scholarship_title', s.title, 'scholarship_status', s.status) as row
          from public.scholarship_applications a
          left join public.scholarships s on s.id = a.scholarship_id
          where a.student_id = $1::uuid order by a.created_at desc limit 200
          """,
          [uid(conn)]
        )

      json(conn, %{applications: apps})
    end
  end

  def my_grants(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      rows = SQL.json_all("select to_jsonb(g) as row from public.student_funding_grants g where g.student_id = $1::uuid order by g.created_at desc limit 200", [uid(conn)])
      json(conn, %{grants: rows})
    end
  end

  def redeem(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      code_str = (params["code"] || "") |> to_string() |> String.trim() |> String.upcase()
      student_id = uid(conn)
      code = SQL.json_one("select to_jsonb(c) as row from public.access_codes c where c.code = $1", [code_str])

      cond do
        is_nil(code) -> conn |> put_status(404) |> json(%{detail: "Code not recognized."})
        expired?(code["expires_at"]) -> conn |> put_status(400) |> json(%{detail: "This code has expired."})
        (code["uses"] || 0) >= (code["max_uses"] || 1) -> conn |> put_status(400) |> json(%{detail: "This code has been fully redeemed."})
        already_redeemed?(code["id"], student_id) -> conn |> put_status(400) |> json(%{detail: "You've already redeemed this code."})
        true -> do_redeem(conn, code, code_str, student_id)
      end
    end
  end

  # ---- review helpers -------------------------------------------------------

  defp reject_application(conn, app, sch, params) do
    SQL.maps(
      "update public.scholarship_applications set status = 'rejected', reviewer_notes = $2, reviewed_by = $3::uuid, reviewed_at = now(), updated_at = now() where id = $1::uuid",
      [app["id"], params["reviewer_notes"], uid(conn)]
    )

    notify(app["student_id"], "scholarship_rejected", "Scholarship application not approved",
      "Your application for '#{sch["title"]}' was not approved this round.",
      %{link_url: "/students/scholarships/applications", related_entity_id: sch["id"]})

    json(conn, %{status: "rejected"})
  end

  defp approve_application(conn, app, sch, profile, params) do
    if (sch["slots_filled"] || 0) >= (sch["slots_available"] || 0) do
      conn |> put_status(400) |> json(%{detail: "No slots remaining on this scholarship — close it or add slots first."})
    else
      slots = max(1, sch["slots_available"] || 1)
      default_grant = num(sch["total_amount_lkr"]) / slots
      amount = if is_nil(params["grant_amount_lkr"]), do: default_grant, else: num(params["grant_amount_lkr"])

      grant =
        SQL.json_one(
          """
          insert into public.student_funding_grants
            (id, scholarship_application_id, student_id, sponsor_id, amount_lkr, status, created_at, expires_at)
          values (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, 'available', now(), now() + interval '90 days')
          returning to_jsonb(student_funding_grants) as row
          """,
          [app["id"], app["student_id"], profile["id"], amount]
        )

      SQL.maps("update public.scholarship_applications set status = 'approved', reviewer_notes = $2, reviewed_by = $3::uuid, reviewed_at = now(), updated_at = now() where id = $1::uuid",
        [app["id"], params["reviewer_notes"], uid(conn)])

      SQL.maps("update public.scholarships set slots_filled = coalesce(slots_filled, 0) + 1, updated_at = now() where id = $1::uuid", [sch["id"]])

      notify(app["student_id"], "scholarship_approved", "Scholarship approved 🎉",
        "Your application for '#{sch["title"]}' was approved. You have a grant of LKR #{fmt(amount)} ready to use.",
        %{link_url: "/students/scholarships/applications", related_entity_id: grant["id"], priority: "high"})

      json(conn, %{status: "approved", grant: grant})
    end
  end

  defp do_redeem(conn, code, code_str, student_id) do
    grant =
      SQL.json_one(
        """
        insert into public.student_funding_grants (id, student_id, sponsor_id, amount_lkr, status, created_at, expires_at)
        values (gen_random_uuid(), $1::uuid, $2::uuid, $3, 'available', now(), now() + interval '90 days')
        returning to_jsonb(student_funding_grants) as row
        """,
        [student_id, code["sponsor_id"], num(code["value_lkr"])]
      )

    SQL.maps(
      "insert into public.access_code_redemptions (id, access_code_id, student_id, grant_id, redeemed_at) values (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, now())",
      [code["id"], student_id, grant["id"]]
    )

    SQL.maps("update public.access_codes set uses = coalesce(uses, 0) + 1 where id = $1::uuid", [code["id"]])

    sponsor = SQL.one("select user_id::text from public.sponsor_profiles where id = $1::uuid", [code["sponsor_id"]])

    if sponsor && sponsor.user_id do
      notify(sponsor.user_id, "access_code_redeemed", "Access code redeemed",
        "A student redeemed code #{code_str} (LKR #{fmt(num(code["value_lkr"]))}).",
        %{link_url: "/sponsors/access-codes", related_entity_id: code["id"]})
    end

    json(conn, %{grant: grant, value_lkr: num(code["value_lkr"])})
  end

  # ---- application helpers --------------------------------------------------

  defp insert_application(scholarship_id, student_id, params) do
    SQL.json_one(
      """
      insert into public.scholarship_applications
        (id, scholarship_id, student_id, status, statement_of_need, family_income_lkr, school, grade, created_at, updated_at)
      values (gen_random_uuid(), $1::uuid, $2::uuid, 'pending', $3, $4, $5, $6, now(), now())
      returning to_jsonb(scholarship_applications) as row
      """,
      [scholarship_id, student_id, params["statement_of_need"], num_or_nil(params["family_income_lkr"]), params["school"], params["grade"]]
    )
  end

  defp resubmit_application(app_id, params) do
    SQL.json_one(
      """
      update public.scholarship_applications set
        status = 'pending', reviewed_by = null, reviewer_notes = null, reviewed_at = null,
        statement_of_need = $2, family_income_lkr = $3, school = $4, grade = $5, updated_at = now()
      where id = $1::uuid returning to_jsonb(scholarship_applications) as row
      """,
      [app_id, params["statement_of_need"], num_or_nil(params["family_income_lkr"]), params["school"], params["grade"]]
    )
  end

  defp notify_sponsor_of_application(sch, app) do
    sponsor = SQL.one("select user_id::text from public.sponsor_profiles where id = $1::uuid", [sch["sponsor_id"]])

    if sponsor && sponsor.user_id do
      notify(sponsor.user_id, "scholarship_application_received", "New scholarship application",
        "A student applied to '#{sch["title"]}'.",
        %{link_url: "/sponsors/scholarships/#{sch["id"]}/applications", related_entity_id: app["id"]})
    end
  end

  # ---- access code helpers --------------------------------------------------

  defp mint_code(sponsor_id, params) do
    Enum.reduce_while(1..5, nil, fn _, _ ->
      try do
        row =
          SQL.json_one(
            """
            insert into public.access_codes (id, sponsor_id, code, value_lkr, max_uses, uses, label, expires_at)
            values (gen_random_uuid(), $1::uuid, $2, $3, $4, 0, $5, $6::text::timestamp)
            returning to_jsonb(access_codes) as row
            """,
            [sponsor_id, gen_code(), num(params["value_lkr"]), params["max_uses"] || 1, params["label"], params["expires_at"]]
          )

        {:halt, row}
      rescue
        _ -> {:cont, nil}
      end
    end)
  end

  defp gen_code, do: for(_ <- 1..10, into: "", do: <<Enum.random(@code_alphabet)>>)

  # ---- shared helpers -------------------------------------------------------

  defp sponsor_profile(conn) do
    with {:ok, _user} <- require_role(conn, "sponsor") do
      case SQL.json_one("select to_jsonb(s) as row from public.sponsor_profiles s where s.user_id = $1::uuid", [uid(conn)]) do
        nil -> {:error, conn |> put_status(400) |> json(%{detail: "Sponsor profile not set up. Complete /sponsors/profile/setup first."})}
        profile -> {:ok, profile}
      end
    end
  end

  defp fetch(id), do: SQL.json_one("select to_jsonb(s) as row from public.scholarships s where s.id = $1::uuid", [id])
  defp owned(id, sponsor_id) do
    case fetch(id) do
      %{"sponsor_id" => ^sponsor_id} = row -> row
      _ -> nil
    end
  end

  defp fetch_application(id), do: SQL.json_one("select to_jsonb(a) as row from public.scholarship_applications a where a.id = $1::uuid", [id])
  defp fetch_application_by(scholarship_id, student_id),
    do: SQL.json_one("select to_jsonb(a) as row from public.scholarship_applications a where a.scholarship_id = $1::uuid and a.student_id = $2::uuid", [scholarship_id, student_id])

  defp app_status(%{"status" => "pending"}), do: :pending
  defp app_status(%{"status" => st}), do: {:already, st}

  defp legal_transition(existing, params) do
    case params["status"] do
      nil -> :ok
      target ->
        allowed = Map.get(@legal_transitions, existing["status"], [])
        if target in allowed, do: :ok, else: {:illegal, existing["status"], target}
    end
  end

  defp scholarship_updates(params) do
    fields = ~w(title description total_amount_lkr eligibility_criteria target_disability_types target_locations slots_available status start_date end_date)

    Enum.reduce(fields, {[], []}, fn f, {cols, args} ->
      if Map.has_key?(params, f) and not is_nil(params[f]) do
        {cols ++ [f], args ++ [transform(f, params[f])]}
      else
        {cols, args}
      end
    end)
  end

  defp transform("eligibility_criteria", v), do: Jason.encode!(v)
  defp transform("total_amount_lkr", v), do: num(v)
  defp transform(_f, v), do: v

  defp cast("eligibility_criteria"), do: "::text::jsonb"
  defp cast("target_disability_types"), do: "::text[]"
  defp cast("target_locations"), do: "::text[]"
  defp cast("start_date"), do: "::text::date"
  defp cast("end_date"), do: "::text::date"
  defp cast(_), do: ""

  defp serialize(nil), do: nil
  defp serialize(r) do
    %{
      id: r["id"], sponsor_id: r["sponsor_id"], title: r["title"], description: r["description"],
      total_amount_lkr: num(r["total_amount_lkr"]), currency: r["currency"] || "LKR",
      eligibility_criteria: r["eligibility_criteria"] || %{},
      target_disability_types: r["target_disability_types"] || [],
      target_locations: r["target_locations"] || [],
      slots_available: r["slots_available"] || 0, slots_filled: r["slots_filled"] || 0,
      status: r["status"], start_date: r["start_date"], end_date: r["end_date"],
      created_at: r["created_at"], updated_at: r["updated_at"]
    }
  end

  defp notify(user_id, type, title, message, data) do
    try do
      SQL.maps(
        "insert into public.notifications (user_id, type, title, message, data) values ($1::uuid, $2::notification_type, $3, $4, $5::text::jsonb)",
        [user_id, type, title, message, Jason.encode!(data)]
      )
    rescue
      _ -> :ok
    end

    :ok
  end

  defp kick_off_matching(_id), do: :ok

  defp expired?(nil), do: false
  defp expired?(ts) do
    case DateTime.from_iso8601(normalize_ts(ts)) do
      {:ok, dt, _} -> DateTime.compare(dt, DateTime.utc_now()) == :lt
      _ -> false
    end
  end

  defp already_redeemed?(code_id, student_id) do
    not is_nil(SQL.one("select id from public.access_code_redemptions where access_code_id = $1::uuid and student_id = $2::uuid limit 1", [code_id, student_id]))
  end

  defp normalize_ts(ts) do
    ts = String.replace(ts, " ", "T")
    if String.contains?(ts, "+") or String.ends_with?(ts, "Z"), do: ts, else: ts <> "Z"
  end

  defp num(nil), do: 0.0
  defp num(n) when is_float(n), do: n
  defp num(n) when is_integer(n), do: n * 1.0
  defp num(%Decimal{} = d), do: Decimal.to_float(d)
  defp num(n) when is_binary(n), do: (case Float.parse(n) do
    {f, _} -> f
    :error -> 0.0
  end)
  defp num(_), do: 0.0

  defp num_or_nil(nil), do: nil
  defp num_or_nil(v), do: num(v)

  defp fmt(amount), do: :erlang.float_to_binary(Float.round(num(amount), 0), decimals: 0)

  defp uid(conn), do: conn.assigns.current_user_id
  defp not_found(conn, msg), do: conn |> put_status(404) |> json(%{detail: msg})
end
