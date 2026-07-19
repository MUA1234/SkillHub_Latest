defmodule SkillHubWeb.SponsorImpactController do
  @moduledoc "Ported sponsor impact summary (sponsor_impact.py). Sponsor-gated."
  use SkillHubWeb, :controller

  import SkillHubWeb.AuthHelpers
  alias SkillHub.SQL

  def summary(conn, _params) do
    with {:ok, user} <- require_role(conn, "sponsor") do
      # scholarships/student_funding_grants.sponsor_id references
      # sponsor_profiles.id, NOT users.id — using the raw user id here meant
      # every query below matched nothing, so this endpoint always returned
      # zeros regardless of real sponsor activity.
      case SQL.one("select id::text as id from public.sponsor_profiles where user_id = $1::uuid", [user.id]) do
        nil ->
          conn |> put_status(404) |> json(%{detail: "Sponsor profile not set up yet."})

        %{id: sponsor_id} ->
          summary_for(conn, sponsor_id)
      end
    end
  end

  defp summary_for(conn, sponsor_id) do
      sch =
        SQL.one(
          """
          select
            count(*)::int as count,
            coalesce(sum(total_amount_lkr), 0)::float as total_funded_lkr,
            coalesce(sum(slots_available), 0)::int as slots_total,
            coalesce(sum(slots_filled), 0)::int as slots_filled
          from public.scholarships where sponsor_id = $1::uuid
          """,
          [sponsor_id]
        )

      grants =
        SQL.one(
          """
          with funded as (
            select distinct g.student_id, g.amount_lkr, g.created_at
            from public.student_funding_grants g
            where g.sponsor_id = $1::uuid
          )
          select
            count(distinct student_id)::int as funded_count,
            coalesce(sum(amount_lkr), 0)::float as grant_total_lkr
          from funded
          """,
          [sponsor_id]
        )

      outcomes =
        SQL.one(
          """
          with funded as (
            select distinct g.student_id
            from public.student_funding_grants g
            where g.sponsor_id = $1::uuid
          )
          select
            count(*) filter (where exists (
              select 1 from public.course_enrollments e
              where e.student_id = f.student_id and e.status = 'completed'))::int as completed,
            count(*) filter (where not exists (
              select 1 from public.course_enrollments e
              where e.student_id = f.student_id and e.status = 'completed')
              and exists (
              select 1 from public.course_enrollments e2 where e2.student_id = f.student_id))::int as active
          from funded f
          """,
          [sponsor_id]
        )

      trend =
        SQL.maps(
          """
          select to_char(date_trunc('month', g.created_at), 'YYYY-MM') as month, count(*)::int as count
          from public.student_funding_grants g
          where g.sponsor_id = $1::uuid
          group by 1 order by 1 desc limit 12
          """,
          [sponsor_id]
        )
        |> Enum.reverse()

      geography =
        SQL.maps(
          """
          with funded as (
            select distinct g.student_id from public.student_funding_grants g where g.sponsor_id = $1::uuid
          )
          select trim(p.location) as name, count(*)::int as count
          from funded f join public.user_profiles p on p.user_id = f.student_id
          where p.location is not null and trim(p.location) <> ''
          group by 1 order by count desc limit 10
          """,
          [sponsor_id]
        )

      disability =
        SQL.maps(
          """
          with funded as (
            select distinct g.student_id from public.student_funding_grants g where g.sponsor_id = $1::uuid
          )
          select d as type, count(*)::int as count
          from funded f
          join public.student_disability_profiles sdp on sdp.user_id = f.student_id,
          unnest(coalesce(sdp.disability_types, '{}')) as d
          where d is not null and d <> ''
          group by d order by count desc
          """,
          [sponsor_id]
        )

      funded_count = grants.funded_count
      completion_rate = if funded_count > 0, do: Float.round(outcomes.completed / funded_count, 2), else: nil

      json(conn, %{
        success: true,
        scholarships: %{
          count: sch.count,
          total_funded_lkr: Float.round(sch.total_funded_lkr, 2),
          slots_total: sch.slots_total,
          slots_filled: sch.slots_filled
        },
        students_funded: %{
          count: funded_count,
          completed_at_least_one_course: outcomes.completed,
          currently_active: outcomes.active,
          completion_rate: completion_rate,
          grant_total_lkr: Float.round(grants.grant_total_lkr, 2)
        },
        funded_trend: trend,
        geography: geography,
        disability_breakdown: disability
      })
  end
end
