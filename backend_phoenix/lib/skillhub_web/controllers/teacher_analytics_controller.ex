defmodule SkillHubWeb.TeacherAnalyticsController do
  @moduledoc "Ported teacher analytics summary (teacher_analytics.py). Teacher-gated."
  use SkillHubWeb, :controller

  import SkillHubWeb.AuthHelpers
  alias SkillHub.SQL

  @days %{"week" => 7, "month" => 30, "quarter" => 90, "year" => 365}

  def summary(conn, params) do
    period = if params["period"] in Map.keys(@days), do: params["period"], else: "month"

    with {:ok, user} <- require_role(conn, "teacher") do
      tp = SQL.one("select id::text from public.teacher_profiles where user_id = $1::uuid", [to_string(user.id)])

      case tp do
        nil ->
          conn |> put_status(404) |> json(%{detail: "Teacher profile not set up."})

        %{id: teacher_profile_id} ->
          json(conn, build_summary(teacher_profile_id, period))
      end
    end
  end

  defp build_summary(teacher_profile_id, period) do
    days = @days[period]

    sessions =
      SQL.one(
        """
        select
          count(*) filter (where status = 'completed' and scheduled_start >= now() - ($2 || ' days')::interval)::int as completed,
          coalesce(sum(extract(epoch from (scheduled_end - scheduled_start)) / 60) filter (where status = 'completed' and scheduled_start >= now() - ($2 || ' days')::interval), 0)::int as minutes
        from public.live_sessions where teacher_id = $1::uuid
        """,
        [teacher_profile_id, to_string(days)]
      )

    retention =
      SQL.one(
        """
        with counts as (
          select sp.student_id, count(*) as c
          from public.session_participants sp
          join public.live_sessions ls on ls.id = sp.session_id
          where ls.teacher_id = $1::uuid
          group by sp.student_id
        )
        select count(*)::int as students, count(*) filter (where c >= 2)::int as repeat
        from counts
        """,
        [teacher_profile_id]
      )

    earnings =
      SQL.one(
        """
        select coalesce(sum(p.amount), 0)::float as total
        from public.live_session_payments p
        join public.live_sessions ls on ls.id = p.session_id
        where ls.teacher_id = $1::uuid and p.payment_status = 'completed'
        """,
        [teacher_profile_id]
      )

    trend =
      SQL.maps(
        """
        select to_char(date_trunc('month', p.created_at), 'YYYY-MM') as month, round(sum(p.amount), 2)::float as amount
        from public.live_session_payments p
        join public.live_sessions ls on ls.id = p.session_id
        where ls.teacher_id = $1::uuid and p.payment_status = 'completed'
        group by 1 order by 1 desc limit 12
        """,
        [teacher_profile_id]
      )
      |> Enum.reverse()

    ratings =
      SQL.one(
        "select round(avg(rating), 2)::float as avg, count(*)::int as n from public.reviews where teacher_id = $1::uuid and rating is not null",
        [teacher_profile_id]
      )

    students_taught = retention.students
    retention_rate = if students_taught > 0, do: Float.round(retention.repeat / students_taught, 2), else: nil

    %{
      success: true,
      period: period,
      hours_taught: Float.round(sessions.minutes / 60, 1),
      students_taught: students_taught,
      completed_sessions: sessions.completed,
      avg_rating: ratings.avg,
      review_count: ratings.n,
      total_earnings_lkr: Float.round(earnings.total, 2),
      earnings_trend: trend,
      student_retention: retention_rate
    }
  end
end
