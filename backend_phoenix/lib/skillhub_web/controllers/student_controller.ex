defmodule SkillHubWeb.StudentController do
  @moduledoc """
  Ported student hub (students.py). Built out incrementally; unlisted routes
  fall through to Python via the strangler. Read-heavy joins are pushed into SQL
  (collapsing the Python N+1 chains).
  """
  use SkillHubWeb, :controller

  import SkillHubWeb.AuthHelpers
  alias SkillHub.SQL

  def dashboard(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)

      enrolled =
        SQL.maps(
          """
          select c.id::text id, c.title,
            nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') teacher_name,
            coalesce(s.name, 'General') subject,
            coalesce(e.progress_percentage, 0) progress_percentage, e.status, e.enrolled_at, e.last_accessed
          from public.course_enrollments e
          join public.courses c on c.id = e.course_id
          left join public.teacher_profiles tp on tp.id = c.teacher_id
          left join public.user_profiles up on up.user_id = tp.user_id
          left join public.subjects s on s.id = c.subject_id
          where e.student_id = $1::uuid order by e.enrolled_at desc limit 10
          """,
          [user_id]
        )
        |> Enum.map(&Map.update(&1, :teacher_name, "Unknown Teacher", fn v -> v || "Unknown Teacher" end))

      stats = SQL.one("select count(*)::int total, count(*) filter (where status = 'active')::int active, count(*) filter (where status = 'completed')::int completed from public.course_enrollments where student_id = $1::uuid", [user_id])

      notifications =
        SQL.json_all("select to_jsonb(n) as row from public.notifications n where n.user_id = $1::uuid order by n.created_at desc limit 5", [user_id])
        |> Enum.map(&Map.take(&1, ["id", "title", "message", "type", "is_read", "created_at"]))

      {upcoming, recordings} = student_sessions(user_id)

      json(conn, %{
        success: true,
        data: %{
          stats: %{
            enrolled_courses: stats.total, active_courses: stats.active, completed_courses: stats.completed,
            total_study_hours: 0, study_streak_days: 0
          },
          enrolled_courses: Enum.take(enrolled, 5),
          upcoming_sessions: upcoming,
          recent_recordings: recordings,
          recent_notifications: notifications
        }
      })
    end
  end

  @profile_select "id::text, first_name, last_name, phone, date_of_birth, location, bio, avatar_url, university, student_id, major, year, gpa::float, coalesce(reputation_score, 0)::int reputation_score"
  @profile_allowed ~w(first_name last_name phone date_of_birth location bio avatar_url university student_id major year gpa)

  def profile(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)
      p = SQL.one("select #{@profile_select} from public.user_profiles where user_id = $1::uuid", [user_id]) ||
            SQL.one("insert into public.user_profiles (user_id, reputation_score, created_at, updated_at) values ($1::uuid, 0, now(), now()) returning #{@profile_select}", [user_id])

      user = SQL.one("select email, is_verified, created_at from public.users where id = $1::uuid", [user_id])
      st = SQL.one("select count(*)::int total, count(*) filter (where status = 'active')::int active, count(*) filter (where status = 'completed')::int completed, coalesce(round(avg(coalesce(progress_percentage, 0)), 1), 0)::float avg from public.course_enrollments where student_id = $1::uuid", [user_id])

      json(conn, %{
        success: true,
        data: Map.merge(p, %{
          user_id: user_id, email: (user && user.email) || conn.assigns.current_user.email,
          is_verified: (user && user.is_verified) || false, member_since: user && user.created_at,
          stats: %{total_enrollments: st.total, active_enrollments: st.active, completed_enrollments: st.completed, avg_progress: st.avg}
        })
      })
    end
  end

  def update_profile(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      updates = Map.take(params, @profile_allowed) |> Enum.reject(fn {_k, v} -> is_nil(v) end) |> Map.new()

      if map_size(updates) == 0 do
        conn |> put_status(400) |> json(%{detail: "No valid fields provided for update"})
      else
        cols = Map.keys(updates)
        set = cols |> Enum.with_index(2) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}#{if c == "date_of_birth", do: "::text::date", else: ""}" end)
        SQL.maps("update public.user_profiles set #{set}, updated_at = now() where user_id = $1::uuid", [uid(conn) | Enum.map(cols, &updates[&1])])
        json(conn, %{success: true, message: "Profile updated successfully"})
      end
    end
  end

  def find_teachers(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)
      page = int(params["page"], 1) |> max(1)
      limit = int(params["limit"], 20) |> max(1) |> min(100)
      search = (params["search"] || "") |> String.downcase()
      subject = params["subject"] || ""
      disability = params["disability_specialization"] || ""
      min_rating = numf(params["min_rating"])
      max_rate = numf(params["max_rate"])
      online_only = params["online_only"] in [true, "true", "1"]
      filter_by_mine = params["filter_by_my_disability"] not in [false, "false", "0"]
      teacher_id = params["teacher_id"] || ""

      my_types =
        if filter_by_mine do
          case SQL.json_one("select to_jsonb(p) as row from public.student_disability_profiles p where p.user_id = $1::uuid", [user_id]) do
            %{"has_disability" => true} = p -> p["disability_types"] || []
            _ -> []
          end
        else
          []
        end

      rows =
        SQL.maps(
          """
          select to_jsonb(tp) tp, to_jsonb(up) up,
            coalesce((select array_agg(s.name) from public.teacher_subjects ts join public.subjects s on s.id = ts.subject_id where ts.teacher_id = tp.id), '{}') subjects,
            coalesce((select jsonb_agg(jsonb_build_object('disability_type', ds.disability_type, 'specialization_level', ds.specialization_level, 'certified', ds.certified, 'years_experience', ds.years_experience)) from public.teacher_disability_specializations ds where ds.teacher_id = tp.user_id), '[]') specs
          from public.teacher_profiles tp
          join public.user_profiles up on up.user_id = tp.user_id
          order by tp.average_rating desc nulls last limit 200
          """,
          []
        )
        |> Enum.map(&teacher_view(&1, my_types))
        |> Enum.filter(&teacher_matches?(&1, search, subject, disability, min_rating, max_rate, online_only, filter_by_mine, my_types, teacher_id))
        |> Enum.sort_by(&{&1.specialization_match_score || 0, &1.average_rating || 0}, :desc)

      total = length(rows)
      page_rows = Enum.slice(rows, (page - 1) * limit, limit) |> Enum.map(&Map.drop(&1, [:_spec_types, :_subject_names]))
      json(conn, %{success: true, data: %{teachers: page_rows, pagination: %{total: total, page: page, limit: limit, total_pages: div(total + limit - 1, limit)}}})
    end
  end

  defp teacher_view(%{tp: tp, up: up, subjects: subjects, specs: specs}, my_types) do
    spec_types = Enum.map(specs, & &1["disability_type"])
    score =
      if my_types != [] and spec_types != [] do
        matches = Enum.count(my_types, &(&1 in spec_types))
        Float.round(matches / length(my_types) * 100, 1)
      else
        0.0
      end

    name = String.trim("#{up["first_name"] || ""} #{up["last_name"] || ""}")

    %{
      id: tp["id"], user_id: tp["user_id"], name: (if name == "", do: "Unknown Teacher", else: name),
      avatar_url: up["avatar_url"], specialization: tp["specialization"], bio: up["bio"],
      hourly_rate: numf(tp["hourly_rate"]), average_rating: numf(tp["average_rating"]),
      total_reviews: tp["total_reviews"] || 0, total_students: tp["total_students"] || 0,
      years_experience: tp["years_experience"] || tp["experience_years"] || 0,
      is_available: tp["is_available"] || tp["is_online_available"] || false,
      subjects: Enum.take(subjects || [], 5), university: up["university"], location: up["location"],
      disability_specializations: specs, specialization_match_score: (if score > 0, do: score, else: nil),
      _spec_types: spec_types, _subject_names: subjects || []
    }
  end

  defp teacher_matches?(t, search, subject, disability, min_rating, max_rate, online_only, filter_by_mine, my_types, teacher_id) do
    cond do
      teacher_id != "" and t.id != teacher_id -> false
      min_rating > 0 and (t.average_rating || 0) < min_rating -> false
      max_rate > 0 and (t.hourly_rate || 0) > max_rate -> false
      online_only and not t.is_available -> false
      search != "" and not (String.contains?(String.downcase(t.name), search) or String.contains?(String.downcase(t.specialization || ""), search)) -> false
      subject != "" and subject not in t._subject_names -> false
      disability != "" and disability not in t._spec_types -> false
      filter_by_mine and my_types != [] and t._spec_types != [] and not Enum.any?(my_types, &(&1 in t._spec_types)) -> false
      true -> true
    end
  end

  defp numf(nil), do: 0.0
  defp numf(n) when is_number(n), do: n * 1.0
  defp numf(%Decimal{} = d), do: Decimal.to_float(d)
  defp numf(s) when is_binary(s), do: (case Float.parse(s) do
    {f, _} -> f
    :error -> 0.0
  end)
  defp numf(_), do: 0.0

  defp blank(nil), do: nil
  defp blank(""), do: nil
  defp blank(v), do: v

  # POST /students/reviews — one review per (student, teacher); resubmitting
  # updates the existing row rather than creating a duplicate. teacher_profiles
  # .average_rating/.total_reviews recompute automatically via the
  # reviews_recompute_teacher_rating trigger (see migration 20260719000002).
  def create_review(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      student_id = uid(conn)
      teacher_id = blank(params["teacher_id"])
      rating = int(params["rating"], 0)
      course_id = blank(params["course_id"])
      title = blank(params["title"])
      content = blank(params["content"])

      cond do
        is_nil(teacher_id) ->
          conn |> put_status(400) |> json(%{detail: "teacher_id is required"})

        rating < 1 or rating > 5 ->
          conn |> put_status(400) |> json(%{detail: "rating must be between 1 and 5"})

        is_nil(SQL.one("select id from public.teacher_profiles where id = $1::uuid", [teacher_id])) ->
          conn |> put_status(404) |> json(%{detail: "Teacher not found"})

        is_nil(
          SQL.one(
            "select ce.id from public.course_enrollments ce join public.courses c on c.id = ce.course_id where ce.student_id = $1::uuid and c.teacher_id = $2::uuid limit 1",
            [student_id, teacher_id]
          )
        ) ->
          conn |> put_status(403) |> json(%{detail: "You can only review teachers whose courses you're enrolled in"})

        true ->
          existing = SQL.one("select id::text from public.reviews where reviewer_id = $1::uuid and teacher_id = $2::uuid", [student_id, teacher_id])

          review =
            case existing do
              %{id: rid} ->
                SQL.json_one(
                  "update public.reviews set rating = $3, title = $4, content = $5, course_id = coalesce($6::uuid, course_id) where id = $1::uuid and reviewer_id = $2::uuid returning to_jsonb(reviews) as row",
                  [rid, student_id, rating, title, content, course_id]
                )

              nil ->
                SQL.json_one(
                  "insert into public.reviews (reviewer_id, teacher_id, course_id, rating, title, content) values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6) returning to_jsonb(reviews) as row",
                  [student_id, teacher_id, course_id, rating, title, content]
                )
            end

          json(conn, %{success: true, review: review})
      end
    end
  end

  def enrolled_courses(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      rows =
        SQL.maps(
          """
          select c.id::text id, c.title, c.description,
            coalesce(e.progress_percentage, 0) progress_percentage, e.status, e.enrolled_at
          from public.course_enrollments e join public.courses c on c.id = e.course_id
          where e.student_id = $1::uuid order by e.enrolled_at desc
          """,
          [uid(conn)]
        )

      json(conn, %{success: true, data: rows})
    end
  end

  def payment_history(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)
      page = int(params["page"], 1) |> max(1)
      limit = int(params["limit"], 20) |> max(1) |> min(100)
      offset = (page - 1) * limit

      # app/students/payment-history/page.tsx reads transactionId/type/
      # description/teacherName/date/status directly off each row (no
      # snake->camel mapping layer) and expects status/type values from a
      # school-tuition vocabulary the schema doesn't have (payments.status
      # is really pending/completed/failed/refunded, payment_type is really
      # course_enrollment/event_registration/session_booking) — mapped here
      # rather than rewriting every frontend usage site.
      payments =
        SQL.maps(
          """
          select p.id::text id, p.transaction_id "transactionId", coalesce(p.amount, 0)::float amount, coalesce(p.currency, 'LKR') currency,
            case p.payment_type::text
              when 'course_enrollment' then 'tuition'
              when 'session_booking' then 'tuition'
              when 'event_registration' then 'extracurricular'
              else p.payment_type::text
            end "type",
            coalesce(c.title, e.title, s.title, 'Payment') description,
            nullif(trim(coalesce(tup.first_name,'') || ' ' || coalesce(tup.last_name,'')), '') "teacherName",
            case p.status::text
              when 'completed' then 'paid'
              when 'failed' then 'overdue'
              else p.status::text
            end status,
            p.payment_method, p.payment_method "paymentMethod", p.payment_gateway "paymentGateway",
            p.created_at, p.created_at "date"
          from public.payments p
          left join public.courses c on p.payment_type = 'course_enrollment' and p.reference_id = c.id
          left join public.events e on p.payment_type = 'event_registration' and p.reference_id = e.id
          left join public.live_sessions s on p.payment_type = 'session_booking' and p.reference_id = s.id
          left join public.teacher_profiles tp on tp.id = coalesce(c.teacher_id, s.teacher_id)
          left join public.user_profiles tup on tup.user_id = tp.user_id
          where p.user_id = $1::uuid order by p.created_at desc limit #{limit} offset #{offset}
          """,
          [user_id]
        )

      total = SQL.scalar("select count(*)::int from public.payments where user_id = $1::uuid", [user_id], 0)

      summary =
        SQL.one(
          """
          select
            coalesce(sum(amount) filter (where status = 'completed'), 0)::float total_paid,
            coalesce(sum(amount) filter (where status = 'pending'), 0)::float total_pending,
            coalesce(sum(amount) filter (where status = 'failed'), 0)::float total_overdue,
            count(*)::int total_payments
          from public.payments where user_id = $1::uuid
          """,
          [user_id]
        )

      json(conn, %{
        success: true,
        data: %{
          payments: payments,
          pagination: %{total: total, page: page, limit: limit, total_pages: div(total + limit - 1, limit)},
          summary: %{
            totalPaid: summary.total_paid, totalPending: summary.total_pending,
            totalOverdue: summary.total_overdue, totalPayments: summary.total_payments
          }
        }
      })
    end
  end

  def wishlist(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      rows =
        SQL.maps(
          """
          select w.id::text wishlist_id, c.id::text course_id, c.title, c.description, c.thumbnail_url, c.price,
            coalesce(nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), ''), 'Unknown Teacher') teacher_name,
            coalesce(s.name, 'General') subject, w.added_at added_at
          from public.wishlists w
          join public.courses c on c.id = w.course_id
          left join public.teacher_profiles tp on tp.id = c.teacher_id
          left join public.user_profiles up on up.user_id = tp.user_id
          left join public.subjects s on s.id = c.subject_id
          where w.user_id = $1::uuid and w.item_type = 'course' and w.course_id is not null order by w.added_at desc
          """,
          [uid(conn)]
        )
        |> Enum.map(&Map.put(&1, :added_at, &1[:added_at]))

      json(conn, %{success: true, data: rows})
    end
  end

  def add_wishlist(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      course_id = (params["course_id"] || "") |> to_string() |> String.trim()

      cond do
        course_id == "" -> conn |> put_status(400) |> json(%{detail: "course_id is required"})
        is_nil(SQL.one("select id from public.courses where id = $1::uuid", [course_id])) -> conn |> put_status(404) |> json(%{detail: "Course not found"})
        true ->
          case SQL.one("select id::text from public.wishlists where user_id = $1::uuid and course_id = $2::uuid and item_type = 'course'", [uid(conn), course_id]) do
            %{id: id} -> json(conn, %{success: true, message: "Already in wishlist", id: id})
            nil ->
              id = SQL.scalar("insert into public.wishlists (id, user_id, item_type, course_id, added_at) values (gen_random_uuid(), $1::uuid, 'course', $2::uuid, now()) returning id::text", [uid(conn), course_id])
              json(conn, %{success: true, message: "Added to wishlist", id: id})
          end
      end
    end
  end

  def remove_wishlist(conn, %{"course_id" => course_id}) do
    with {:ok, _} <- require_role(conn, "student") do
      SQL.maps("delete from public.wishlists where user_id = $1::uuid and course_id = $2::uuid and item_type = 'course'", [uid(conn), course_id])
      json(conn, %{success: true, message: "Removed from wishlist"})
    end
  end

  def session_recordings(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      limit = int(params["limit"], 20) |> max(1) |> min(100)
      offset = (int(params["page"], 1) |> max(1)) - 1
      offset = offset * limit

      recs =
        SQL.maps(
          """
          select ls.id::text session_id, ls.title session_title, ls.recording_url,
            ceil(extract(epoch from (ls.scheduled_end - ls.scheduled_start)) / 60)::int duration, ls.created_at
          from public.session_participants sp join public.live_sessions ls on ls.id = sp.session_id
          where sp.student_id = $1::uuid and ls.recording_url is not null
          order by ls.created_at desc limit #{limit} offset #{offset}
          """,
          [uid(conn)]
        )
        |> Enum.map(&Map.put(&1, :id, &1.session_id))

      total = SQL.scalar("select count(*)::int from public.session_participants sp join public.live_sessions ls on ls.id = sp.session_id where sp.student_id = $1::uuid and ls.recording_url is not null", [uid(conn)], 0)
      json(conn, %{success: true, data: %{recordings: recs, pagination: %{total: total, page: int(params["page"], 1), limit: limit, total_pages: div(total + limit - 1, limit)}}})
    end
  end

  def join_session(conn, %{"session_id" => session_id}) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)

      case SQL.json_one("select to_jsonb(s) as row from public.live_sessions s where s.id = $1::uuid", [session_id]) do
        nil -> conn |> put_status(404) |> json(%{detail: "Session not found"})
        session ->
          case SQL.one("select id::text from public.session_participants where session_id = $1::uuid and student_id = $2::uuid", [session_id, user_id]) do
            %{id: id} -> SQL.maps("update public.session_participants set joined_at = now(), status = 'joined' where id = $1::uuid", [id])
            nil -> SQL.maps("insert into public.session_participants (id, session_id, student_id, joined_at, status) values (gen_random_uuid(), $1::uuid, $2::uuid, now(), 'joined')", [session_id, user_id])
          end

          json(conn, %{success: true, message: "Successfully joined session", data: %{meeting_link: session["meeting_link"] || "/students/meeting-room/#{session_id}", session_title: session["title"]}})
      end
    end
  end

  def set_reminder(conn, %{"session_id" => session_id}) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)

      case SQL.json_one("select to_jsonb(s) as row from public.live_sessions s where s.id = $1::uuid", [session_id]) do
        nil -> conn |> put_status(404) |> json(%{detail: "Session not found"})
        session ->
          try do
            SQL.maps(
              "insert into public.notifications (user_id, type, title, message, data) values ($1::uuid, $2::notification_type, $3, $4, $5::text::jsonb)",
              [user_id, "reminder", "Session reminder set: #{session["title"]}", "We'll email you before '#{session["title"]}' starts.",
               Jason.encode!(%{link_url: "/students/meeting-room/#{session_id}", related_entity_id: session_id})]
            )
          rescue
            _ -> :ok
          end

          if is_nil(SQL.one("select id from public.session_participants where session_id = $1::uuid and student_id = $2::uuid", [session_id, user_id])) do
            try do
              SQL.maps("insert into public.session_participants (id, session_id, student_id, status) values (gen_random_uuid(), $1::uuid, $2::uuid, 'reminder')", [session_id, user_id])
            rescue
              _ -> :ok
            end
          end

          json(conn, %{success: true, message: "Reminder set successfully"})
      end
    end
  end

  def pre_recorded_lessons(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)
      page = int(params["page"], 1) |> max(1)
      limit = int(params["limit"], 20) |> max(1) |> min(100)
      offset = (page - 1) * limit
      disability_type = params["disability_type"] || ""
      subject = (params["subject"] || "") |> String.downcase()
      want_cap = params["has_captions"] in [true, "true", "1"]
      want_tr = params["has_transcripts"] in [true, "true", "1"]
      want_ad = params["has_audio_description"] in [true, "true", "1"]

      my_types =
        case SQL.json_one("select to_jsonb(p) as row from public.student_disability_profiles p where p.user_id = $1::uuid", [user_id]) do
          %{"has_disability" => true} = p -> p["disability_types"] || []
          _ -> []
        end

      rows =
        SQL.maps(
          """
          select to_jsonb(cc) content, c.title course_title, c.id::text course_id, c.thumbnail_url,
            s.name subject_name, s.category subject_category,
            nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') teacher_name, up.avatar_url teacher_avatar
          from public.course_content cc
          join public.courses c on c.id = cc.course_id and c.status = 'published'
          left join public.subjects s on s.id = c.subject_id
          left join public.teacher_profiles tp on tp.id = c.teacher_id
          left join public.user_profiles up on up.user_id = tp.user_id
          where cc.content_type = 'video' order by cc.order_index nulls last limit 400
          """,
          []
        )
        |> Enum.map(&lesson_view(&1, my_types))
        |> Enum.filter(&lesson_matches?(&1, want_cap, want_tr, want_ad, disability_type, subject, my_types))
        |> Enum.map(&Map.drop(&1, [:_target, :_accessible_all, :_subject, :_cap, :_tr, :_ad]))

      total = length(rows)

      json(conn, %{
        success: true,
        data: %{
          lessons: Enum.slice(rows, offset, limit),
          student_disability_types: my_types,
          pagination: %{total: total, page: page, limit: limit, total_pages: max(1, div(total + limit - 1, limit))}
        }
      })
    end
  end

  defp lesson_view(%{content: item} = r, my_types) do
    spec = item["target_disability_types"] || []
    score = if my_types != [] and spec != [], do: Float.round(Enum.count(my_types, &(&1 in spec)) / length(my_types) * 100, 1), else: 0.0
    title = item["title"] || "Lesson"

    %{
      id: item["id"], title: item["title"], description: item["description"], duration: item["duration"],
      thumbnail_url: r.thumbnail_url || "https://ui-avatars.com/api/?name=#{URI.encode(title)}&background=3b82f6&color=ffffff&size=400",
      course_id: r.course_id, course_title: r.course_title, teacher_name: r.teacher_name || "Unknown Teacher",
      teacher_avatar: r.teacher_avatar, subject_name: r.subject_name || "General", subject_category: r.subject_category,
      content_url: item["content_url"],
      accessibility_features: %{
        has_captions: present?(item["caption_url"]), has_transcripts: present?(item["transcript_url"]),
        has_audio_description: present?(item["audio_description_url"]), has_sign_language: present?(item["sign_language_video_url"]),
        relevance_score: (if score > 0, do: score, else: nil)
      },
      _target: spec, _accessible_all: Map.get(item, "is_accessible_for_all", true), _subject: (r.subject_name || "") |> to_string() |> String.downcase(),
      _cap: present?(item["caption_url"]), _tr: present?(item["transcript_url"]), _ad: present?(item["audio_description_url"])
    }
  end

  defp lesson_matches?(l, want_cap, want_tr, want_ad, disability_type, subject, my_types) do
    dis_ok =
      cond do
        disability_type != "" -> disability_type in l._target or l._accessible_all
        my_types != [] and l._target != [] -> Enum.any?(my_types, &(&1 in l._target)) or l._accessible_all
        true -> true
      end

    dis_ok and (not want_cap or l._cap) and (not want_tr or l._tr) and (not want_ad or l._ad) and
      (subject == "" or l._subject == subject)
  end

  def campaigns(conn, params) do
    page = int(params["page"], 1) |> max(1)
    limit = int(params["limit"], 20) |> max(1) |> min(100)
    offset = (page - 1) * limit

    rows =
      SQL.json_all(
        """
        select to_jsonb(c) || jsonb_build_object('sponsor_name', sp.company_name) as row
        from public.sponsor_campaigns c left join public.sponsor_profiles sp on sp.id = c.sponsor_id
        where c.status::text in ('active','launched') and (c.end_date is null or c.end_date >= current_date)
        order by c.created_at desc limit #{limit} offset #{offset}
        """,
        []
      )

    json(conn, %{success: true, data: %{campaigns: rows, pagination: %{page: page, limit: limit}}})
  end

  def live_sessions(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)
      page = int(params["page"], 1) |> max(1)
      limit = int(params["limit"], 20) |> max(1) |> min(100)
      offset = (page - 1) * limit
      status_filter = params["status_filter"] || ""
      filter_by_dis = params["filter_by_disability"] not in [false, "false", "0"]

      my_types =
        if filter_by_dis do
          case SQL.json_one("select to_jsonb(p) as row from public.student_disability_profiles p where p.user_id = $1::uuid", [user_id]) do
            %{"has_disability" => true} = p -> p["disability_types"] || []
            _ -> []
          end
        else
          []
        end

      rows =
        SQL.maps(
          """
          select to_jsonb(s) session, c.title course_title,
            nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') teacher_name, up.avatar_url teacher_avatar
          from public.live_sessions s
          left join public.courses c on c.id = s.course_id
          left join public.teacher_profiles tp on tp.id = s.teacher_id
          left join public.user_profiles up on up.user_id = tp.user_id
          order by s.scheduled_start desc nulls last limit 200
          """,
          []
        )
        |> Enum.map(&live_session_view(&1, my_types))
        |> Enum.filter(fn s ->
          (status_filter == "" or s.status == status_filter) and
            (my_types == [] or s._target == [] or Enum.any?(my_types, &(&1 in s._target)))
        end)
        |> Enum.sort_by(&{&1.accessibility.relevance_score || 0, &1.scheduled_start || ""}, :desc)

      total = length(rows)
      page_rows = Enum.slice(rows, offset, limit) |> Enum.map(&Map.drop(&1, [:_target]))
      json(conn, %{success: true, data: %{sessions: page_rows, student_disability_types: my_types, filter_applied: filter_by_dis, pagination: %{total: total, page: page, limit: limit, total_pages: div(total + limit - 1, limit)}}})
    end
  end

  defp live_session_view(%{session: s} = r, my_types) do
    spec = s["target_disability_types"] || []
    score =
      if my_types != [] and spec != [] do
        Float.round(Enum.count(my_types, &(&1 in spec)) / length(my_types) * 100, 1)
      else
        0.0
      end

    %{
      id: s["id"], title: s["title"], description: s["description"], course_title: r.course_title,
      teacher_id: s["teacher_id"], teacher_name: r.teacher_name || "Unknown Teacher", teacher_avatar: r.teacher_avatar,
      scheduled_start: s["scheduled_start"], scheduled_end: s["scheduled_end"], session_type: s["session_type"],
      meeting_link: s["meeting_link"], status: s["status"], max_participants: s["max_participants"],
      current_participants: s["current_participants"] || 0, price: s["price"] || 0, requires_payment: s["requires_payment"] || false,
      accessibility: %{
        target_disability_types: spec, has_live_captions: s["has_live_captions"] || false,
        has_sign_language_interpreter: s["has_sign_language_interpreter"] || false,
        accessibility_level: s["accessibility_level"] || 3, relevance_score: (if score > 0, do: score, else: nil)
      },
      _target: spec
    }
  end

  def subjects(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      rows =
        SQL.maps(
          """
          select s.id::text id, s.name, s.description, s.category,
            (select count(*) from public.teacher_subjects ts where ts.subject_id = s.id)::int teacher_count,
            (select count(*) from public.courses c where c.subject_id = s.id and c.status = 'published')::int course_count
          from public.subjects s where s.is_active = true order by teacher_count desc, s.name asc
          """
        )

      json(conn, %{success: true, data: rows})
    end
  end

  def contact_teacher(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)
      teacher_id = params["teacher_id"]
      message = params["message"] || ""
      subject = params["subject"] || "General Inquiry"

      case SQL.one("select user_id::text from public.teacher_profiles where id = $1::uuid", [teacher_id]) do
        nil -> conn |> put_status(404) |> json(%{detail: "Teacher not found"})
        %{user_id: teacher_user_id} ->
          conv_id =
            case SQL.one("select id::text from public.conversations where (participant_1 = $1::uuid and participant_2 = $2::uuid) or (participant_1 = $2::uuid and participant_2 = $1::uuid) limit 1", [user_id, teacher_user_id]) do
              %{id: id} -> id
              nil -> SQL.scalar("insert into public.conversations (id, participant_1, participant_2, created_at) values (gen_random_uuid(), $1::uuid, $2::uuid, now()) returning id::text", [user_id, teacher_user_id])
            end

          msg_id = SQL.scalar("insert into public.messages (id, conversation_id, sender_id, content, is_read, created_at) values (gen_random_uuid(), $1::uuid, $2::uuid, $3, false, now()) returning id::text", [conv_id, user_id, "Subject: #{subject}\n\n#{message}"])
          SQL.maps("update public.conversations set last_message_at = now() where id = $1::uuid", [conv_id])

          name = SQL.one("select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') n from public.user_profiles where user_id = $1::uuid", [teacher_user_id])
          json(conn, %{success: true, message: "Message sent to #{(name && name.n) || "Teacher"}", data: %{conversation_id: conv_id, message_id: msg_id}})
      end
    end
  end

  # ---- conversations --------------------------------------------------------

  def conversations(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)
      limit = int(params["limit"], 20) |> max(1) |> min(100)
      offset = (int(params["page"], 1) |> max(1)) - 1
      offset = offset * limit

      rows =
        SQL.maps(
          """
          select c.id::text id,
            (case when c.participant_1 = $1::uuid then c.participant_2 else c.participant_1 end)::text other_id,
            nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') other_name,
            up.avatar_url, to_jsonb(tp) tp, c.last_message_at,
            (select content from public.messages m where m.conversation_id = c.id order by created_at desc limit 1) last_content,
            (select sender_id from public.messages m where m.conversation_id = c.id order by created_at desc limit 1)::text last_sender,
            (select count(*) from public.messages m where m.conversation_id = c.id and m.is_read = false and m.sender_id <> $1::uuid)::int unread
          from public.conversations c
          left join public.user_profiles up on up.user_id = (case when c.participant_1 = $1::uuid then c.participant_2 else c.participant_1 end)
          left join public.teacher_profiles tp on tp.user_id = (case when c.participant_1 = $1::uuid then c.participant_2 else c.participant_1 end)
          where c.participant_1 = $1::uuid or c.participant_2 = $1::uuid
          order by c.last_message_at desc nulls last limit #{limit} offset #{offset}
          """,
          [user_id]
        )
        |> Enum.map(fn c ->
          tp = c.tp || %{}
          online = tp["is_available"] || tp["is_online_available"] || false
          name = c.other_name || "Unknown User"

          %{
            id: c.id, teacher_id: c.other_id, teacher_name: name,
            subject: tp["specialization"] || "General", avatar: c.avatar_url || "https://ui-avatars.com/api/?name=#{URI.encode(name)}&background=3b82f6&color=ffffff",
            is_online: online, last_seen: (if c.last_message_at, do: "Recently", else: "No messages yet"),
            rating: numf(tp["average_rating"]), response_time: (if online, do: "Quick response", else: "Usually within a day"),
            unread_count: c.unread, last_message: c.last_content && String.slice(to_string(c.last_content), 0, 100),
            last_message_time: c.last_message_at, last_message_from_me: c.last_sender == user_id
          }
        end)

      json(conn, %{success: true, data: rows})
    end
  end

  def conversation_messages(conn, %{"conversation_id" => cid} = params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)

      case SQL.one("select id from public.conversations where id = $1::uuid and (participant_1 = $2::uuid or participant_2 = $2::uuid)", [cid, user_id]) do
        nil -> conn |> put_status(404) |> json(%{detail: "Conversation not found"})
        _ ->
          limit = int(params["limit"], 50) |> max(1) |> min(100)
          offset = (int(params["page"], 1) |> max(1)) - 1
          offset = offset * limit

          messages =
            SQL.maps(
              """
              select m.id::text id, m.sender_id::text sender_id, m.content, coalesce(m.is_read, false) is_read, m.created_at,
                m.attachments,
                nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') sender_name
              from public.messages m left join public.user_profiles up on up.user_id = m.sender_id
              where m.conversation_id = $1::uuid order by m.created_at desc limit #{limit} offset #{offset}
              """,
              [cid]
            )
            |> Enum.map(fn m ->
              %{
                id: m.id, conversation_id: cid, sender_id: m.sender_id, sender_name: m.sender_name || "Unknown",
                sender_role: (if m.sender_id == user_id, do: "student", else: "teacher"), content: m.content,
                attachments: m.attachments || [], is_read: m.is_read, created_at: m.created_at, is_from_me: m.sender_id == user_id, timestamp: m.created_at
              }
            end)
            |> Enum.reverse()

          SQL.maps("update public.messages set is_read = true where conversation_id = $1::uuid and sender_id <> $2::uuid and is_read = false", [cid, user_id])
          json(conn, %{success: true, data: %{messages: messages, pagination: %{total: length(messages), page: int(params["page"], 1), limit: limit}}})
      end
    end
  end

  def send_message(conn, %{"conversation_id" => cid} = params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)

      case SQL.one("select id from public.conversations where id = $1::uuid and (participant_1 = $2::uuid or participant_2 = $2::uuid)", [cid, user_id]) do
        nil -> conn |> put_status(404) |> json(%{detail: "Conversation not found"})
        _ ->
          content = params["content"] || ""
          id = SQL.scalar("insert into public.messages (id, conversation_id, sender_id, content, is_read, created_at) values (gen_random_uuid(), $1::uuid, $2::uuid, $3, false, now()) returning id::text", [cid, user_id, content])
          SQL.maps("update public.conversations set last_message_at = now() where id = $1::uuid", [cid])
          json(conn, %{success: true, data: %{id: id, content: content, created_at: DateTime.to_iso8601(DateTime.utc_now())}})
      end
    end
  end

  def create_conversation(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)
      other = params["user_id"]

      cond do
        is_nil(other) or other == "" -> conn |> put_status(400) |> json(%{detail: "user_id is required"})
        true ->
          existing = SQL.one("select id::text from public.conversations where (participant_1 = $1::uuid and participant_2 = $2::uuid) or (participant_1 = $2::uuid and participant_2 = $1::uuid) limit 1", [user_id, other])

          case existing do
            %{id: id} -> json(conn, %{success: true, data: %{id: id}, message: "Conversation already exists"})
            nil ->
              id = SQL.scalar("insert into public.conversations (id, participant_1, participant_2, created_at) values (gen_random_uuid(), $1::uuid, $2::uuid, now()) returning id::text", [user_id, other])
              json(conn, %{success: true, data: %{id: id}, message: "Conversation created"})
          end
      end
    end
  end

  # ---- content library ------------------------------------------------------

  def content_library(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)
      page = int(params["page"], 1) |> max(1)
      limit = int(params["limit"], 20) |> max(1) |> min(100)
      offset = (page - 1) * limit
      search = (params["search"] || "") |> String.downcase()
      category = (params["category"] || "") |> String.downcase()
      content_type = params["content_type"] || ""
      access_level = params["access_level"] || ""
      filter_by_dis = params["filter_by_disability"] not in [false, "false", "0"]

      my_types =
        if filter_by_dis do
          case SQL.json_one("select to_jsonb(p) as row from public.student_disability_profiles p where p.user_id = $1::uuid", [user_id]) do
            %{"has_disability" => true} = p -> p["disability_types"] || []
            _ -> []
          end
        else
          []
        end

      rows =
        SQL.maps(
          """
          select to_jsonb(cc) content, to_jsonb(c) course, s.name subject_name, s.category subject_category,
            nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') teacher_name,
            up.avatar_url teacher_avatar, tp.average_rating teacher_rating,
            exists(select 1 from public.course_enrollments e where e.course_id = cc.course_id and e.student_id = $1::uuid and e.status = 'active') has_access,
            (select count(*)::int from public.course_enrollments e2 where e2.course_id = cc.course_id) total_enrollments
          from public.course_content cc
          join public.courses c on c.id = cc.course_id and c.status = 'published'
          left join public.subjects s on s.id = c.subject_id
          left join public.teacher_profiles tp on tp.id = c.teacher_id
          left join public.user_profiles up on up.user_id = tp.user_id
          order by cc.course_id, cc.order_index nulls last
          """,
          [user_id]
        )
        |> Enum.map(&content_item_view(&1, my_types))
        |> Enum.filter(&content_matches?(&1, my_types, category, content_type, access_level, search))

      total = length(rows)
      page_rows = Enum.slice(rows, offset, limit) |> Enum.map(&Map.drop(&1, [:_category, :_accessible_all, :_target]))
      json(conn, %{success: true, data: %{content: page_rows, pagination: %{total: total, page: page, limit: limit, total_pages: div(total + limit - 1, limit)}}})
    end
  end

  defp content_item_view(%{content: item, course: course} = r, my_types) do
    spec = item["target_disability_types"] || []
    score =
      if my_types != [] and spec != [] do
        matches = Enum.count(my_types, &(&1 in spec))
        Float.round(matches / length(my_types) * 100, 1)
      else
        0.0
      end

    title = item["title"] || "Content"

    %{
      id: item["id"], title: item["title"], description: item["description"], content_type: item["content_type"],
      access_level: item["access_level"], duration: item["duration"], file_size: item["file_size"],
      content_url: item["content_url"], is_downloadable: item["is_downloadable"] || false,
      created_at: item["created_at"], order_index: item["order_index"], course_id: course["id"],
      course_title: course["title"], course_price: numf(course["price"]),
      teacher_id: course["teacher_id"], teacher_name: r.teacher_name || "Unknown Teacher",
      teacher_avatar: r.teacher_avatar, teacher_rating: numf(r.teacher_rating),
      subject_name: r.subject_name, subject_category: r.subject_category, has_access: r.has_access,
      progress_percentage: 0, time_spent_minutes: 0, is_completed: false, last_accessed_at: nil, total_enrollments: r.total_enrollments,
      thumbnail_url: "https://ui-avatars.com/api/?name=#{URI.encode(title)}&background=3b82f6&color=ffffff&size=400x300",
      accessibility: %{
        has_captions: present?(item["caption_url"]), has_transcript: present?(item["transcript_url"]),
        has_audio_description: present?(item["audio_description_url"]), has_sign_language: present?(item["sign_language_video_url"]),
        target_disability_types: spec, is_accessible_for_all: Map.get(item, "is_accessible_for_all", true),
        requires_vision: Map.get(item, "requires_vision", true), requires_hearing: Map.get(item, "requires_hearing", true),
        cognitive_level: item["cognitive_level"] || 3, accessibility_score: (if score > 0, do: score, else: nil)
      },
      _category: (r.subject_category || "") |> to_string() |> String.downcase(),
      _accessible_all: Map.get(item, "is_accessible_for_all", true), _target: spec
    }
  end

  defp content_matches?(item, my_types, category, content_type, access_level, search) do
    dis_ok =
      if my_types != [] and not item._accessible_all and item._target != [] do
        Enum.any?(my_types, &(&1 in item._target))
      else
        true
      end

    dis_ok and
      (category == "" or item._category == category) and
      (content_type == "" or item.content_type == content_type) and
      (access_level == "" or item.access_level == access_level) and
      (search == "" or String.contains?(String.downcase(item.title || ""), search) or String.contains?(String.downcase(item.description || ""), search))
  end

  defp present?(nil), do: false
  defp present?(""), do: false
  defp present?(_), do: true

  def content_categories(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      cats =
        SQL.maps("select distinct category from public.subjects where is_active = true and category is not null and category <> '' order by category")
        |> Enum.map(fn c -> %{value: c.category, label: String.capitalize(c.category)} end)

      json(conn, %{
        success: true,
        data: %{
          categories: cats,
          content_types: [
            %{value: "video", label: "Video", icon: "video"}, %{value: "document", label: "Document", icon: "file-text"},
            %{value: "quiz", label: "Quiz", icon: "help-circle"}, %{value: "assignment", label: "Assignment", icon: "edit"},
            %{value: "presentation", label: "Presentation", icon: "monitor"}
          ],
          access_levels: [
            %{value: "free", label: "Free", description: "Available to all students"},
            %{value: "enrolled", label: "Enrolled Only", description: "Requires course enrollment"},
            %{value: "premium", label: "Premium", description: "Requires premium subscription"}
          ]
        }
      })
    end
  end

  def content_detail(conn, %{"content_id" => content_id}) do
    with {:ok, _} <- require_role(conn, "student") do
      case SQL.json_one("select to_jsonb(cc) as row from public.course_content cc where cc.id = $1::uuid", [content_id]) do
        nil -> conn |> put_status(404) |> json(%{detail: "Content not found"})
        content ->
          course = SQL.json_one("select to_jsonb(c) as row from public.courses c where c.id = $1::uuid", [content["course_id"]])
          enrolled = not is_nil(SQL.one("select id from public.course_enrollments where student_id = $1::uuid and course_id = $2::uuid and status = 'active'", [uid(conn), content["course_id"]]))
          has_access = enrolled or content["access_level"] == "free"

          json(conn, %{success: true, data: %{
            id: content["id"], title: content["title"], description: content["description"],
            content_type: content["content_type"], access_level: content["access_level"], duration: content["duration"],
            content_url: (if has_access, do: content["content_url"], else: nil), is_downloadable: content["is_downloadable"],
            course_id: course && course["id"], course_title: course && course["title"], has_access: has_access
          }})
      end
    end
  end

  def content_progress(conn, %{"content_id" => content_id} = params) do
    with {:ok, _} <- require_role(conn, "student") do
      content = SQL.one("select course_id::text from public.course_content where id = $1::uuid", [content_id])

      cond do
        is_nil(content) -> conn |> put_status(404) |> json(%{detail: "Content not found"})
        true ->
          enrollment = SQL.one("select id::text from public.course_enrollments where student_id = $1::uuid and course_id = $2::uuid limit 1", [uid(conn), content.course_id])

          if is_nil(enrollment) do
            conn |> put_status(403) |> json(%{detail: "Not enrolled in this course"})
          else
            pct = params["progress_percentage"] || 0
            mins = params["time_spent_minutes"] || 0
            completed = params["is_completed"] || false
            existing = SQL.one("select id::text from public.student_progress where enrollment_id = $1::uuid and content_id = $2::uuid", [enrollment.id, content_id])

            if existing do
              SQL.maps("update public.student_progress set progress_percentage = $2, time_spent_minutes = $3, is_completed = $4, last_accessed = now() where id = $1::uuid", [existing.id, pct, mins, completed])
            else
              SQL.maps("insert into public.student_progress (id, enrollment_id, content_id, progress_percentage, time_spent_minutes, is_completed, last_accessed, created_at) values (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, now(), now())", [enrollment.id, content_id, pct, mins, completed])
            end

            json(conn, %{success: true, message: "Progress updated successfully"})
          end
      end
    end
  end

  # ---- forum ----------------------------------------------------------------

  def forum_posts(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      page = int(params["page"], 1) |> max(1)
      limit = int(params["limit"], 20) |> max(1) |> min(100)
      offset = (page - 1) * limit
      search = (params["search"] || "") |> String.downcase()
      category = params["category"] || ""
      order = if params["sort"] == "popular", do: "p.upvotes desc nulls last", else: "p.created_at desc"
      {cat_clause, args} = if category == "", do: {"", []}, else: {" where p.category::text = $1", [category]}

      rows =
        SQL.maps(
          """
          select to_jsonb(p) row,
            nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') author_name,
            up.avatar_url author_avatar, coalesce(up.reputation_score, 0) author_reputation,
            (select count(*) from public.forum_replies r where r.post_id = p.id)::int reply_count
          from public.forum_posts p left join public.user_profiles up on up.user_id = p.author_id
          #{cat_clause} order by #{order} limit #{limit} offset #{offset}
          """,
          args
        )
        |> Enum.map(&forum_post_view/1)
        |> Enum.filter(fn p -> search == "" or String.contains?(String.downcase(p.title || ""), search) or String.contains?(String.downcase(p._content || ""), search) end)
        |> Enum.map(&Map.drop(&1, [:_content]))

      total = SQL.scalar("select count(*)::int from public.forum_posts p#{cat_clause}", args, 0)
      json(conn, %{success: true, data: %{posts: rows, pagination: %{total: total, page: page, limit: limit, total_pages: div(total + limit - 1, limit)}}})
    end
  end

  def forum_categories(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      total = SQL.scalar("select count(*)::int from public.forum_posts", [], 0)
      solved = SQL.scalar("select count(*)::int from public.forum_posts where is_solved = true", [], 0)
      by_cat = SQL.maps("select category::text category, count(*)::int c from public.forum_posts group by 1") |> Map.new(&{&1.category, &1.c})

      defaults = [{"all", "All Posts"}, {"questions", "Questions"}, {"discussions", "Discussions"}, {"tips", "Tips & Tricks"}, {"announcements", "Announcements"}, {"solved", "Solved"}]

      data =
        Enum.map(defaults, fn {id, name} ->
          count = case id do
            "all" -> total
            "solved" -> solved
            _ -> Map.get(by_cat, id, 0)
          end
          %{id: id, name: name, count: count}
        end)

      json(conn, %{success: true, data: data})
    end
  end

  def forum_stats(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      s = SQL.one("select count(*)::int total, count(*) filter (where is_solved = true)::int solved, count(distinct author_id)::int authors from public.forum_posts")
      json(conn, %{success: true, data: %{totalPosts: s.total, activeUsers: s.authors, solvedQuestions: s.solved}})
    end
  end

  def forum_post_detail(conn, %{"post_id" => post_id}) do
    with {:ok, _} <- require_role(conn, "student") do
      case SQL.json_one("select to_jsonb(p) as row from public.forum_posts p where p.id = $1::uuid", [post_id]) do
        nil -> conn |> put_status(404) |> json(%{detail: "Post not found"})
        post ->
          author = SQL.one("select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') name, avatar_url from public.user_profiles where user_id = $1::uuid", [post["author_id"]]) || %{}

          replies =
            SQL.maps(
              """
              select r.id::text id, r.content, r.author_id::text author_id,
                nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') author_name,
                up.avatar_url author_avatar, coalesce(r.upvotes, 0) upvotes, coalesce(r.is_solution, false) is_accepted, r.created_at
              from public.forum_replies r left join public.user_profiles up on up.user_id = r.author_id
              where r.post_id = $1::uuid order by r.created_at asc
              """,
              [post_id]
            )
            |> Enum.map(&Map.update(&1, :author_name, "Anonymous", fn v -> v || "Anonymous" end))

          json(conn, %{success: true, data: %{
            id: post["id"], title: post["title"], content: post["content"], category: post["category"],
            author_id: post["author_id"], author_name: author[:name] || "Anonymous", author_avatar: author[:avatar_url],
            upvotes: post["upvotes"] || 0, downvotes: post["downvotes"] || 0, is_answered: post["is_solved"] || false,
            created_at: post["created_at"], replies: replies
          }})
      end
    end
  end

  def create_forum_post(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      image_url = (params["image_url"] || "") |> to_string() |> String.trim() |> nil_if_empty()

      _ = image_url
      category = if params["category"] in ~w(questions discussions tips announcements), do: params["category"], else: "discussions"

      id =
        SQL.scalar(
          """
          insert into public.forum_posts (id, title, content, category, author_id, tags, upvotes, downvotes, is_solved, created_at)
          values (gen_random_uuid(), $1, $2, $3::text::post_category, $4::uuid, $5::text[], 0, 0, false, now()) returning id::text
          """,
          [params["title"], params["content"], category, uid(conn), to_list(params["tags"])]
        )

      json(conn, %{success: true, message: "Post created successfully", data: %{id: id}})
    end
  end

  def vote_forum_post(conn, %{"post_id" => post_id} = params) do
    with {:ok, _} <- require_role(conn, "student") do
      if is_nil(SQL.one("select id from public.forum_posts where id = $1::uuid", [post_id])) do
        conn |> put_status(404) |> json(%{detail: "Post not found"})
      else
        col = if params["vote_type"] == "down", do: "downvotes", else: "upvotes"
        SQL.maps("update public.forum_posts set #{col} = coalesce(#{col}, 0) + 1 where id = $1::uuid", [post_id])
        json(conn, %{success: true, message: "Vote recorded"})
      end
    end
  end

  def create_forum_reply(conn, %{"post_id" => post_id} = params) do
    with {:ok, _} <- require_role(conn, "student") do
      if is_nil(SQL.one("select id from public.forum_posts where id = $1::uuid", [post_id])) do
        conn |> put_status(404) |> json(%{detail: "Post not found"})
      else
        id = SQL.scalar("insert into public.forum_replies (id, post_id, author_id, content, upvotes, is_solution, created_at) values (gen_random_uuid(), $1::uuid, $2::uuid, $3, 0, false, now()) returning id::text", [post_id, uid(conn), params["content"]])
        json(conn, %{success: true, message: "Reply created successfully", data: %{id: id}})
      end
    end
  end

  defp forum_post_view(%{row: p} = r) do
    content = p["content"] || ""
    name = r.author_name || "Anonymous"
    avatar = r.author_avatar || "https://ui-avatars.com/api/?name=#{URI.encode(name)}&background=random"

    %{
      id: p["id"], title: p["title"],
      content: (if String.length(content) > 200, do: String.slice(content, 0, 200) <> "...", else: content),
      _content: content, category: p["category"], tags: p["tags"] || [],
      author: %{name: name, avatar: avatar, role: "Student", reputation: r.author_reputation},
      upvotes: p["upvotes"] || 0, downvotes: p["downvotes"] || 0, replies: r.reply_count, views: p["views"] || 0,
      isPinned: p["is_pinned"] || false, isSolved: p["is_solved"] || false, hasImage: p["has_image"] || false,
      imageUrl: p["image_url"], accessibilityTags: p["accessibility_tags"] || [], hasPoll: p["has_poll"] || false,
      createdAt: p["created_at"]
    }
  end

  defp to_list(nil), do: []
  defp to_list(l) when is_list(l), do: l
  defp to_list(s) when is_binary(s), do: s |> String.split(",") |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))
  defp to_list(_), do: []

  defp nil_if_empty(""), do: nil
  defp nil_if_empty(v), do: v

  # ---- events ---------------------------------------------------------------

  def events(conn, params) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)
      page = int(params["page"], 1) |> max(1)
      limit = int(params["limit"], 20) |> max(1) |> min(100)
      offset = (page - 1) * limit
      search = (params["search"] || "") |> String.downcase()
      category = params["category"] || ""
      event_type = params["event_type"] || ""
      location_filter = params["location"] || "all"
      price_filter = params["price_filter"] || "all"

      rows =
        SQL.maps(
          """
          select to_jsonb(e) row,
            nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') organizer_name,
            up.avatar_url organizer_avatar,
            exists(select 1 from public.event_registrations r where r.event_id = e.id and r.user_id = $1::uuid) is_registered,
            exists(select 1 from public.wishlists b where b.event_id = e.id and b.user_id = $1::uuid and b.item_type = 'event') is_bookmarked
          from public.events e left join public.user_profiles up on up.user_id = e.organizer_id
          order by e.start_date asc limit #{limit} offset #{offset}
          """,
          [user_id]
        )
        |> Enum.map(&student_event_view/1)
        |> Enum.filter(fn ev ->
          (search == "" or String.contains?(String.downcase(ev.title || ""), search) or String.contains?(String.downcase(ev.description || ""), search)) and
            (category == "" or ev.category == category) and
            (event_type == "" or ev.event_type == event_type) and
            (location_filter == "all" or
               (location_filter == "online" and ev.is_online) or
               (location_filter != "online" and not ev.is_online and String.downcase(ev.location || "") =~ String.downcase(location_filter))) and
            (price_filter == "all" or (price_filter == "free" and ev.is_free) or (price_filter == "paid" and not ev.is_free))
        end)

      total = SQL.scalar("select count(*)::int from public.events", [], 0)
      json(conn, %{success: true, data: %{events: rows, pagination: %{total: total, page: page, limit: limit, total_pages: div(total + limit - 1, limit)}}})
    end
  end

  def event_categories(conn, _params) do
    with {:ok, _} <- require_role(conn, "student") do
      cats =
        SQL.maps("select distinct category::text category from public.events where category is not null order by 1")
        |> Enum.map(fn c -> %{value: c.category, label: String.capitalize(c.category)} end)

      json(conn, %{success: true, data: cats})
    end
  end

  def register_event(conn, %{"event_id" => event_id}) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)

      cond do
        is_nil(SQL.one("select id from public.events where id = $1::uuid", [event_id])) ->
          conn |> put_status(404) |> json(%{detail: "Event not found"})

        not is_nil(SQL.one("select id from public.event_registrations where event_id = $1::uuid and user_id = $2::uuid", [event_id, user_id])) ->
          conn |> put_status(400) |> json(%{detail: "Already registered for this event"})

        true ->
          id = SQL.scalar("insert into public.event_registrations (id, event_id, user_id, attendance_status, registration_date) values (gen_random_uuid(), $1::uuid, $2::uuid, 'registered', now()) returning id::text", [event_id, user_id])
          json(conn, %{success: true, message: "Successfully registered for event", data: %{registration_id: id}})
      end
    end
  end

  def unregister_event(conn, %{"event_id" => event_id}) do
    with {:ok, _} <- require_role(conn, "student") do
      SQL.maps("delete from public.event_registrations where event_id = $1::uuid and user_id = $2::uuid", [event_id, uid(conn)])
      json(conn, %{success: true, message: "Successfully unregistered from event"})
    end
  end

  def bookmark_event(conn, %{"event_id" => event_id}) do
    with {:ok, _} <- require_role(conn, "student") do
      user_id = uid(conn)

      if is_nil(SQL.one("select id from public.wishlists where event_id = $1::uuid and user_id = $2::uuid and item_type = 'event'", [event_id, user_id])) do
        SQL.maps("insert into public.wishlists (id, event_id, user_id, item_type, added_at) values (gen_random_uuid(), $1::uuid, $2::uuid, 'event', now())", [event_id, user_id])
        json(conn, %{success: true, message: "Event bookmarked successfully"})
      else
        json(conn, %{success: true, message: "Event already bookmarked"})
      end
    end
  end

  def unbookmark_event(conn, %{"event_id" => event_id}) do
    with {:ok, _} <- require_role(conn, "student") do
      SQL.maps("delete from public.wishlists where event_id = $1::uuid and user_id = $2::uuid and item_type = 'event'", [event_id, uid(conn)])
      json(conn, %{success: true, message: "Bookmark removed"})
    end
  end

  defp student_event_view(%{row: e} = r) do
    %{
      id: e["id"], title: e["title"], description: e["description"], event_type: e["event_type"],
      category: e["category"], start_date: e["start_date"], end_date: e["end_date"], location: e["location"],
      is_online: e["is_online"] || false, meeting_link: e["meeting_link"], max_attendees: e["max_attendees"],
      current_attendees: e["current_attendees"] || 0, is_free: numf(e["price"]) == 0.0, price: numf(e["price"]),
      original_price: if(e["original_price"], do: numf(e["original_price"]), else: nil),
      image_url: e["image_url"], organizer_name: r.organizer_name || "Unknown", organizer_avatar: r.organizer_avatar,
      tags: e["tags"] || [], level: e["level"], languages: e["languages"] || [],
      has_certificate: e["has_certificate"] || false, sponsor: e["sponsor"], is_featured: e["is_featured"] || false,
      is_registered: r.is_registered, is_bookmarked: r.is_bookmarked
    }
  end

  # ---- helpers --------------------------------------------------------------

  defp int(nil, d), do: d
  defp int(v, _d) when is_integer(v), do: v
  defp int(v, d) when is_binary(v), do: (case Integer.parse(v) do
    {n, _} -> n
    :error -> d
  end)
  defp int(_, d), do: d

  defp student_sessions(user_id) do
    rows =
      SQL.maps(
        """
        select s.id::text id, s.title, s.description, s.scheduled_start, s.scheduled_end,
          s.session_type, s.status, s.recording_url, coalesce(c.title, '') course_title,
          nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), '') teacher_name
        from public.live_session_enrollment_requests r
        join public.live_sessions s on s.id = r.session_id
        left join public.teacher_profiles tp on tp.id = s.teacher_id
        left join public.user_profiles up on up.user_id = tp.user_id
        left join public.courses c on c.id = s.course_id
        where r.student_id = $1::uuid and r.status = 'approved' limit 50
        """,
        [user_id]
      )
      |> Enum.map(fn s ->
        %{
          id: s.id, title: s.title || "Live session", description: s.description || "",
          course_title: if(s.course_title == "", do: session_type_label(s.session_type), else: s.course_title),
          teacher_name: s.teacher_name || "Your teacher",
          scheduled_start: s.scheduled_start, scheduled_end: s.scheduled_end,
          session_type: s.session_type || "online", status: s.status || "scheduled",
          meeting_link: "/students/meeting-room/#{s.id}", recording_url: s.recording_url
        }
      end)

    now = DateTime.utc_now()

    {past_rec, future} =
      Enum.split_with(rows, fn s ->
        ended = ((s.status || "") |> String.downcase()) in ["ended", "completed"] or past?(s.scheduled_end, now)
        ended and s.recording_url
      end)

    upcoming = future |> Enum.sort_by(& &1.scheduled_start) |> Enum.take(10)
    recordings = past_rec |> Enum.sort_by(& &1.scheduled_end, :desc) |> Enum.take(6)
    {upcoming, recordings}
  end

  defp session_type_label(nil), do: "Live session"
  defp session_type_label(t), do: t |> String.replace("_", " ") |> String.split() |> Enum.map_join(" ", &String.capitalize/1)

  defp past?(nil, _now), do: false
  defp past?(ts, now) do
    case parse_ts(ts) do
      nil -> false
      dt -> DateTime.compare(dt, now) == :lt
    end
  end

  defp parse_ts(%DateTime{} = dt), do: dt
  defp parse_ts(%NaiveDateTime{} = ndt), do: DateTime.from_naive!(ndt, "Etc/UTC")
  defp parse_ts(s) when is_binary(s) do
    s = String.replace(s, " ", "T")
    s = if String.contains?(s, "+") or String.ends_with?(s, "Z"), do: s, else: s <> "Z"
    case DateTime.from_iso8601(s) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end
  defp parse_ts(_), do: nil

  defp uid(conn), do: conn.assigns.current_user_id
end
