defmodule SkillHubWeb.ImpactController do
  @moduledoc "Ported public impact stats (impact.py). Unauthenticated."
  use SkillHubWeb, :controller

  alias SkillHub.SQL

  def show(conn, _params) do
    students = SQL.one("select count(*)::int total, count(*) filter (where is_active)::int active from public.users where role = 'student'")

    teachers_verified = SQL.scalar("select count(*)::int from public.teacher_profiles where is_verified", [], 0)

    sch =
      SQL.one("""
      select
        coalesce(sum(total_amount_lkr), 0)::float as total_funded,
        count(*)::int as total_count,
        count(*) filter (where status = 'open')::int as open_count,
        coalesce(sum(slots_filled), 0)::int as students_funded
      from public.scholarships
      """)

    top_locations =
      SQL.maps("""
      select name, sum(cnt)::int as count from (
        select trim(loc) as name, 1 as cnt
          from public.scholarships, unnest(coalesce(target_locations, '{}')) as loc
          where trim(loc) <> ''
        union all
        select trim(location) as name, 1 as cnt
          from public.user_profiles
          where location is not null and trim(location) <> ''
      ) t
      group by name order by count desc limit 10
      """)

    disability =
      SQL.maps("""
      select d as type, count(*)::int as count
        from public.student_disability_profiles, unnest(coalesce(disability_types, '{}')) as d
        where d is not null and d <> ''
        group by d order by count desc
      """)

    courses = SQL.one("select count(*) filter (where status = 'published')::int as published from public.courses")
    completions = SQL.scalar("select count(*)::int from public.course_enrollments where status = 'completed'", [], 0)

    json(conn, %{
      success: true,
      as_of: DateTime.utc_now() |> DateTime.to_iso8601(),
      students: %{
        total: students.total,
        active: students.active,
        funded_via_scholarships: sch.students_funded
      },
      teachers: %{verified: teachers_verified},
      scholarships: %{
        total_funded_lkr: sch.total_funded,
        total_count: sch.total_count,
        open: sch.open_count
      },
      courses: %{published: courses.published, completions: completions},
      geography: %{top_locations: top_locations},
      disability_breakdown: disability
    })
  end
end
