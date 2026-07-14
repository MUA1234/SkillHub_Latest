defmodule SkillHubWeb.PaymentController do
  @moduledoc """
  Ported payment core (payments.py): the demo checkout, grant redemption for a
  session, payment history, and payment status. Uses the correct
  `live_session_enrollment_requests` table (the Python original hit a
  non-existent `live_live_...` name). PayHere's credential-gated
  initiate/notify/status routes stay proxied to Python for now.
  """
  use SkillHubWeb, :controller

  alias SkillHub.SQL

  @allowed_methods ~w(payhere card)

  def create_session_payment(conn, %{"session_id" => session_id} = params) do
    method = (params["payment_method"] || "") |> to_string() |> String.trim() |> String.downcase()
    student_id = uid(conn)

    cond do
      method not in @allowed_methods ->
        conn |> put_status(400) |> json(%{detail: "Unsupported payment method. Choose 'payhere' or 'card'."})

      true ->
        with %{} = session <- SQL.json_one("select to_jsonb(s) as row from public.live_sessions s where s.id = $1::uuid", [session_id]),
             %{} = enrollment <- approved_enrollment(session_id, student_id) do
          case completed_payment_for_enrollment(enrollment["id"]) do
            %{} = existing ->
              json(conn, %{message: "Payment already completed", payment: existing, can_join_session: true, already_paid: true})

            nil ->
              price = num(session["price"])
              currency = (session["currency"] || "LKR") |> String.upcase()
              txn = "DEMO-" <> code12()

              payment =
                insert_payment(enrollment["id"], student_id, session["teacher_id"], session_id, price, currency, method, txn, "demo")

              register_participant(session_id, student_id, price)
              notify_payment(student_id, session["teacher_id"], session, price, payment["id"])

              json(conn, %{message: "Payment completed successfully", payment: payment, can_join_session: true, already_paid: false})
          end
        else
          nil -> payment_error(conn, session_id, student_id)
        end
    end
  end

  def my_payments(conn, _params) do
    payments = SQL.json_all("select to_jsonb(p) as row from public.live_session_payments p where p.student_id = $1::uuid order by p.created_at desc", [uid(conn)])
    json(conn, %{payments: payments})
  end

  def payment_status(conn, %{"session_id" => session_id}) do
    payment =
      SQL.json_one(
        "select to_jsonb(p) as row from public.live_session_payments p where p.session_id = $1::uuid and p.student_id = $2::uuid and p.payment_status = 'completed' limit 1",
        [session_id, uid(conn)]
      )

    json(conn, %{has_paid: not is_nil(payment), can_join: not is_nil(payment), payment: payment})
  end

  def consume_grant(conn, params) do
    session_id = params["session_id"]
    grant_id = params["grant_id"]
    student_id = uid(conn)

    with %{"status" => "available"} = grant <- owned_available_grant(grant_id, student_id),
         %{} = session <- SQL.json_one("select to_jsonb(s) as row from public.live_sessions s where s.id = $1::uuid", [session_id]),
         :ok <- grant_covers?(grant, session),
         %{} = enrollment <- approved_enrollment(session_id, student_id) do
      price = num(session["price"])
      currency = (session["currency"] || "LKR") |> String.upcase()
      txn = "GRANT-" <> code12()

      payment = insert_payment(enrollment["id"], student_id, session["teacher_id"], session_id, price, currency, "scholarship_grant", txn, "scholarship")

      SQL.maps("update public.student_funding_grants set status = 'used', used_at = now(), applies_to_session_id = $2::uuid where id = $1::uuid", [grant_id, session_id])
      register_participant(session_id, student_id, price)

      json(conn, %{message: "Grant applied successfully.", payment: payment, grant_id: grant_id, can_join_session: true})
    else
      {:grant, status} -> conn |> put_status(400) |> json(%{detail: "Grant is #{status}; cannot be applied."})
      :insufficient -> conn |> put_status(400) |> json(%{detail: "Grant amount is less than the session price."})
      :no_grant -> conn |> put_status(404) |> json(%{detail: "Grant not found."})
      :no_session -> conn |> put_status(404) |> json(%{detail: "Session not found."})
      :no_enrollment -> conn |> put_status(400) |> json(%{detail: "No approved enrollment for this session."})
      _ -> conn |> put_status(404) |> json(%{detail: "Grant not found."})
    end
  end

  # ---- helpers --------------------------------------------------------------

  defp approved_enrollment(session_id, student_id) do
    SQL.json_one(
      "select to_jsonb(e) as row from public.live_session_enrollment_requests e where e.session_id = $1::uuid and e.student_id = $2::uuid and e.status = 'approved' limit 1",
      [session_id, student_id]
    )
  end

  defp completed_payment_for_enrollment(enrollment_id) do
    SQL.json_one(
      "select to_jsonb(p) as row from public.live_session_payments p where p.enrollment_request_id = $1::uuid and p.payment_status = 'completed' limit 1",
      [enrollment_id]
    )
  end

  defp owned_available_grant(grant_id, student_id) do
    case SQL.json_one("select to_jsonb(g) as row from public.student_funding_grants g where g.id = $1::uuid and g.student_id = $2::uuid", [grant_id, student_id]) do
      nil -> :no_grant
      %{"status" => "available"} = g -> g
      %{"status" => st} -> {:grant, st}
    end
  end

  defp grant_covers?(grant, session) do
    if num(grant["amount_lkr"]) < num(session["price"]), do: :insufficient, else: :ok
  end

  defp insert_payment(enrollment_id, student_id, teacher_id, session_id, price, currency, method, txn, gateway) do
    SQL.json_one(
      """
      insert into public.live_session_payments
        (id, enrollment_request_id, student_id, teacher_id, session_id, amount, currency,
         payment_status, payment_method, transaction_id, payment_gateway, paid_at)
      values (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, 'completed', $7, $8, $9, now())
      returning to_jsonb(live_session_payments) as row
      """,
      [enrollment_id, student_id, teacher_id, session_id, price, currency, method, txn, gateway]
    )
  end

  defp register_participant(session_id, student_id, price) do
    try do
      SQL.maps(
        "insert into public.live_session_participants (id, session_id, student_id, registration_date, payment_status, payment_amount) values (gen_random_uuid(), $1::uuid, $2::uuid, now(), 'paid', $3)",
        [session_id, student_id, price]
      )
    rescue
      _ -> :ok
    end
  end

  defp notify_payment(student_id, teacher_id, session, price, payment_id) do
    title = session["title"] || "the session"
    amount = "LKR " <> fmt(price)

    notify(student_id, "payment_received", "Payment Successful!",
      "Your payment of #{amount} for '#{title}' was successful. You can now join the session!",
      %{link_url: "/students/live-sessions", related_entity_id: payment_id, priority: "high"})

    notify(teacher_id, "payment_received", "Payment Received",
      "A student has paid #{amount} for '#{title}'",
      %{link_url: "/teachers/live-sessions", related_entity_id: payment_id})
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

  defp payment_error(conn, session_id, student_id) do
    cond do
      is_nil(SQL.one("select id from public.live_sessions where id = $1::uuid", [session_id])) ->
        conn |> put_status(404) |> json(%{detail: "Session not found"})

      is_nil(approved_enrollment(session_id, student_id)) ->
        conn |> put_status(400) |> json(%{detail: "No approved enrollment found. Please request enrollment first."})

      true ->
        conn |> put_status(400) |> json(%{detail: "Payment could not be processed."})
    end
  end

  defp code12, do: (for _ <- 1..12, into: "", do: <<Enum.random(~c"0123456789ABCDEF")>>)

  defp num(nil), do: 0.0
  defp num(n) when is_float(n), do: n
  defp num(n) when is_integer(n), do: n * 1.0
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
