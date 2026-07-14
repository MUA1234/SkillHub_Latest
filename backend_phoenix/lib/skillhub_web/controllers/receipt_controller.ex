defmodule SkillHubWeb.ReceiptController do
  @moduledoc """
  Ported payment-receipt PDF (students.py / teachers.py + receipt_service.py),
  rendered from HTML via headless Chrome. The receipt is for a `payments` row
  owned by the calling user.
  """
  use SkillHubWeb, :controller

  alias SkillHub.SQL

  def receipt(conn, %{"payment_id" => pid}) do
    user_id = conn.assigns.current_user_id

    row =
      SQL.one(
        """
        select p.id::text id, p.transaction_id, p.amount::float amount, coalesce(p.currency, 'LKR') currency,
          p.payment_type, p.payment_method, p.status, p.created_at,
          coalesce(c.title, e.title, s.title) service_name,
          coalesce(nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), ''), u.email, 'Student') student_name,
          u.email
        from public.payments p
        left join public.courses c on p.payment_type = 'course_enrollment' and p.reference_id = c.id
        left join public.events e on p.payment_type = 'event_registration' and p.reference_id = e.id
        left join public.live_sessions s on p.payment_type = 'session_booking' and p.reference_id = s.id
        left join public.users u on u.id = p.user_id
        left join public.user_profiles up on up.user_id = p.user_id
        where p.id = $1::uuid and p.user_id = $2::uuid
        """,
        [pid, user_id]
      )

    cond do
      is_nil(row) ->
        conn |> put_status(404) |> json(%{detail: "Payment not found."})

      true ->
        case SkillHub.PDF.render(receipt_html(row)) do
          {:ok, pdf} ->
            conn
            |> put_resp_content_type("application/pdf")
            |> put_resp_header("content-disposition", ~s(attachment; filename="receipt_#{row.transaction_id || row.id}.pdf"))
            |> put_resp_header("cache-control", "no-store")
            |> send_resp(200, pdf)

          {:error, :unavailable} ->
            conn |> put_status(503) |> json(%{detail: "PDF rendering unavailable (Chrome not found)."})

          {:error, _} ->
            conn |> put_status(500) |> json(%{detail: "Failed to render receipt."})
        end
    end
  end

  defp receipt_html(r) do
    desc = r.service_name || label_for(r.payment_type)
    amount = "#{r.currency} #{fmt_amount(r.amount)}"
    date = fmt_date(r.created_at)

    """
    <!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: A4; margin: 16mm; }
      body { font-family: "Segoe UI", Arial, sans-serif; color: #101828; margin: 0; }
      .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1570ef; padding-bottom:6mm; }
      .brand { font-size:22pt; font-weight:800; color:#1570ef; }
      .brand small { display:block; font-size:9pt; color:#98a2b3; font-weight:400; letter-spacing:1px; }
      .doc { text-align:right; }
      .doc h1 { font-size:16pt; margin:0; color:#344054; letter-spacing:2px; }
      .doc .status { display:inline-block; margin-top:2mm; padding:1mm 3mm; border-radius:4px; font-size:9pt; font-weight:700;
        background:#ecfdf3; color:#027a48; text-transform:uppercase; }
      .rows { margin-top:10mm; }
      .row { display:flex; justify-content:space-between; padding:3mm 0; border-bottom:1px solid #eaecf0; font-size:11pt; }
      .row .k { color:#667085; }
      .row .v { color:#101828; font-weight:600; text-align:right; }
      .total { margin-top:8mm; background:#f9fafb; border-radius:8px; padding:5mm 6mm; display:flex; justify-content:space-between; align-items:center; }
      .total .lbl { font-size:11pt; color:#667085; }
      .total .amt { font-size:22pt; font-weight:800; color:#1570ef; }
      .foot { margin-top:14mm; text-align:center; color:#98a2b3; font-size:9pt; border-top:1px solid #eaecf0; padding-top:5mm; }
    </style></head><body>
      <div class="head">
        <div class="brand">SkillHub<small>SRI LANKA</small></div>
        <div class="doc"><h1>RECEIPT</h1><div class="status">#{esc(r.status || "completed")}</div></div>
      </div>
      <div class="rows">
        <div class="row"><span class="k">Billed to</span><span class="v">#{esc(r.student_name)}</span></div>
        <div class="row"><span class="k">Email</span><span class="v">#{esc(r.email)}</span></div>
        <div class="row"><span class="k">Description</span><span class="v">#{esc(desc)}</span></div>
        <div class="row"><span class="k">Payment method</span><span class="v">#{esc(r.payment_method || "—")}</span></div>
        <div class="row"><span class="k">Transaction ID</span><span class="v">#{esc(r.transaction_id || r.id)}</span></div>
        <div class="row"><span class="k">Date</span><span class="v">#{esc(date)}</span></div>
      </div>
      <div class="total"><span class="lbl">Total paid</span><span class="amt">#{esc(amount)}</span></div>
      <div class="foot">Thank you for supporting inclusive education.<br/>SkillHub — inclusive education for every learner.</div>
    </body></html>
    """
  end

  defp label_for("course_enrollment"), do: "Course enrollment"
  defp label_for("event_registration"), do: "Event registration"
  defp label_for("session_booking"), do: "Live session booking"
  defp label_for(_), do: "SkillHub payment"

  defp fmt_amount(nil), do: "0"
  defp fmt_amount(n) do
    n |> trunc() |> Integer.to_string() |> String.reverse() |> String.replace(~r/(\d{3})(?=\d)/, "\\1,") |> String.reverse()
  end

  defp fmt_date(nil), do: ""
  defp fmt_date(%NaiveDateTime{} = d), do: Calendar.strftime(d, "%B %d, %Y")
  defp fmt_date(%DateTime{} = d), do: Calendar.strftime(d, "%B %d, %Y")
  defp fmt_date(s) when is_binary(s) do
    norm = String.replace(s, " ", "T")
    norm = if String.contains?(norm, "+") or String.ends_with?(norm, "Z"), do: norm, else: norm <> "Z"
    case DateTime.from_iso8601(norm) do
      {:ok, dt, _} -> Calendar.strftime(dt, "%B %d, %Y")
      _ -> s
    end
  end

  defp esc(nil), do: ""
  defp esc(s), do: s |> to_string() |> String.replace("&", "&amp;") |> String.replace("<", "&lt;") |> String.replace(">", "&gt;")
end
