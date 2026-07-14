defmodule SkillHubWeb.UserController do
  @moduledoc "Ported role-agnostic user endpoints (users.py): profile + dashboard stats."
  use SkillHubWeb, :controller

  alias SkillHub.SQL

  @allowed ~w(first_name last_name phone date_of_birth location bio avatar_url university student_id major year gpa country city)

  @select "id::text, user_id::text, first_name, last_name, phone, date_of_birth, location, bio, avatar_url, university, student_id, major, year, gpa::float, coalesce(reputation_score, 0)::int reputation_score, created_at, updated_at"

  def get_profile(conn, _params) do
    json(conn, load_profile(conn))
  end

  def update_profile(conn, params) do
    user_id = uid(conn)
    updates = Map.take(params, @allowed) |> Enum.reject(fn {_k, v} -> is_nil(v) end) |> Map.new()

    if map_size(updates) == 0 do
      conn |> put_status(400) |> json(%{detail: "No valid fields provided for update"})
    else
      exists = SQL.one("select id from public.user_profiles where user_id = $1::uuid", [user_id])
      if exists, do: do_update(user_id, updates), else: do_insert(user_id, updates)
      json(conn, load_profile(conn))
    end
  end

  def dashboard_stats(conn, _params) do
    user_id = uid(conn)
    user = conn.assigns.current_user
    role = to_string(user.role || "student")

    unread =
      SQL.scalar("select count(*)::int from public.notifications where user_id = $1::uuid and is_read = false", [user_id], 0)

    stats = Map.merge(%{role: role, unread_notifications: unread}, role_stats(role, user_id))
    json(conn, %{success: true, data: stats})
  end

  # --- helpers ---------------------------------------------------------------

  defp load_profile(conn) do
    user_id = uid(conn)
    profile = SQL.one("select #{@select} from public.user_profiles where user_id = $1::uuid", [user_id]) || seed_profile(user_id)
    user = SQL.one("select email, is_verified, created_at from public.users where id = $1::uuid", [user_id])

    profile
    |> Map.put(:email, (user && user[:email]) || conn.assigns.current_user.email)
    |> Map.put(:reputation_score, profile[:reputation_score] || 0)
  end

  defp seed_profile(user_id) do
    SQL.one(
      "insert into public.user_profiles (user_id, reputation_score, created_at, updated_at) " <>
        "values ($1::uuid, 0, now(), now()) returning #{@select}",
      [user_id]
    )
  end

  defp do_insert(user_id, updates) do
    cols = Map.keys(updates)
    ph = Enum.map_join(2..(length(cols) + 1), ", ", &"$#{&1}")

    SQL.maps(
      "insert into public.user_profiles (user_id, #{Enum.join(cols, ", ")}, reputation_score, created_at, updated_at) " <>
        "values ($1::uuid, #{ph}, 0, now(), now())",
      [user_id | Enum.map(cols, &updates[&1])]
    )
  end

  defp do_update(user_id, updates) do
    cols = Map.keys(updates)
    set = cols |> Enum.with_index(2) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}" end)

    SQL.maps(
      "update public.user_profiles set #{set}, updated_at = now() where user_id = $1::uuid",
      [user_id | Enum.map(cols, &updates[&1])]
    )
  end

  defp role_stats("teacher", user_id) do
    tp = SQL.one("select id::text from public.teacher_profiles where user_id = $1::uuid", [user_id])

    if tp do
      c =
        SQL.one(
          "select count(*)::int total, count(*) filter (where status = 'published')::int published " <>
            "from public.courses where teacher_id = $1::uuid",
          [tp[:id]]
        )

      %{total_courses: c.total, published_courses: c.published}
    else
      %{total_courses: 0, published_courses: 0}
    end
  end

  defp role_stats("sponsor", user_id) do
    safe(fn ->
      c =
        SQL.one(
          "select count(*)::int total, count(*) filter (where status = 'active')::int active " <>
            "from public.scholarship_grants where sponsor_id = $1::uuid",
          [user_id]
        )

      %{total_grants: c.total, active_grants: c.active}
    end) || %{total_grants: 0, active_grants: 0}
  end

  defp role_stats(_student, user_id) do
    c =
      SQL.one(
        """
        select
          count(*)::int total,
          count(*) filter (where status = 'active')::int active,
          count(*) filter (where status = 'completed')::int completed,
          coalesce(round(avg(coalesce(progress_percentage, 0)), 1), 0)::float avg
        from public.course_enrollments where student_id = $1::uuid
        """,
        [user_id]
      )

    %{
      total_enrollments: c.total,
      active_enrollments: c.active,
      completed_enrollments: c.completed,
      avg_progress: c.avg
    }
  end

  defp safe(fun) do
    try do
      fun.()
    rescue
      _ -> nil
    end
  end

  defp uid(conn), do: conn.assigns.current_user_id
end
