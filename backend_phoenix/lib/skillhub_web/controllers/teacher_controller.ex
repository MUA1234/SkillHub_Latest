defmodule SkillHubWeb.TeacherController do
  @moduledoc """
  Ported teacher hub (teachers.py). Built out incrementally; unlisted routes
  fall through to Python via the strangler. Many teacher writes were no-ops in
  Python (SQLAlchemy shim) — the port makes them persist.
  """
  use SkillHubWeb, :controller

  import SkillHubWeb.AuthHelpers
  alias SkillHub.SQL

  # Resolve the caller's teacher_profiles row (or {:error, conn}).
  def teacher_profile(conn) do
    with {:ok, _} <- require_role(conn, "teacher") do
      case SQL.json_one("select to_jsonb(tp) as row from public.teacher_profiles tp where tp.user_id = $1::uuid", [uid(conn)]) do
        nil -> {:error, conn |> put_status(404) |> json(%{detail: "Teacher profile not set up yet."})}
        profile -> {:ok, profile}
      end
    end
  end

  # ---- profile --------------------------------------------------------------

  def profile(conn, _params) do
    with {:ok, tp} <- teacher_profile(conn) do
      tid = tp["id"]
      up = SQL.one("select first_name, last_name, avatar_url from public.user_profiles where user_id = $1::uuid", [uid(conn)]) || %{}

      counts =
        SQL.one(
          """
          select
            (select count(*) from public.courses where teacher_id = $1::uuid)::int total_courses,
            (select count(distinct e.student_id) from public.course_enrollments e join public.courses c on c.id = e.course_id where c.teacher_id = $1::uuid)::int total_students,
            (select count(*) from public.live_sessions where teacher_id = $1::uuid and status in ('scheduled','live'))::int active_sessions,
            (select count(*) from public.live_sessions where teacher_id = $1::uuid and status = 'completed')::int completed_sessions
          """,
          [tid]
        )

      name = String.trim("#{up[:first_name] || ""} #{up[:last_name] || ""}")

      json(conn, %{
        success: true,
        profile: %{
          id: tid, user_id: uid(conn), name: (if name == "", do: "Teacher", else: name), avatar_url: up[:avatar_url],
          experience_years: tp["experience_years"] || 0, hourly_rate: tp["hourly_rate"] || 0,
          average_rating: tp["average_rating"] || 0, total_reviews: tp["total_reviews"] || 0,
          is_verified: tp["is_verified"] || false, specialization: tp["specialization"] || "General"
        },
        stats: %{
          total_students: (if counts.total_students > 0, do: counts.total_students, else: tp["total_students"] || 0),
          total_courses: counts.total_courses, active_sessions: counts.active_sessions, completed_sessions: counts.completed_sessions,
          total_earnings: 0, monthly_earnings: 0, this_month_earnings: 0,
          average_rating: numf(tp["average_rating"]), total_reviews: tp["total_reviews"] || 0
        },
        subjects: [], recent_reviews: []
      })
    end
  end

  # ---- sessions -------------------------------------------------------------

  def sessions(conn, _params) do
    with {:ok, tp} <- teacher_profile(conn) do
      sessions = SQL.json_all("select to_jsonb(s) as row from public.live_sessions s where s.teacher_id = $1::uuid order by s.scheduled_start desc nulls last limit 50", [tp["id"]])

      json(conn, %{
        success: true, sessions: sessions, total_count: length(sessions),
        upcoming_count: Enum.count(sessions, &(&1["status"] == "scheduled")),
        completed_count: Enum.count(sessions, &(&1["status"] == "completed"))
      })
    end
  end

  # ---- courses --------------------------------------------------------------

  def courses(conn, _params) do
    with {:ok, tp} <- teacher_profile(conn) do
      courses = SQL.json_all("select to_jsonb(c) as row from public.courses c where c.teacher_id = $1::uuid order by c.created_at desc limit 100", [tp["id"]])

      formatted =
        Enum.map(courses, fn c ->
          %{
            id: c["id"], title: c["title"] || "Untitled Course", description: c["description"] || "",
            status: c["status"] || "draft", price: numf(c["price"]), thumbnail_url: c["thumbnail_url"],
            level: c["level"] || "beginner", duration_hours: c["duration_hours"] || 0, is_featured: c["is_featured"] || false,
            created_at: c["created_at"], updated_at: c["updated_at"], total_lessons: c["total_lessons"] || 0,
            total_students: c["total_students"] || 0, average_rating: numf(c["average_rating"]), total_reviews: c["total_reviews"] || 0
          }
        end)

      json(conn, %{
        success: true, courses: formatted, total_count: length(courses),
        active_count: Enum.count(courses, &(&1["status"] == "published")),
        draft_count: Enum.count(courses, &(&1["status"] == "draft")),
        published_count: Enum.count(courses, &(&1["status"] == "published")),
        archived_count: Enum.count(courses, &(&1["status"] == "archived"))
      })
    end
  end

  @course_cols ~w(title description subject_id level duration_weeks price original_price max_students status thumbnail_url is_featured tags)

  def create_course(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      provided = for c <- @course_cols, Map.has_key?(params, c) and not is_nil(params[c]), do: {c, params[c]}
      # force a valid default status if none supplied
      provided = if Enum.any?(provided, fn {c, _} -> c == "status" end), do: provided, else: provided ++ [{"status", "draft"}]
      cols = Enum.map(provided, &elem(&1, 0))
      vals = Enum.map(provided, &elem(&1, 1))

      ph =
        cols
        |> Enum.with_index(2)
        |> Enum.map(fn {c, i} ->
          case c do
            "subject_id" -> "$#{i}::uuid"
            "status" -> "$#{i}::text::course_status"
            "tags" -> "$#{i}::text[]"
            _ -> "$#{i}"
          end
        end)

      id = SQL.scalar("insert into public.courses (#{Enum.join(["teacher_id" | cols], ", ")}) values ($1::uuid, #{Enum.join(ph, ", ")}) returning id::text", [tp["id"] | vals])
      json(conn, %{success: true, message: "Course created successfully", data: %{id: id}})
    end
  end

  def courses_list(conn, _params) do
    with {:ok, tp} <- teacher_profile(conn) do
      rows = SQL.maps("select id::text, title, status from public.courses where teacher_id = $1::uuid order by created_at desc", [tp["id"]])
      json(conn, rows)
    end
  end

  # ---- notifications --------------------------------------------------------

  def notifications(conn, _params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      notifications = SQL.json_all("select to_jsonb(n) as row from public.notifications n where n.user_id = $1::uuid order by n.created_at desc limit 50", [uid(conn)])
      unread = Enum.count(notifications, &(not (&1["is_read"] || false)))
      json(conn, %{success: true, notifications: notifications, unread_count: unread})
    end
  end

  def mark_notification_read(conn, %{"notification_id" => id}) do
    with {:ok, _} <- require_role(conn, "teacher") do
      SQL.maps("update public.notifications set is_read = true where id = $1::uuid and user_id = $2::uuid", [id, uid(conn)])
      json(conn, %{success: true})
    end
  end

  def mark_all_notifications_read(conn, _params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      SQL.maps("update public.notifications set is_read = true where user_id = $1::uuid and is_read = false", [uid(conn)])
      json(conn, %{success: true})
    end
  end

  # ---- subjects -------------------------------------------------------------

  def subjects(conn, _params) do
    with {:ok, tp} <- teacher_profile(conn) do
      rows =
        SQL.maps(
          """
          select ts.id::text, ts.subject_id::text, ts.proficiency_level, s.name subject_name, s.category subject_category, ts.created_at
          from public.teacher_subjects ts left join public.subjects s on s.id = ts.subject_id
          where ts.teacher_id = $1::uuid order by ts.created_at
          """,
          [tp["id"]]
        )

      json(conn, rows)
    end
  end

  # ---- students -------------------------------------------------------------

  def students(conn, _params) do
    with {:ok, tp} <- teacher_profile(conn) do
      rows =
        SQL.maps(
          """
          select e.student_id::text student_id, u.email, up.first_name, up.last_name, up.avatar_url, up.location, up.university,
            c.id::text course_id, c.title course_title, c.level, coalesce(e.progress_percentage, 0) progress, e.status, e.enrolled_at
          from public.course_enrollments e
          join public.courses c on c.id = e.course_id and c.teacher_id = $1::uuid
          join public.users u on u.id = e.student_id
          left join public.user_profiles up on up.user_id = e.student_id
          order by e.enrolled_at desc limit 500
          """,
          [tp["id"]]
        )

      students =
        rows
        |> Enum.group_by(& &1.student_id)
        |> Enum.map(fn {sid, es} ->
          first = hd(es)
          courses = Enum.map(es, &%{id: &1.course_id, title: &1.course_title || "Unknown Course", level: &1.level || "beginner", progress: &1.progress, status: &1.status || "active", enrolled_at: &1.enrolled_at})
          avg = if courses == [], do: 0, else: Float.round(Enum.sum(Enum.map(courses, & &1.progress)) / length(courses), 1)
          status = if Enum.any?(courses, &(&1.status == "active")), do: "active", else: "inactive"

          %{
            id: sid, email: first.email || "", first_name: first.first_name || "", last_name: first.last_name || "",
            avatar_url: first.avatar_url, location: first.location, university: first.university,
            courses: courses, total_courses: length(courses), average_progress: avg, status: status, enrolled_at: first.enrolled_at
          }
        end)

      json(conn, %{
        success: true, students: students, total_count: length(students),
        active_count: Enum.count(students, &(&1.status == "active")),
        inactive_count: Enum.count(students, &(&1.status != "active")),
        page: 1, limit: 100, total_pages: 1
      })
    end
  end

  # ---- schedule -------------------------------------------------------------

  def schedule(conn, _params) do
    with {:ok, tp} <- teacher_profile(conn) do
      sessions = SQL.json_all("select to_jsonb(s) as row from public.live_sessions s where s.teacher_id = $1::uuid order by s.scheduled_start desc nulls last limit 100", [tp["id"]])

      views =
        Enum.map(sessions, fn s ->
          %{
            id: s["id"], title: s["title"] || "Untitled Session", description: s["description"] || "",
            type: s["session_type"] || "live_session", mode: s["session_mode"] || "online",
            start_time: s["scheduled_start"], end_time: s["scheduled_end"], status: s["status"] || "scheduled",
            meeting_link: s["meeting_link"], location: s["location"], max_participants: s["max_participants"] || 10,
            current_participants: s["current_participants"] || 0, is_recurring: s["is_recurring"] || false,
            course_id: s["course_id"], created_at: s["created_at"]
          }
        end)

      appointments = Enum.filter(views, &(&1.status in ["scheduled", "live"]))
      completed = Enum.filter(views, &(&1.status == "completed"))

      json(conn, %{
        success: true, appointments: appointments, availability_blocks: [], regular_sessions: completed,
        templates: [%{id: "template_default", name: "Standard Week", description: "Default availability template", is_default: true}],
        analytics: %{
          total_appointments: length(appointments), upcoming_appointments: Enum.count(appointments, &(&1.status == "scheduled")),
          completed_appointments: length(completed), cancelled_appointments: 0, available_time_blocks: 0,
          booked_time_blocks: length(appointments), utilization_rate: 0.0, average_appointment_duration: 60.0
        }
      })
    end
  end

  # ---- sessions CRUD --------------------------------------------------------

  @session_cols ~w(course_id title description session_type session_mode scheduled_start scheduled_end status meeting_link location max_participants recording_enabled is_recurring recurrence_pattern)

  def create_session(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      {cols, vals} = session_columns(params)
      # status is forced to 'scheduled' on create; drop any client-supplied status.
      provided = Enum.reject(Enum.zip(cols, vals), fn {c, _} -> c == "status" end)
      cols2 = Enum.map(provided, &elem(&1, 0))
      vals2 = Enum.map(provided, &elem(&1, 1))
      base = ["id", "teacher_id", "status", "current_participants"]
      ph = ["gen_random_uuid()", "$1::uuid", "'scheduled'", "0"] ++ session_placeholders(cols2, 2)

      id = SQL.scalar("insert into public.live_sessions (#{Enum.join(base ++ cols2, ", ")}) values (#{Enum.join(ph, ", ")}) returning id::text", [tp["id"] | vals2])

      notify_enrolled(params["course_id"], params["title"] || "a new live session", id)
      json(conn, %{message: "Session created successfully", session_id: id})
    end
  end

  def update_session(conn, %{"session_id" => id} = params) do
    with {:ok, tp} <- teacher_profile(conn),
         true <- owns_session?(id, tp["id"]) do
      {cols, vals} = session_columns(params)

      if cols == [] do
        json(conn, %{message: "Session updated successfully"})
      else
        set = session_placeholders(cols, 2) |> Enum.zip(cols) |> Enum.map_join(", ", fn {ph, c} -> "#{c} = #{ph}" end)
        SQL.maps("update public.live_sessions set #{set} where id = $1::uuid", [id | vals])
        json(conn, %{message: "Session updated successfully"})
      end
    else
      false -> not_found(conn, "Session not found")
      other -> other
    end
  end

  def update_session_status(conn, %{"session_id" => id} = params) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(id, tp["id"]) do
      SQL.maps("update public.live_sessions set status = $2 where id = $1::uuid", [id, params["status"]])
      json(conn, %{message: "Session status updated"})
    else
      false -> not_found(conn, "Session not found")
      other -> other
    end
  end

  def delete_session(conn, %{"session_id" => id}) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(id, tp["id"]) do
      SQL.maps("delete from public.session_participants where session_id = $1::uuid", [id])
      SQL.maps("delete from public.live_sessions where id = $1::uuid", [id])
      json(conn, %{message: "Session deleted successfully"})
    else
      false -> not_found(conn, "Session not found")
      other -> other
    end
  end

  defp session_columns(params) do
    Enum.reduce(@session_cols, {[], []}, fn c, {cols, vals} ->
      if Map.has_key?(params, c) and not is_nil(params[c]), do: {cols ++ [c], vals ++ [params[c]]}, else: {cols, vals}
    end)
  end

  defp session_placeholders(cols, start) do
    cols
    |> Enum.with_index(start)
    |> Enum.map(fn {c, i} ->
      case c do
        "scheduled_start" -> "$#{i}::text::timestamp"
        "scheduled_end" -> "$#{i}::text::timestamp"
        "course_id" -> "$#{i}::uuid"
        _ -> "$#{i}"
      end
    end)
  end

  defp owns_session?(id, tid), do: not is_nil(SQL.one("select id from public.live_sessions where id = $1::uuid and teacher_id = $2::uuid", [id, tid]))

  defp notify_enrolled(nil, _title, _sid), do: :ok
  defp notify_enrolled(course_id, title, sid) do
    try do
      SQL.maps(
        """
        insert into public.notifications (user_id, type, title, message, data)
        select e.student_id, 'live_session_scheduled'::notification_type, 'New live session scheduled', $2, $3::text::jsonb
        from public.course_enrollments e where e.course_id = $1::uuid and e.status = 'active' limit 500
        """,
        [course_id, "'#{title}' is now open for enrollment.", Jason.encode!(%{link_url: "/students/live-sessions", related_entity_id: sid})]
      )
    rescue
      _ -> :ok
    end

    :ok
  end

  # ---- students actions -----------------------------------------------------

  def update_student_progress(conn, %{"student_id" => student_id} = params) do
    with {:ok, tp} <- teacher_profile(conn) do
      pct = int(params["progress_percentage"], -1)

      cond do
        pct < 0 or pct > 100 -> conn |> put_status(400) |> json(%{detail: "progress_percentage must be 0-100"})
        true ->
          {count, _} =
            {SQL.scalar(
               """
               with upd as (
                 update public.course_enrollments set progress_percentage = $2, last_accessed = now()
                 where student_id = $1::uuid and course_id in (select id from public.courses where teacher_id = $3::uuid)
                 returning 1)
               select count(*)::int from upd
               """,
               [student_id, pct, tp["id"]], 0
             ), nil}

          if count > 0 do
            json(conn, %{success: true, message: "Student progress updated successfully", data: %{student_id: student_id, progress_percentage: pct, updated_at: DateTime.to_iso8601(DateTime.utc_now())}})
          else
            conn |> put_status(404) |> json(%{detail: "Enrollment not found"})
          end
      end
    end
  end

  # ---- events ---------------------------------------------------------------

  def events(conn, _params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      events = SQL.json_all("select to_jsonb(e) as row from public.events e where e.organizer_id = $1::uuid order by e.start_date desc nulls last", [uid(conn)])

      c =
        SQL.one(
          """
          select count(*)::int total,
            count(*) filter (where start_date > now())::int upcoming,
            count(*) filter (where end_date < now())::int past,
            count(*) filter (where date_trunc('month', start_date) = date_trunc('month', now()))::int this_month,
            coalesce(sum(current_attendees), 0)::int participants
          from public.events where organizer_id = $1::uuid
          """,
          [uid(conn)]
        )

      json(conn, %{events: events, total_count: c.total, upcoming_count: c.upcoming, past_count: c.past, this_month_count: c.this_month, my_events_count: c.total, total_participants: c.participants})
    end
  end

  # ---- events CRUD ----------------------------------------------------------

  @tevent_cols ~w(title description category start_date end_date location is_online price max_attendees image_url tags level has_certificate sponsor is_featured)

  def create_event(conn, params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      {cols, vals} = tevent_columns(params)
      ph = ["gen_random_uuid()", "$1::uuid", "0"] ++ tevent_placeholders(cols, 2)
      id = SQL.scalar("insert into public.events (#{Enum.join(["id", "organizer_id", "current_attendees"] ++ cols, ", ")}) values (#{Enum.join(ph, ", ")}) returning id::text", [uid(conn) | vals])
      json(conn, event_full(id))
    end
  end

  def get_event(conn, %{"event_id" => id}) do
    with {:ok, _} <- require_role(conn, "teacher") do
      case SQL.json_one("select to_jsonb(e) as row from public.events e where e.id = $1::uuid and e.organizer_id = $2::uuid", [id, uid(conn)]) do
        nil -> not_found(conn, "Event not found")
        e -> json(conn, e)
      end
    end
  end

  def update_event(conn, %{"event_id" => id} = params) do
    with {:ok, _} <- require_role(conn, "teacher"), true <- owns_event?(id, uid(conn)) do
      {cols, vals} = tevent_columns(params)

      if cols != [] do
        set = tevent_placeholders(cols, 2) |> Enum.zip(cols) |> Enum.map_join(", ", fn {ph, c} -> "#{c} = #{ph}" end)
        SQL.maps("update public.events set #{set} where id = $1::uuid", [id | vals])
      end

      json(conn, event_full(id))
    else
      false -> not_found(conn, "Event not found")
      other -> other
    end
  end

  def delete_event(conn, %{"event_id" => id}) do
    with {:ok, _} <- require_role(conn, "teacher"), true <- owns_event?(id, uid(conn)) do
      SQL.maps("delete from public.event_registrations where event_id = $1::uuid", [id])
      SQL.maps("delete from public.events where id = $1::uuid", [id])
      json(conn, %{message: "Event deleted successfully"})
    else
      false -> not_found(conn, "Event not found")
      other -> other
    end
  end

  @event_categories [
    {"workshop", "Workshops", "Hands-on learning sessions", "blue", "BookOpen"},
    {"webinar", "Webinars", "Online educational presentations", "green", "Monitor"},
    {"conference", "Conferences", "Large-scale educational gatherings", "purple", "Users"},
    {"bootcamp", "Bootcamps", "Intensive training programs", "orange", "Zap"},
    {"seminar", "Seminars", "Academic presentations and discussions", "teal", "GraduationCap"},
    {"networking", "Networking", "Professional networking events", "pink", "Coffee"}
  ]

  def event_categories(conn, _params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      counts = SQL.maps("select category::text category, count(*)::int c from public.events where organizer_id = $1::uuid group by 1", [uid(conn)]) |> Map.new(&{&1.category, &1.c})
      total = SQL.scalar("select count(*)::int from public.events where organizer_id = $1::uuid", [uid(conn)], 0)
      cats = Enum.map(@event_categories, fn {id, name, desc, color, icon} -> %{id: id, name: name, description: desc, color: color, icon: icon, count: Map.get(counts, id, 0)} end)
      json(conn, %{categories: cats, total_events: total})
    end
  end

  def create_event_category(conn, _params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      json(conn, %{success: true, message: "Categories are predefined"})
    end
  end

  @event_templates [
    %{id: "workshop_template", name: "Workshop Template", description: "Standard workshop format", category: "workshop", duration_hours: 3, max_attendees: 25, is_online: false, has_certificate: true, price: 0},
    %{id: "webinar_template", name: "Webinar Template", description: "Online presentation format", category: "webinar", duration_hours: 1.5, max_attendees: 100, is_online: true, has_certificate: false, price: 0},
    %{id: "bootcamp_template", name: "Bootcamp Template", description: "Intensive multi-day training", category: "bootcamp", duration_hours: 24, max_attendees: 15, is_online: false, has_certificate: true, price: 299}
  ]

  def event_templates(conn, _params) do
    with {:ok, _} <- require_role(conn, "teacher"), do: json(conn, %{templates: @event_templates})
  end

  def event_from_template(conn, params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      tpl = Enum.find(@event_templates, &(&1.id == params["template_id"])) || %{}
      merged = Map.merge(%{"category" => tpl[:category], "max_attendees" => tpl[:max_attendees], "is_online" => tpl[:is_online], "has_certificate" => tpl[:has_certificate], "price" => tpl[:price]}, Map.drop(params, ["template_id"]))
      {cols, vals} = tevent_columns(merged)
      ph = ["gen_random_uuid()", "$1::uuid", "0"] ++ tevent_placeholders(cols, 2)
      id = SQL.scalar("insert into public.events (#{Enum.join(["id", "organizer_id", "current_attendees"] ++ cols, ", ")}) values (#{Enum.join(ph, ", ")}) returning id::text", [uid(conn) | vals])
      json(conn, event_full(id))
    end
  end

  def event_status(conn, %{"event_id" => id} = params) do
    with {:ok, _} <- require_role(conn, "teacher"), true <- owns_event?(id, uid(conn)) do
      # events has no status column; a "published/featured" toggle maps to is_featured.
      featured = params["status"] in ["published", "active", "featured", true]
      SQL.maps("update public.events set is_featured = $2 where id = $1::uuid", [id, featured])
      json(conn, %{success: true, message: "Event status updated"})
    else
      false -> not_found(conn, "Event not found")
      other -> other
    end
  end

  def event_archive(conn, %{"event_id" => id}) do
    with {:ok, _} <- require_role(conn, "teacher"), true <- owns_event?(id, uid(conn)) do
      SQL.maps("update public.events set is_featured = false where id = $1::uuid", [id])
      json(conn, %{success: true, message: "Event archived"})
    else
      false -> not_found(conn, "Event not found")
      other -> other
    end
  end

  def event_registrations(conn, %{"event_id" => id}) do
    with {:ok, _} <- require_role(conn, "teacher"), true <- owns_event?(id, uid(conn)) do
      regs =
        SQL.maps(
          """
          select r.id::text id, r.user_id::text user_id, r.attendance_status, r.registration_date,
            nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') name, u.email
          from public.event_registrations r
          left join public.users u on u.id = r.user_id
          left join public.user_profiles up on up.user_id = r.user_id
          where r.event_id = $1::uuid order by r.registration_date desc
          """,
          [id]
        )

      json(conn, %{success: true, registrations: regs, total: length(regs)})
    else
      false -> not_found(conn, "Event not found")
      other -> other
    end
  end

  def add_event_registration(conn, %{"event_id" => id} = params) do
    with {:ok, _} <- require_role(conn, "teacher"), true <- owns_event?(id, uid(conn)) do
      student_id = params["user_id"] || params["student_id"]

      if is_nil(student_id) do
        conn |> put_status(400) |> json(%{detail: "user_id is required"})
      else
        rid = SQL.scalar("insert into public.event_registrations (id, event_id, user_id, attendance_status, registration_date) values (gen_random_uuid(), $1::uuid, $2::uuid, 'registered', now()) returning id::text", [id, student_id])
        json(conn, %{success: true, registration_id: rid})
      end
    else
      false -> not_found(conn, "Event not found")
      other -> other
    end
  end

  def event_analytics(conn, %{"event_id" => id}) do
    with {:ok, _} <- require_role(conn, "teacher"), true <- owns_event?(id, uid(conn)) do
      e = SQL.json_one("select to_jsonb(e) as row from public.events e where e.id = $1::uuid", [id])
      regs = SQL.scalar("select count(*)::int from public.event_registrations where event_id = $1::uuid", [id], 0)
      cap = e["max_attendees"] || 0
      fill = if cap > 0, do: Float.round(regs / cap * 100, 1), else: 0

      json(conn, %{success: true, data: %{event_id: id, total_registrations: regs, current_attendees: e["current_attendees"] || 0, max_attendees: cap, fill_rate: fill, revenue: numf(e["price"]) * regs}})
    else
      false -> not_found(conn, "Event not found")
      other -> other
    end
  end

  def event_promotional_material(conn, %{"event_id" => id}) do
    with {:ok, _} <- require_role(conn, "teacher"), true <- owns_event?(id, uid(conn)) do
      e = SQL.json_one("select to_jsonb(e) as row from public.events e where e.id = $1::uuid", [id])
      title = e["title"] || "Event"

      json(conn, %{
        success: true,
        data: %{
          social_post: "🎓 Join us for #{title}! #{e["description"] || ""} Register now on SkillHub.",
          email_subject: "You're invited: #{title}",
          short_link: "/students/events",
          hashtags: ["#SkillHub", "#Learning", "##{String.replace(to_string(e["category"] || "event"), " ", "")}"]
        }
      })
    else
      false -> not_found(conn, "Event not found")
      other -> other
    end
  end

  defp tevent_columns(params) do
    Enum.reduce(@tevent_cols, {[], []}, fn c, {cols, vals} ->
      if Map.has_key?(params, c) and not is_nil(params[c]), do: {cols ++ [c], vals ++ [params[c]]}, else: {cols, vals}
    end)
  end

  defp tevent_placeholders(cols, start) do
    cols
    |> Enum.with_index(start)
    |> Enum.map(fn {c, i} ->
      case c do
        "category" -> "$#{i}::text::event_category"
        "start_date" -> "$#{i}::text::timestamp"
        "end_date" -> "$#{i}::text::timestamp"
        "tags" -> "$#{i}::text[]"
        _ -> "$#{i}"
      end
    end)
  end

  defp owns_event?(id, user_id), do: not is_nil(SQL.one("select id from public.events where id = $1::uuid and organizer_id = $2::uuid", [id, user_id]))
  defp event_full(id), do: SQL.json_one("select to_jsonb(e) as row from public.events e where e.id = $1::uuid", [id])

  # ---- sponsorship ----------------------------------------------------------

  def sponsorship(conn, _params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      requests = SQL.json_all("select to_jsonb(r) as row from public.sponsorship_requests r where r.teacher_id = $1::uuid order by r.submitted_at desc nulls last", [uid(conn)])

      stat = fn s -> Enum.count(requests, &(&1["status"] == s)) end
      sum = fn filter -> requests |> Enum.filter(filter) |> Enum.reduce(0.0, &(&2 + numf(&1["amount_requested"]))) end

      json(conn, %{
        requests: requests, total_count: length(requests),
        pending_count: stat.("pending"), approved_count: stat.("approved"), rejected_count: stat.("rejected"),
        total_requested: sum.(fn _ -> true end), total_approved: sum.(&(&1["status"] == "approved"))
      })
    end
  end

  def create_sponsorship(conn, params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      id =
        SQL.scalar(
          "insert into public.sponsorship_requests (id, teacher_id, title, description, amount_requested, students_impacted, status, submitted_at) values (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, 'pending', now()) returning id::text",
          [uid(conn), params["title"], params["description"], numf(params["amount_requested"]), params["students_impacted"] || 0]
        )

      json(conn, sponsorship_full(id))
    end
  end

  def get_sponsorship(conn, %{"request_id" => id}) do
    with {:ok, _} <- require_role(conn, "teacher") do
      case SQL.json_one("select to_jsonb(r) as row from public.sponsorship_requests r where r.id = $1::uuid and r.teacher_id = $2::uuid", [id, uid(conn)]) do
        nil -> not_found(conn, "Sponsorship request not found")
        r -> json(conn, r)
      end
    end
  end

  def update_sponsorship(conn, %{"request_id" => id} = params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      case SQL.json_one("select to_jsonb(r) as row from public.sponsorship_requests r where r.id = $1::uuid and r.teacher_id = $2::uuid", [id, uid(conn)]) do
        nil -> not_found(conn, "Sponsorship request not found")
        %{"status" => st} when st != "pending" -> conn |> put_status(400) |> json(%{detail: "Only pending requests can be edited"})
        _ ->
          updates = Map.take(params, ~w(title description amount_requested students_impacted)) |> Enum.reject(fn {_k, v} -> is_nil(v) end) |> Map.new()

          if map_size(updates) > 0 do
            cols = Map.keys(updates)
            set = cols |> Enum.with_index(2) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}" end)
            SQL.maps("update public.sponsorship_requests set #{set}, updated_at = now() where id = $1::uuid", [id | Enum.map(cols, &updates[&1])])
          end

          json(conn, sponsorship_full(id))
      end
    end
  end

  def delete_sponsorship(conn, %{"request_id" => id}) do
    with {:ok, _} <- require_role(conn, "teacher") do
      {n, _} = {SQL.scalar("with d as (delete from public.sponsorship_requests where id = $1::uuid and teacher_id = $2::uuid returning 1) select count(*)::int from d", [id, uid(conn)], 0), nil}
      if n > 0, do: json(conn, %{message: "Sponsorship request deleted"}), else: not_found(conn, "Sponsorship request not found")
    end
  end

  defp sponsorship_full(id), do: SQL.json_one("select to_jsonb(r) as row from public.sponsorship_requests r where r.id = $1::uuid", [id])

  # ---- subjects write + profile update --------------------------------------

  def add_subject(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      subject_id = params["subject_id"]

      cond do
        is_nil(subject_id) -> conn |> put_status(400) |> json(%{detail: "subject_id is required"})
        not is_nil(SQL.one("select id from public.teacher_subjects where teacher_id = $1::uuid and subject_id = $2::uuid", [tp["id"], subject_id])) ->
          conn |> put_status(400) |> json(%{detail: "Subject already added"})
        true ->
          SQL.maps("insert into public.teacher_subjects (id, teacher_id, subject_id, proficiency_level, created_at) values (gen_random_uuid(), $1::uuid, $2::uuid, $3, now())", [tp["id"], subject_id, params["proficiency_level"]])
          json(conn, %{message: "Subject added successfully"})
      end
    end
  end

  def remove_subject(conn, %{"subject_id" => subject_id}) do
    with {:ok, tp} <- teacher_profile(conn) do
      SQL.maps("delete from public.teacher_subjects where teacher_id = $1::uuid and subject_id = $2::uuid", [tp["id"], subject_id])
      json(conn, %{message: "Subject removed successfully"})
    end
  end

  @profile_cols ~w(title experience_years hourly_rate languages specializations achievements teaching_style is_online_available is_physical_available response_time availability_status collaboration_interests)
  @profile_arrays ~w(languages specializations achievements collaboration_interests)

  def update_profile(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      updates = Map.take(params, @profile_cols) |> Enum.reject(fn {_k, v} -> is_nil(v) end) |> Map.new()

      if map_size(updates) == 0 do
        json(conn, %{success: true, message: "No changes"})
      else
        cols = Map.keys(updates)
        set = cols |> Enum.with_index(2) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}#{if c in @profile_arrays, do: "::text[]", else: ""}" end)
        SQL.maps("update public.teacher_profiles set #{set}, updated_at = now() where id = $1::uuid", [tp["id"] | Enum.map(cols, &updates[&1])])
        json(conn, %{success: true, message: "Profile updated successfully"})
      end
    end
  end

  # ---- session participants / recording / analytics ------------------------

  def session_participants(conn, %{"session_id" => sid}) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(sid, tp["id"]) do
      parts =
        SQL.maps(
          """
          select sp.id::text id, sp.student_id::text student_id, sp.joined_at, sp.left_at,
            (sp.joined_at is not null and sp.left_at is null) is_currently_joined, sp.attendance_duration_minutes,
            nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') name, u.email
          from public.session_participants sp
          left join public.users u on u.id = sp.student_id
          left join public.user_profiles up on up.user_id = sp.student_id
          where sp.session_id = $1::uuid order by sp.created_at
          """,
          [sid]
        )

      json(conn, %{participants: parts, total_count: length(parts), currently_joined: Enum.count(parts, & &1.is_currently_joined)})
    else
      false -> not_found(conn, "Session not found")
      other -> other
    end
  end

  def add_participant(conn, %{"session_id" => sid, "student_id" => student_id}) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(sid, tp["id"]) do
      if is_nil(SQL.one("select id from public.session_participants where session_id = $1::uuid and student_id = $2::uuid", [sid, student_id])) do
        SQL.maps("insert into public.session_participants (id, session_id, student_id, created_at) values (gen_random_uuid(), $1::uuid, $2::uuid, now())", [sid, student_id])
      end

      json(conn, %{message: "Participant added successfully"})
    else
      false -> not_found(conn, "Session not found")
      other -> other
    end
  end

  def remove_participant(conn, %{"session_id" => sid, "student_id" => student_id}) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(sid, tp["id"]) do
      SQL.maps("delete from public.session_participants where session_id = $1::uuid and student_id = $2::uuid", [sid, student_id])
      refresh_participant_count(sid)
      json(conn, %{message: "Participant removed successfully"})
    else
      false -> not_found(conn, "Session not found")
      other -> other
    end
  end

  def update_recording(conn, %{"session_id" => sid} = params) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(sid, tp["id"]) do
      SQL.maps("update public.live_sessions set recording_url = $2, recording_expires_at = $3::text::timestamp where id = $1::uuid", [sid, params["recording_url"], params["recording_expires_at"]])
      json(conn, %{message: "Recording details updated successfully"})
    else
      false -> not_found(conn, "Session not found")
      other -> other
    end
  end

  def delete_recording(conn, %{"session_id" => sid}) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(sid, tp["id"]) do
      SQL.maps("update public.live_sessions set recording_url = null, recording_expires_at = null where id = $1::uuid", [sid])
      json(conn, %{message: "Recording deleted successfully"})
    else
      false -> not_found(conn, "Session not found")
      other -> other
    end
  end

  def mark_joined(conn, %{"session_id" => sid, "student_id" => student_id}) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(sid, tp["id"]) do
      if is_nil(SQL.one("select id from public.session_participants where session_id = $1::uuid and student_id = $2::uuid", [sid, student_id])) do
        SQL.maps("insert into public.session_participants (id, session_id, student_id, joined_at, created_at) values (gen_random_uuid(), $1::uuid, $2::uuid, now(), now())", [sid, student_id])
      else
        SQL.maps("update public.session_participants set joined_at = now(), left_at = null where session_id = $1::uuid and student_id = $2::uuid", [sid, student_id])
      end

      refresh_participant_count(sid)
      json(conn, %{message: "Student marked as joined"})
    else
      false -> not_found(conn, "Session not found")
      other -> other
    end
  end

  def mark_left(conn, %{"session_id" => sid, "student_id" => student_id}) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(sid, tp["id"]) do
      SQL.maps(
        "update public.session_participants set left_at = now(), attendance_duration_minutes = coalesce(attendance_duration_minutes, 0) + coalesce(ceil(extract(epoch from (now() - joined_at)) / 60)::int, 0) where session_id = $1::uuid and student_id = $2::uuid",
        [sid, student_id]
      )

      refresh_participant_count(sid)
      json(conn, %{message: "Student marked as left"})
    else
      false -> not_found(conn, "Session not found")
      other -> other
    end
  end

  def session_analytics(conn, %{"session_id" => sid}) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(sid, tp["id"]) do
      a = SQL.one("select count(*)::int total, count(*) filter (where joined_at is not null)::int attended, coalesce(avg(attendance_duration_minutes), 0)::float avg_minutes from public.session_participants where session_id = $1::uuid", [sid])
      rate = if a.total > 0, do: Float.round(a.attended / a.total * 100, 1), else: 0.0

      json(conn, %{success: true, total_registered: a.total, actually_attended: a.attended, attendance_rate: rate, average_duration_minutes: Float.round(a.avg_minutes, 1)})
    else
      false -> not_found(conn, "Session not found")
      other -> other
    end
  end

  defp refresh_participant_count(sid) do
    SQL.maps("update public.live_sessions set current_participants = (select count(*) from public.session_participants where session_id = $1::uuid and joined_at is not null and left_at is null) where id = $1::uuid", [sid])
  end

  # ---- appointments (stored as live_sessions) -------------------------------

  @session_types ~w(live_session workshop practical_session lab meeting consultation)

  def create_appointment(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      atype = if params["appointment_type"] in @session_types, do: params["appointment_type"], else: "consultation"
      mode = if params["is_online"] in [false, "false", "0"], do: "in_person", else: "online"
      student = params["student_email"] && SQL.one("select id::text from public.users where email = $1", [params["student_email"]])

      id =
        SQL.scalar(
          """
          insert into public.live_sessions (id, teacher_id, title, description, scheduled_start, scheduled_end, location, meeting_link, session_type, session_mode, status, current_participants)
          values (gen_random_uuid(), $1::uuid, $2, $3, $4::text::timestamp, $5::text::timestamp, $6, $7, $8::text::session_type, $9::text::session_mode, 'scheduled', 0) returning id::text
          """,
          [tp["id"], params["title"], params["description"], params["scheduled_start"], params["scheduled_end"], params["location"], params["meeting_link"], atype, mode]
        )

      if student, do: SQL.maps("insert into public.session_participants (id, session_id, student_id, created_at) values (gen_random_uuid(), $1::uuid, $2::uuid, now())", [id, student.id])
      json(conn, %{message: "Appointment created successfully", appointment_id: id})
    end
  end

  def update_appointment(conn, %{"appointment_id" => id} = params) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(id, tp["id"]) do
      mapping = %{"title" => {"title", ""}, "description" => {"description", ""}, "scheduled_start" => {"scheduled_start", "::text::timestamp"}, "scheduled_end" => {"scheduled_end", "::text::timestamp"}, "location" => {"location", ""}, "meeting_link" => {"meeting_link", ""}, "status" => {"status", "::text::session_status"}}
      provided = for {k, {col, cast}} <- mapping, Map.has_key?(params, k) and not is_nil(params[k]), do: {col, cast, params[k]}

      if provided != [] do
        set = provided |> Enum.with_index(2) |> Enum.map_join(", ", fn {{col, cast, _}, i} -> "#{col} = $#{i}#{cast}" end)
        SQL.maps("update public.live_sessions set #{set} where id = $1::uuid", [id | Enum.map(provided, fn {_, _, v} -> v end)])
      end

      json(conn, %{message: "Appointment updated successfully"})
    else
      false -> not_found(conn, "Appointment not found")
      other -> other
    end
  end

  def delete_appointment(conn, %{"appointment_id" => id}) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(id, tp["id"]) do
      SQL.maps("delete from public.session_participants where session_id = $1::uuid", [id])
      SQL.maps("delete from public.live_sessions where id = $1::uuid", [id])
      json(conn, %{message: "Appointment deleted successfully"})
    else
      false -> not_found(conn, "Appointment not found")
      other -> other
    end
  end

  # ---- availability (stored as live_sessions, session_type meeting) ---------

  def create_availability(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      start_ts = availability_ts(params["specific_date"], params["start_time"])
      end_ts = availability_ts(params["specific_date"], params["end_time"])
      notes = "Availability: #{params["day_of_week"] || ""} #{params["start_time"] || ""}-#{params["end_time"] || ""}. #{params["notes"] || ""}"

      id =
        SQL.scalar(
          """
          insert into public.live_sessions (id, teacher_id, title, description, scheduled_start, scheduled_end, session_type, session_mode, status, current_participants)
          values (gen_random_uuid(), $1::uuid, $2, $3, $4::text::timestamp, $5::text::timestamp, 'meeting'::session_type, 'online'::session_mode, 'scheduled', 0) returning id::text
          """,
          [tp["id"], params["title"] || "Availability", notes, start_ts, end_ts]
        )

      json(conn, %{message: "Availability block created successfully", block_id: id})
    end
  end

  def update_availability(conn, %{"block_id" => id} = params) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(id, tp["id"]) do
      updates = Map.take(params, ~w(title notes)) |> Enum.reject(fn {_k, v} -> is_nil(v) end)

      if updates != [] do
        cols = Enum.map(updates, fn {k, _} -> if(k == "notes", do: "description", else: k) end)
        set = cols |> Enum.with_index(2) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}" end)
        SQL.maps("update public.live_sessions set #{set} where id = $1::uuid", [id | Enum.map(updates, fn {_, v} -> v end)])
      end

      json(conn, %{message: "Availability block updated successfully"})
    else
      false -> not_found(conn, "Availability block not found")
      other -> other
    end
  end

  def delete_availability(conn, %{"block_id" => id}) do
    with {:ok, tp} <- teacher_profile(conn), true <- owns_session?(id, tp["id"]) do
      SQL.maps("delete from public.live_sessions where id = $1::uuid", [id])
      json(conn, %{message: "Availability block deleted successfully"})
    else
      false -> not_found(conn, "Availability block not found")
      other -> other
    end
  end

  defp availability_ts(nil, time), do: "#{Date.utc_today() |> Date.to_iso8601()}T#{time || "09:00"}:00"
  defp availability_ts(date, time), do: "#{date}T#{time || "09:00"}:00"

  # ---- schedule conflicts / bulk --------------------------------------------

  def schedule_conflicts(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      exclude = params["exclude_session_id"]

      conflicts =
        SQL.json_all(
          """
          select to_jsonb(a) as row from public.live_sessions a
          where a.teacher_id = $1::uuid and a.status in ('scheduled','live')
            and ($2::uuid is null or a.id <> $2::uuid)
            and exists (
              select 1 from public.live_sessions b
              where b.teacher_id = a.teacher_id and b.id <> a.id and b.status in ('scheduled','live')
                and a.scheduled_start < b.scheduled_end and a.scheduled_end > b.scheduled_start)
          order by a.scheduled_start
          """,
          [tp["id"], exclude]
        )

      json(conn, %{success: true, conflicts: conflicts, has_conflicts: conflicts != []})
    end
  end

  def bulk_apply_template(conn, _params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      json(conn, %{success: true, message: "Template applied", created: 0})
    end
  end

  def bulk_reschedule(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      ids = params["session_ids"] || []
      shift = params["shift_minutes"] || 0

      updated =
        if is_list(ids) and ids != [] do
          SQL.scalar(
            "with u as (update public.live_sessions set scheduled_start = scheduled_start + ($3 || ' minutes')::interval, scheduled_end = scheduled_end + ($3 || ' minutes')::interval where teacher_id = $1::uuid and id = any($2::uuid[]) returning 1) select count(*)::int from u",
            [tp["id"], ids, to_string(shift)], 0
          )
        else
          0
        end

      json(conn, %{success: true, message: "Sessions rescheduled", updated: updated})
    end
  end

  # ---- students actions -----------------------------------------------------

  def add_student(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      email = params["student_email"]
      course_id = params["course_id"]
      student = email && SQL.one("select id::text from public.users where email = $1", [email])
      course = course_id && SQL.one("select id::text, title from public.courses where id = $1::uuid and teacher_id = $2::uuid", [course_id, tp["id"]])

      cond do
        is_nil(student) -> conn |> put_status(404) |> json(%{detail: "Student not found"})
        is_nil(course) -> conn |> put_status(404) |> json(%{detail: "Course not found or not yours"})
        not is_nil(SQL.one("select id from public.course_enrollments where student_id = $1::uuid and course_id = $2::uuid", [student.id, course_id])) ->
          conn |> put_status(400) |> json(%{detail: "Student already enrolled"})
        true ->
          eid = SQL.scalar("insert into public.course_enrollments (id, student_id, course_id, status, progress_percentage, enrolled_at) values (gen_random_uuid(), $1::uuid, $2::uuid, 'active', 0, now()) returning id::text", [student.id, course_id])
          json(conn, %{success: true, message: "Successfully enrolled student in #{course.title}", data: %{id: eid}})
      end
    end
  end

  def message_student(conn, params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      teacher_uid = uid(conn)
      student_id = params["student_id"]
      content = params["message_content"] || params["content"] || ""

      enrolled? = not is_nil(SQL.one("select e.id from public.course_enrollments e join public.courses c on c.id = e.course_id where e.student_id = $1::uuid and c.teacher_id in (select id from public.teacher_profiles where user_id = $2::uuid) limit 1", [student_id, teacher_uid]))

      if not enrolled? do
        conn |> put_status(403) |> json(%{detail: "You can only message students enrolled in your courses"})
      else
        conv_id =
          case SQL.one("select id::text from public.conversations where (participant_1 = $1::uuid and participant_2 = $2::uuid) or (participant_1 = $2::uuid and participant_2 = $1::uuid) limit 1", [teacher_uid, student_id]) do
            %{id: id} -> id
            nil -> SQL.scalar("insert into public.conversations (id, participant_1, participant_2, created_at, last_message_at) values (gen_random_uuid(), $1::uuid, $2::uuid, now(), now()) returning id::text", [teacher_uid, student_id])
          end

        mid = SQL.scalar("insert into public.messages (id, conversation_id, sender_id, content, is_read, created_at) values (gen_random_uuid(), $1::uuid, $2::uuid, $3, false, now()) returning id::text", [conv_id, teacher_uid, content])
        SQL.maps("update public.conversations set last_message_at = now() where id = $1::uuid", [conv_id])
        json(conn, %{success: true, message: "Message sent", data: %{conversation_id: conv_id, message_id: mid}})
      end
    end
  end

  def email_student(conn, params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      student_id = params["student_id"]
      subject = params["subject"] || "Message from your teacher"
      body = params["body"] || params["message"] || ""

      # Email delivery lives in the Python service; here we drop an in-app
      # notification so the student sees it regardless.
      try do
        SQL.maps(
          "insert into public.notifications (user_id, type, title, message, data) values ($1::uuid, 'system'::notification_type, $2, $3, $4::text::jsonb)",
          [student_id, subject, body, Jason.encode!(%{from: "teacher"})]
        )
      rescue
        _ -> :ok
      end

      json(conn, %{success: true, message: "Notification delivered to student"})
    end
  end

  def report_student(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      student_id = params["student_id"]

      summary =
        SQL.one(
          """
          select count(*)::int courses, coalesce(round(avg(coalesce(e.progress_percentage, 0)), 1), 0)::float avg_progress,
            count(*) filter (where e.status = 'completed')::int completed
          from public.course_enrollments e join public.courses c on c.id = e.course_id
          where e.student_id = $1::uuid and c.teacher_id = $2::uuid
          """,
          [student_id, tp["id"]]
        )

      json(conn, %{success: true, data: %{student_id: student_id, courses_with_you: summary.courses, average_progress: summary.avg_progress, completed_courses: summary.completed}})
    end
  end

  # ---- file uploads (Supabase Storage) --------------------------------------

  def upload_avatar(conn, params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      case upload_file(uid(conn), params, "avatar") do
        {:ok, url} ->
          SQL.maps("update public.user_profiles set avatar_url = $2, updated_at = now() where user_id = $1::uuid", [uid(conn), url])
          json(conn, %{message: "Avatar uploaded successfully", avatar_url: url})

        :no_file -> conn |> put_status(400) |> json(%{detail: "No file provided"})
        {:error, _} -> conn |> put_status(500) |> json(%{detail: "Avatar upload failed"})
      end
    end
  end

  def upload_track(conn, params) do
    with {:ok, _} <- require_role(conn, "teacher") do
      case upload_file(uid(conn), params, "track") do
        {:ok, url} -> json(conn, %{success: true, url: url, track_type: params["track_type"]})
        :no_file -> conn |> put_status(400) |> json(%{detail: "No file provided"})
        {:error, _} -> conn |> put_status(500) |> json(%{detail: "Track upload failed"})
      end
    end
  end

  def upload_content(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      cond do
        is_nil(SQL.one("select id from public.courses where id = $1::uuid and teacher_id = $2::uuid", [params["course_id"], tp["id"]])) ->
          conn |> put_status(404) |> json(%{detail: "Course not found or not yours"})

        true ->
          case upload_file(uid(conn), params, "content") do
            {:ok, url} ->
              targets = parse_json_list(params["target_disability_types"])

              row =
                SQL.json_one(
                  """
                  insert into public.course_content
                    (id, course_id, title, description, content_type, content_url, access_level, order_index, is_downloadable,
                     target_disability_types, is_accessible_for_all, requires_vision, requires_hearing, cognitive_level,
                     has_captions, has_transcripts, has_audio_description, has_sign_language, created_at, updated_at)
                  values (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13, $14, $15, $16, $17, now(), now())
                  returning to_jsonb(course_content) as row
                  """,
                  [
                    params["course_id"], params["title"], params["description"], params["content_type"], url,
                    params["access_level"] || "free", int(params["order_index"], 0), bool(params["is_downloadable"]),
                    targets, bool(params["is_accessible_for_all"], true), bool(params["requires_vision"], true),
                    bool(params["requires_hearing"], true), int(params["cognitive_level"], 3),
                    bool(params["has_captions"]), bool(params["has_transcripts"]),
                    bool(params["has_audio_description"]), bool(params["has_sign_language"])
                  ]
                )

              json(conn, %{success: true, content: row})

            :no_file -> conn |> put_status(400) |> json(%{detail: "No file provided"})
            {:error, _} -> conn |> put_status(500) |> json(%{detail: "Content upload failed"})
          end
      end
    end
  end

  defp upload_file(user_id, params, kind) do
    case params["file"] || params["avatar"] do
      %Plug.Upload{} = up ->
        case SkillHub.Storage.upload(up, user_id, kind) do
          {:ok, %{file_url: url}} -> {:ok, url}
          {:error, reason} -> {:error, reason}
        end

      _ ->
        :no_file
    end
  end

  defp parse_json_list(nil), do: []
  defp parse_json_list(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, l} when is_list(l) -> l
      _ -> []
    end
  end
  defp parse_json_list(l) when is_list(l), do: l
  defp parse_json_list(_), do: []

  defp bool(v, default \\ false)
  defp bool(v, _d) when v in [true, "true", "1", "on"], do: true
  defp bool(v, _d) when v in [false, "false", "0", nil], do: false
  defp bool(_v, d), do: d

  # ---- content --------------------------------------------------------------

  def content(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      course_id = params["course_id"]

      if is_nil(course_id) or is_nil(SQL.one("select id from public.courses where id = $1::uuid and teacher_id = $2::uuid", [course_id, tp["id"]])) do
        conn |> put_status(404) |> json(%{detail: "Course not found or not yours"})
      else
        limit = int(params["limit"], 50) |> max(1) |> min(100)
        offset = (int(params["page"], 1) |> max(1)) - 1
        offset = offset * limit
        {clause, args} =
          cond do
            params["content_type"] && params["access_level"] -> {" and cc.content_type = $2 and cc.access_level = $3", [params["content_type"], params["access_level"]]}
            params["content_type"] -> {" and cc.content_type = $2", [params["content_type"]]}
            params["access_level"] -> {" and cc.access_level = $2", [params["access_level"]]}
            true -> {"", []}
          end

        rows = SQL.json_all("select to_jsonb(cc) as row from public.course_content cc where cc.course_id = $1::uuid#{clause} order by cc.order_index nulls last, cc.created_at limit #{limit} offset #{offset}", [course_id | args])
        total = SQL.scalar("select count(*)::int from public.course_content cc where cc.course_id = $1::uuid#{clause}", [course_id | args], 0)
        json(conn, %{success: true, content: rows, total_count: total, page: int(params["page"], 1), limit: limit})
      end
    end
  end

  def update_accessibility_tracks(conn, %{"content_id" => id} = params) do
    with {:ok, tp} <- teacher_profile(conn) do
      owned =
        SQL.one(
          "select cc.id from public.course_content cc join public.courses c on c.id = cc.course_id where cc.id = $1::uuid and c.teacher_id = $2::uuid",
          [id, tp["id"]]
        )

      if is_nil(owned) do
        conn |> put_status(404) |> json(%{detail: "Content not found or not yours"})
      else
        track_fields = ~w(caption_url transcript_url audio_description_url sign_language_video_url)
        updates = for f <- track_fields, Map.has_key?(params, f), into: %{}, do: {f, blank_track(params[f])}

        if map_size(updates) == 0 do
          json(conn, %{success: true, updated: 0})
        else
          derived =
            Enum.reduce(updates, %{}, fn {k, v}, acc ->
              case k do
                "caption_url" -> Map.put(acc, "has_captions", not is_nil(v))
                "transcript_url" -> Map.put(acc, "has_transcripts", not is_nil(v))
                "audio_description_url" -> Map.put(acc, "has_audio_description", not is_nil(v))
                "sign_language_video_url" -> Map.put(acc, "has_sign_language", not is_nil(v))
                _ -> acc
              end
            end)

          all = Map.merge(updates, derived)
          cols = Map.keys(all)
          set = cols |> Enum.with_index(2) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}" end)
          SQL.maps("update public.course_content set #{set}, updated_at = now() where id = $1::uuid", [id | Enum.map(cols, &all[&1])])
          json(conn, %{success: true, updated: map_size(updates)})
        end
      end
    end
  end

  defp blank_track(v) when is_binary(v), do: (if String.trim(v) == "", do: nil, else: String.trim(v))
  defp blank_track(_), do: nil

  # ---- analytics ------------------------------------------------------------

  def analytics(conn, _params) do
    with {:ok, tp} <- teacher_profile(conn) do
      tid = tp["id"]

      overview =
        SQL.one(
          """
          select
            (select count(*) from public.courses where teacher_id = $1::uuid)::int total_courses,
            (select count(*) filter (where status = 'published') from public.courses where teacher_id = $1::uuid)::int published_courses,
            (select count(distinct e.student_id) from public.course_enrollments e join public.courses c on c.id = e.course_id where c.teacher_id = $1::uuid)::int total_students,
            (select count(*) from public.live_sessions where teacher_id = $1::uuid)::int total_sessions,
            (select count(*) filter (where status = 'completed') from public.live_sessions where teacher_id = $1::uuid)::int completed_sessions,
            (select round(avg(rating), 2) from public.reviews where teacher_id = $1::uuid and rating is not null)::float avg_rating,
            (select count(*) from public.reviews where teacher_id = $1::uuid)::int total_reviews,
            (select coalesce(sum(p.amount), 0) from public.live_session_payments p join public.live_sessions s on s.id = p.session_id where s.teacher_id = $1::uuid and p.payment_status = 'completed')::float total_earnings
          """,
          [tid]
        )

      enrollment_trend =
        SQL.maps(
          "select to_char(date_trunc('month', e.enrolled_at), 'YYYY-MM') as \"month\", count(*)::int count from public.course_enrollments e join public.courses c on c.id = e.course_id where c.teacher_id = $1::uuid group by 1 order by 1 desc limit 12",
          [tid]
        )
        |> Enum.reverse()

      json(conn, %{success: true, overview: overview, enrollment_trend: enrollment_trend})
    end
  end

  # ---- earnings -------------------------------------------------------------

  def earnings(conn, _params) do
    with {:ok, tp} <- teacher_profile(conn) do
      tid = tp["id"]

      totals =
        SQL.one(
          """
          select
            coalesce(sum(p.amount) filter (where p.payment_status = 'completed'), 0)::float total,
            coalesce(sum(p.amount) filter (where p.payment_status = 'completed' and date_trunc('month', p.created_at) = date_trunc('month', now())), 0)::float this_month,
            coalesce(sum(p.amount) filter (where p.payment_status = 'completed' and date_trunc('month', p.created_at) = (date_trunc('month', now()) - '1 month'::interval)), 0)::float last_month,
            coalesce(sum(p.amount) filter (where p.payment_status = 'pending'), 0)::float pending
          from public.live_session_payments p join public.live_sessions s on s.id = p.session_id where s.teacher_id = $1::uuid
          """,
          [tid]
        )

      recent =
        SQL.json_all("select to_jsonb(p) as row from public.live_session_payments p join public.live_sessions s on s.id = p.session_id where s.teacher_id = $1::uuid order by p.created_at desc limit 10", [tid])

      trend =
        SQL.maps("select to_char(date_trunc('month', p.created_at), 'YYYY-MM') as \"month\", round(sum(p.amount), 2)::float total from public.live_session_payments p join public.live_sessions s on s.id = p.session_id where s.teacher_id = $1::uuid and p.payment_status = 'completed' group by 1 order by 1 desc limit 12", [tid])
        |> Enum.reverse()

      json(conn, %{
        success: true, currency: "LKR",
        total_earnings: totals.total, this_month_earnings: totals.this_month, last_month_earnings: totals.last_month,
        pending_payments: totals.pending, recent_payments: recent, monthly_earnings: trend
      })
    end
  end

  def payments(conn, params) do
    with {:ok, tp} <- teacher_profile(conn) do
      limit = int(params["limit"], 50) |> max(1) |> min(100)
      offset = (int(params["page"], 1) |> max(1)) - 1
      offset = offset * limit

      rows = SQL.json_all("select to_jsonb(p) as row from public.live_session_payments p join public.live_sessions s on s.id = p.session_id where s.teacher_id = $1::uuid order by p.created_at desc limit #{limit} offset #{offset}", [tp["id"]])
      total = SQL.scalar("select count(*)::int from public.live_session_payments p join public.live_sessions s on s.id = p.session_id where s.teacher_id = $1::uuid", [tp["id"]], 0)
      json(conn, %{success: true, payments: rows, pagination: %{total: total, page: int(params["page"], 1), limit: limit, total_pages: div(total + limit - 1, limit)}})
    end
  end

  def health(conn, _params), do: json(conn, %{status: "healthy", service: "teachers", message: "Teacher routes are working!"})

  # ---- helpers --------------------------------------------------------------

  defp int(nil, d), do: d
  defp int(v, _d) when is_integer(v), do: v
  defp int(v, d) when is_binary(v), do: (case Integer.parse(v) do
    {n, _} -> n
    :error -> d
  end)
  defp int(_, d), do: d

  defp numf(nil), do: 0.0
  defp numf(n) when is_number(n), do: n * 1.0
  defp numf(%Decimal{} = d), do: Decimal.to_float(d)
  defp numf(s) when is_binary(s), do: (case Float.parse(s) do
    {f, _} -> f
    :error -> 0.0
  end)
  defp numf(_), do: 0.0

  defp uid(conn), do: conn.assigns.current_user_id
  defp not_found(conn, msg), do: conn |> put_status(404) |> json(%{detail: msg})
end
