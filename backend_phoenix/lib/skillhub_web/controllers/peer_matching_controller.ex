defmodule SkillHubWeb.PeerMatchingController do
  @moduledoc """
  Ported peer matching (peer_matching.py). Same transparent scoring model
  (+3 shared course, +2 per shared disability type, +1 language, +1 location),
  but the Python N+1 loops collapse into a single ranked SQL query.
  """
  use SkillHubWeb, :controller

  import SkillHubWeb.AuthHelpers
  alias SkillHub.SQL

  def index(conn, params) do
    with {:ok, user} <- require_role(conn, "student") do
      limit = clamp(params["limit"], 20, 1, 50)
      rows = ranked(to_string(user.id), limit)
      json(conn, %{success: true, matches: Enum.map(rows, &to_match/1)})
    end
  end

  defp ranked(user_id, limit) do
    SQL.maps(
      """
      with
      my_courses as (
        select distinct course_id from public.course_enrollments
        where student_id = $1::uuid and course_id is not null),
      my_dis as (
        select distinct d from public.student_disability_profiles,
          unnest(coalesce(disability_types, '{}')) d
        where user_id = $1::uuid and d is not null and d <> ''),
      my_lang as (
        select left(coalesce(preferred_language, 'en'), 2) l
        from public.language_preferences where user_id = $1::uuid limit 1),
      my_loc as (
        select lower(trim(coalesce(location, ''))) loc
        from public.user_profiles where user_id = $1::uuid limit 1),
      course_s as (
        select ce.student_id sid, count(distinct ce.course_id)::int shared_courses
        from public.course_enrollments ce
        where ce.course_id in (select course_id from my_courses) and ce.student_id <> $1::uuid
        group by ce.student_id),
      dis_s as (
        select sdp.user_id sid, array_agg(distinct d) shared_dis
        from public.student_disability_profiles sdp, unnest(coalesce(sdp.disability_types, '{}')) d
        where d in (select d from my_dis) and sdp.user_id <> $1::uuid
        group by sdp.user_id),
      lang_s as (
        select lp.user_id sid from public.language_preferences lp
        where left(coalesce(lp.preferred_language, 'en'), 2) = (select l from my_lang)
          and lp.user_id <> $1::uuid),
      loc_s as (
        select up.user_id sid, up.location loc from public.user_profiles up, my_loc
        where my_loc.loc <> '' and lower(trim(coalesce(up.location, ''))) <> ''
          and (position(my_loc.loc in lower(trim(up.location))) > 0
               or position(lower(trim(up.location)) in my_loc.loc) > 0)
          and up.user_id <> $1::uuid),
      cand as (select id from public.users where role = 'student' and is_active and id <> $1::uuid)
      select
        c.id::text sid,
        nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') name,
        p.avatar_url, p.location,
        coalesce(cs.shared_courses, 0) shared_courses,
        coalesce(ds.shared_dis, '{}') shared_dis,
        (ls.sid is not null) lang_match,
        (lo.sid is not null) loc_match,
        (select l from my_lang) my_lang,
        (3 * coalesce(cs.shared_courses, 0)
          + 2 * coalesce(array_length(ds.shared_dis, 1), 0)
          + (case when ls.sid is not null then 1 else 0 end)
          + (case when lo.sid is not null then 1 else 0 end))::int score
      from cand c
      left join course_s cs on cs.sid = c.id
      left join dis_s ds on ds.sid = c.id
      left join lang_s ls on ls.sid = c.id
      left join loc_s lo on lo.sid = c.id
      left join public.user_profiles p on p.user_id = c.id
      where (3 * coalesce(cs.shared_courses, 0)
        + 2 * coalesce(array_length(ds.shared_dis, 1), 0)
        + (case when ls.sid is not null then 1 else 0 end)
        + (case when lo.sid is not null then 1 else 0 end)) > 0
      order by score desc
      limit $2
      """,
      [user_id, limit]
    )
  end

  defp to_match(r) do
    reasons =
      []
      |> maybe(r.shared_courses > 0, "shares #{r.shared_courses} course#{plural(r.shared_courses)}")
      |> maybe(length(r.shared_dis) > 0, "shares accessibility profile (#{Enum.join(Enum.sort(r.shared_dis), ", ")})")
      |> maybe(r.lang_match, "speaks #{r.my_lang}")
      |> maybe(r.loc_match, "near #{r.location}")
      |> Enum.take(3)

    %{
      user_id: r.sid,
      name: r.name || "Peer",
      avatar_url: r.avatar_url,
      location: r.location,
      score: r.score,
      reasons: reasons
    }
  end

  defp maybe(list, true, reason), do: list ++ [reason]
  defp maybe(list, _false, _reason), do: list
  defp plural(1), do: ""
  defp plural(_), do: "s"

  defp clamp(nil, default, _lo, _hi), do: default
  defp clamp(v, default, lo, hi) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n |> max(lo) |> min(hi)
      :error -> default
    end
  end
  defp clamp(v, _default, lo, hi) when is_integer(v), do: v |> max(lo) |> min(hi)
end
