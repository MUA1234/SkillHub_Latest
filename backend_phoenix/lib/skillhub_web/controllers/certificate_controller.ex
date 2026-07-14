defmodule SkillHubWeb.CertificateController do
  @moduledoc """
  Ported certificate endpoints (certificates.py + certificate_service.py). The
  PDF is rendered from HTML via headless Chrome (`SkillHub.PDF`), which shapes
  Sinhala/Tamil correctly — replacing the Python reportlab renderer.
  """
  use SkillHubWeb, :controller

  import SkillHubWeb.AuthHelpers
  alias SkillHub.SQL

  @copy %{
    "en" => %{title: "Certificate of Completion", intro: "This is to certify that", body: "has successfully completed the course", taught_by: "Taught by", issued_on: "Issued on", platform: "SkillHub Sri Lanka", tagline: "Inclusive education for every learner"},
    "si" => %{title: "සම්පූර්ණ කිරීමේ සහතිකය", intro: "මෙයින් සහතික කරනු ලබන්නේ", body: "පාඨමාලාව සාර්ථකව සම්පූර්ණ කර ඇත", taught_by: "ඉගැන්වූයේ", issued_on: "නිකුත් කළ දිනය", platform: "SkillHub ශ්‍රී ලංකා", tagline: "සෑම ඉගෙනුම්කරුවෙකුට අඩංගු අධ්‍යාපනය"},
    "ta" => %{title: "முடிவுச் சான்றிதழ்", intro: "இது சான்றளிக்கப்படுகிறது", body: "பாடநெறியை வெற்றிகரமாக முடித்துள்ளார்", taught_by: "கற்பித்தவர்", issued_on: "வழங்கப்பட்ட தேதி", platform: "SkillHub இலங்கை", tagline: "ஒவ்வொரு கற்பவருக்கும் உள்ளடக்கிய கல்வி"}
  }

  def list(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      rows =
        SQL.maps(
          """
          select e.id::text enrollment_id, c.id::text course_id, c.title course_title, e.completed_at, e.progress_percentage,
            coalesce(nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), ''), u.email, 'Instructor') teacher_name
          from public.course_enrollments e
          join public.courses c on c.id = e.course_id
          left join public.teacher_profiles tp on tp.id = c.teacher_id
          left join public.users u on u.id = tp.user_id
          left join public.user_profiles up on up.user_id = tp.user_id
          where e.student_id = $1::uuid and e.status = 'completed' order by e.completed_at desc nulls last
          """,
          [uid(conn)]
        )
        |> Enum.map(fn r -> Map.put(r, :certificate_id, cert_id(r.enrollment_id)) end)

      json(conn, %{success: true, certificates: rows})
    end
  end

  def download(conn, %{"enrollment_id" => eid} = params) do
    with {:ok, _} <- require_role(conn, "student") do
      row =
        SQL.one(
          """
          select e.id::text enrollment_id, e.student_id::text student_id, e.status, e.completed_at,
            c.title course_title,
            coalesce(nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), ''), u.email, 'Instructor') teacher_name,
            coalesce(nullif(trim(coalesce(sp.first_name,'') || ' ' || coalesce(sp.last_name,'')), ''), su.email, 'Student') student_name
          from public.course_enrollments e
          join public.courses c on c.id = e.course_id
          left join public.teacher_profiles tp on tp.id = c.teacher_id
          left join public.users u on u.id = tp.user_id
          left join public.user_profiles up on up.user_id = tp.user_id
          left join public.users su on su.id = e.student_id
          left join public.user_profiles sp on sp.user_id = e.student_id
          where e.id = $1::uuid
          """,
          [eid]
        )

      cond do
        is_nil(row) -> conn |> put_status(404) |> json(%{detail: "Enrollment not found."})
        row.student_id != uid(conn) -> conn |> put_status(403) |> json(%{detail: "Not your enrollment."})
        row.status != "completed" -> conn |> put_status(400) |> json(%{detail: "Course not completed yet."})
        true ->
          lang = params["lang"] || student_lang(uid(conn))
          html = certificate_html(row, lang)

          case SkillHub.PDF.render(html, landscape: true) do
            {:ok, pdf} ->
              conn
              |> put_resp_content_type("application/pdf")
              |> put_resp_header("content-disposition", ~s(attachment; filename="skillhub-certificate-#{cert_id(eid)}.pdf"))
              |> put_resp_header("cache-control", "no-store")
              |> send_resp(200, pdf)

            {:error, :unavailable} ->
              conn |> put_status(503) |> json(%{detail: "PDF rendering unavailable (Chrome not found)."})

            {:error, _} ->
              conn |> put_status(500) |> json(%{detail: "Failed to render certificate."})
          end
      end
    end
  end

  # --- html ------------------------------------------------------------------

  defp certificate_html(row, lang) do
    c = Map.get(@copy, lang, @copy["en"])
    en = @copy["en"]
    date = format_date(row.completed_at)
    id = cert_id(row.enrollment_id)

    """
    <!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Georgia", "Noto Serif", serif; }
      .frame { width: 297mm; height: 210mm; padding: 14mm; }
      .border { height: 100%; border: 3px solid #b8860b; border-radius: 10px; padding: 10mm 18mm;
        background: linear-gradient(135deg,#fffdf7,#fdf6e3); position: relative; text-align: center; }
      .border:before { content:""; position:absolute; inset:5mm; border:1px solid #d4af37; border-radius:6px; }
      .brand { font-family:"Segoe UI",sans-serif; letter-spacing:3px; color:#1570ef; font-weight:700; font-size:15pt; text-transform:uppercase; }
      .title { font-size:30pt; color:#b8860b; margin:6mm 0 2mm; font-weight:700; }
      .title-en { font-size:13pt; color:#8a6d1b; letter-spacing:2px; text-transform:uppercase; }
      .intro { margin-top:9mm; font-size:13pt; color:#475467; }
      .name { font-size:34pt; color:#101828; margin:3mm 0; font-family:"Brush Script MT","Segoe Script",cursive; }
      .name-underline { width:120mm; margin:0 auto; border-bottom:1px solid #d0d5dd; }
      .body { margin-top:5mm; font-size:13pt; color:#475467; }
      .course { font-size:19pt; color:#1570ef; font-weight:700; margin-top:3mm; }
      .meta { margin-top:12mm; display:flex; justify-content:space-between; padding:0 6mm; font-family:"Segoe UI",sans-serif; }
      .meta div { font-size:11pt; color:#344054; }
      .meta .label { font-size:8.5pt; color:#98a2b3; text-transform:uppercase; letter-spacing:1px; }
      .sig { border-top:1px solid #98a2b3; padding-top:2mm; min-width:60mm; }
      .footer { margin-top:8mm; font-family:"Segoe UI",sans-serif; }
      .platform { color:#b8860b; font-weight:700; font-size:12pt; }
      .tagline { color:#98a2b3; font-size:9pt; }
      .cid { position:absolute; bottom:6mm; right:12mm; font-family:"Segoe UI",monospace; font-size:8pt; color:#b0b0b0; }
      :lang(si), .si { font-family:"Noto Sans Sinhala","Nirmala UI",sans-serif; }
      :lang(ta), .ta { font-family:"Noto Sans Tamil","Nirmala UI",sans-serif; }
    </style></head>
    <body><div class="frame"><div class="border">
      <div class="brand">SkillHub</div>
      <div class="title #{lang}" lang="#{lang}">#{esc(c.title)}</div>
      #{if lang != "en", do: ~s(<div class="title-en">#{esc(en.title)}</div>), else: ""}
      <div class="intro #{lang}" lang="#{lang}">#{esc(c.intro)}</div>
      <div class="name">#{esc(row.student_name)}</div>
      <div class="name-underline"></div>
      <div class="body #{lang}" lang="#{lang}">#{esc(c.body)}</div>
      <div class="course">#{esc(row.course_title)}</div>
      <div class="meta">
        <div class="sig"><div class="label #{lang}">#{esc(c.taught_by)}</div>#{esc(row.teacher_name)}</div>
        <div class="sig"><div class="label #{lang}">#{esc(c.issued_on)}</div>#{esc(date)}</div>
      </div>
      <div class="footer"><div class="platform #{lang}">#{esc(c.platform)}</div><div class="tagline #{lang}">#{esc(c.tagline)}</div></div>
      <div class="cid">#{id}</div>
    </div></div></body></html>
    """
  end

  # --- helpers ---------------------------------------------------------------

  defp cert_id(enrollment_id) do
    hex = enrollment_id |> String.replace("-", "") |> String.slice(0, 12) |> String.upcase()
    "SH-#{hex}"
  end

  defp student_lang(user_id) do
    case SQL.one("select preferred_language from public.language_preferences where user_id = $1::uuid", [user_id]) do
      %{preferred_language: l} when l in ["en", "si", "ta"] -> l
      _ -> "en"
    end
  end

  defp format_date(nil), do: Date.utc_today() |> Calendar.strftime("%B %d, %Y")
  defp format_date(%Date{} = d), do: Calendar.strftime(d, "%B %d, %Y")
  defp format_date(%NaiveDateTime{} = dt), do: Calendar.strftime(dt, "%B %d, %Y")
  defp format_date(%DateTime{} = dt), do: Calendar.strftime(dt, "%B %d, %Y")
  defp format_date(s) when is_binary(s) do
    case DateTime.from_iso8601(String.replace(s, " ", "T") <> tz(s)) do
      {:ok, dt, _} -> Calendar.strftime(dt, "%B %d, %Y")
      _ -> s
    end
  end

  defp tz(s), do: if(String.contains?(s, "+") or String.ends_with?(s, "Z"), do: "", else: "Z")

  defp esc(nil), do: ""
  defp esc(s), do: s |> to_string() |> String.replace("&", "&amp;") |> String.replace("<", "&lt;") |> String.replace(">", "&gt;")

  defp uid(conn), do: conn.assigns.current_user_id
end
