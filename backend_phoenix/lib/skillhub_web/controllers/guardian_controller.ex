defmodule SkillHubWeb.GuardianController do
  @moduledoc """
  Ported guardian dashboard endpoints (guardians.py): list linked students,
  per-student dashboard (permission-gated), and the narrow accessibility patch.
  The invite lookup + accept-invite (which creates a guardian user with a
  password) stay proxied to Python until bcrypt lands.
  """
  use SkillHubWeb, :controller

  import SkillHubWeb.AuthHelpers
  alias SkillHub.SQL

  def list_students(conn, _params) do
    with {:ok, _} <- require_role(conn, "guardian") do
      links =
        SQL.json_all(
          "select to_jsonb(l) as row from public.guardian_links l where l.guardian_id = $1::uuid and l.is_active = true and l.is_verified = true order by l.created_at desc",
          [uid(conn)]
        )

      json(conn, %{success: true, links: Enum.map(links, &serialize_link(&1, true))})
    end
  end

  def student_dashboard(conn, %{"student_id" => student_id}) do
    with {:ok, _} <- require_role(conn, "guardian"),
         %{} = link <- load_link(uid(conn), student_id) do
      base = %{
        success: true,
        student: summarize_student(student_id),
        link: serialize_link(link, false),
        permissions: permissions(link)
      }

      json(conn, base |> add_progress(link, student_id) |> add_accessibility(link, student_id) |> add_conversations(link, student_id))
    else
      nil -> not_found(conn)
      other -> other
    end
  end

  def update_accessibility(conn, %{"student_id" => student_id} = params) do
    with {:ok, _} <- require_role(conn, "guardian"),
         %{} = link <- load_link(uid(conn), student_id) do
      if not truthy(link["can_modify_accessibility"]) do
        conn |> put_status(403) |> json(%{detail: "This guardian link does not permit modifying accessibility."})
      else
        updates = accessibility_updates(params)

        if map_size(updates) == 0 do
          json(conn, %{success: true, updated: 0})
        else
          upsert_accessibility(student_id, updates)
          notify_student(student_id)
          json(conn, %{success: true, updated: map_size(updates)})
        end
      end
    else
      nil -> not_found(conn)
      other -> other
    end
  end

  # ---- dashboard sections ---------------------------------------------------

  defp add_progress(base, link, student_id) do
    if truthy(link["can_view_progress"]) do
      enrollments =
        SQL.json_all(
          "select to_jsonb(e) as row from public.course_enrollments e where e.student_id = $1::uuid order by e.last_activity_at desc nulls last limit 20",
          [student_id]
        )

      summary = %{
        active: Enum.count(enrollments, &(&1["status"] == "active")),
        completed: Enum.count(enrollments, &(&1["status"] == "completed")),
        total: length(enrollments)
      }

      upcoming =
        safe_list(fn ->
          SQL.json_all(
            """
            select to_jsonb(s) as row from public.live_sessions s
            join public.session_participants sp on sp.session_id = s.id
            where sp.student_id = $1::uuid and s.scheduled_start >= now()
            order by s.scheduled_start asc limit 10
            """,
            [student_id]
          )
        end)

      base
      |> Map.put(:enrollments, enrollments)
      |> Map.put(:enrollment_summary, summary)
      |> Map.put(:upcoming_sessions, upcoming)
    else
      base
    end
  end

  defp add_accessibility(base, link, student_id) do
    if truthy(link["can_view_accessibility"]) do
      case SQL.json_one("select to_jsonb(a) as row from public.accessibility_preferences a where a.user_id = $1::uuid", [student_id]) do
        nil ->
          base

        p ->
          Map.put(base, :accessibility_summary, %{
            high_contrast: truthy(p["high_contrast"]),
            reduced_motion: truthy(p["reduced_motion"]),
            screen_reader_optimized: truthy(p["screen_reader_optimized"]),
            text_to_speech: truthy(p["text_to_speech"]),
            speech_to_text: truthy(p["speech_to_text"]),
            color_blind_mode: p["color_blind_mode"],
            font_family: p["font_family"],
            font_size: p["font_size"],
            active_preset: p["active_preset"]
          })
      end
    else
      base
    end
  end

  defp add_conversations(base, link, student_id) do
    if truthy(link["can_communicate_teachers"]) do
      convos =
        safe_list(fn ->
          SQL.json_all(
            "select to_jsonb(c) as row from public.conversations c where c.participant_ids @> array[$1::uuid] order by c.last_message_at desc nulls last limit 10",
            [student_id]
          )
        end)

      Map.put(base, :recent_conversations, convos)
    else
      base
    end
  end

  # ---- helpers --------------------------------------------------------------

  defp load_link(guardian_id, student_id) do
    SQL.json_one(
      "select to_jsonb(l) as row from public.guardian_links l where l.guardian_id = $1::uuid and l.student_id = $2::uuid and l.is_active = true and l.is_verified = true limit 1",
      [guardian_id, student_id]
    )
  end

  defp summarize_student(student_id) do
    row =
      SQL.one(
        """
        select u.email, p.first_name, p.last_name, p.avatar_url
        from public.users u left join public.user_profiles p on p.user_id = u.id
        where u.id = $1::uuid
        """,
        [student_id]
      ) || %{}

    first = row[:first_name] || ""
    last = row[:last_name] || ""
    name = String.trim("#{first} #{last}")
    name = if name == "", do: row[:email] || "Student", else: name

    %{id: student_id, name: name, first_name: first, last_name: last, email: row[:email], avatar_url: row[:avatar_url]}
  end

  defp serialize_link(link, include_student) do
    base = %{
      id: link["id"],
      student_id: link["student_id"],
      guardian_id: link["guardian_id"],
      guardian_email: link["guardian_email"],
      guardian_name: link["guardian_name"],
      guardian_phone: link["guardian_phone"],
      relationship: link["relationship"],
      can_view_progress: truthy(link["can_view_progress"]),
      can_view_grades: truthy(link["can_view_grades"]),
      can_view_accessibility: truthy(link["can_view_accessibility"]),
      can_communicate_teachers: truthy(link["can_communicate_teachers"]),
      can_modify_accessibility: truthy(link["can_modify_accessibility"]),
      receives_reports: truthy(link["receives_reports"]),
      report_frequency: link["report_frequency"],
      is_verified: truthy(link["is_verified"]),
      verified_at: link["verified_at"],
      is_active: truthy(link["is_active"]),
      invited_at: link["invited_at"],
      expires_at: link["expires_at"],
      created_at: link["created_at"]
    }

    if include_student and link["student_id"], do: Map.put(base, :student, summarize_student(link["student_id"])), else: base
  end

  defp permissions(link) do
    %{
      can_view_progress: truthy(link["can_view_progress"]),
      can_view_grades: truthy(link["can_view_grades"]),
      can_view_accessibility: truthy(link["can_view_accessibility"]),
      can_communicate_teachers: truthy(link["can_communicate_teachers"]),
      can_modify_accessibility: truthy(link["can_modify_accessibility"])
    }
  end

  @accessibility_fields ~w(high_contrast reduced_motion screen_reader_optimized text_to_speech speech_to_text font_size)

  defp accessibility_updates(params) do
    Map.take(params, @accessibility_fields) |> Enum.reject(fn {_k, v} -> is_nil(v) end) |> Map.new()
  end

  defp upsert_accessibility(student_id, updates) do
    exists = SQL.one("select id from public.accessibility_preferences where user_id = $1::uuid", [student_id])
    cols = Map.keys(updates)

    if exists do
      set = cols |> Enum.with_index(2) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}" end)
      SQL.maps("update public.accessibility_preferences set #{set}, updated_at = now() where user_id = $1::uuid", [student_id | Enum.map(cols, &updates[&1])])
    else
      ph = Enum.map_join(2..(length(cols) + 1), ", ", &"$#{&1}")
      SQL.maps("insert into public.accessibility_preferences (user_id, #{Enum.join(cols, ", ")}, created_at, updated_at) values ($1::uuid, #{ph}, now(), now())", [student_id | Enum.map(cols, &updates[&1])])
    end
  end

  defp notify_student(student_id) do
    try do
      SQL.maps(
        "insert into public.notifications (user_id, type, title, message, data) values ($1::uuid, $2::notification_type, $3, $4, $5::text::jsonb)",
        [student_id, "accessibility_updated_by_guardian", "Accessibility settings updated",
         "A guardian updated your accessibility settings. Open Settings to review.",
         Jason.encode!(%{link_url: "/students/settings/accessibility"})]
      )
    rescue
      _ -> :ok
    end
  end

  defp safe_list(fun) do
    try do
      fun.()
    rescue
      _ -> []
    end
  end

  defp truthy(true), do: true
  defp truthy(_), do: false

  defp uid(conn), do: conn.assigns.current_user_id
  defp not_found(conn), do: conn |> put_status(404) |> json(%{detail: "Guardian link not found."})
end
