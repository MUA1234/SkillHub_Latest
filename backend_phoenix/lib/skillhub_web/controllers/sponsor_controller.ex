defmodule SkillHubWeb.SponsorController do
  @moduledoc """
  Ported sponsor hub (sponsors.py). Built out incrementally; routes not yet
  listed in the router fall through to the Python service via the strangler.
  """
  use SkillHubWeb, :controller

  import SkillHubWeb.AuthHelpers
  alias SkillHub.SQL

  @profile_cols ~w(company_name industry website description contact_person contact_email contact_phone logo_url)

  @doc "POST /sponsors/profile/setup — idempotent create/update of sponsor_profiles."
  def setup_profile(conn, params) do
    with {:ok, _} <- require_role(conn, "sponsor") do
      user_id = uid(conn)
      data = Map.take(params, @profile_cols) |> Enum.reject(fn {_k, v} -> is_nil(v) end) |> Map.new()

      case SQL.one("select id::text from public.sponsor_profiles where user_id = $1::uuid", [user_id]) do
        %{id: id} ->
          update_profile(id, data)
          json(conn, %{success: true, profile_id: id, created: false})

        nil ->
          id = insert_profile(user_id, data)
          json(conn, %{success: true, profile_id: id, created: true})
      end
    end
  end

  @doc "GET /sponsors/dashboard — overview stats with period-over-period growth."
  def dashboard(conn, _params) do
    with {:ok, profile} <- sponsor_profile(conn) do
      sid = profile["id"]
      user_id = uid(conn)

      cur = campaign_totals(sid, nil)
      event_inv = event_investment(user_id, nil)
      total = cur.budget + event_inv
      students = cur.students
      roi = if total > 0, do: Float.round(students * 1000 / total * 100, 1), else: 0.0

      prev = campaign_totals(sid, {60, 30})
      prev_event = event_investment(user_id, {60, 30})
      prev_total = prev.budget + prev_event
      prev_roi = if prev_total > 0, do: Float.round(prev.students * 1000 / prev_total * 100, 1), else: 0.0

      json(conn, %{
        success: true,
        data: %{
          stats: %{
            activeCampaigns: %{value: to_string(cur.active), change: int_change(cur.active, prev.active)},
            studentsReached: %{value: commas(students), change: pct_change(students, prev.students)},
            investment: %{value: lkr_compact(total), change: pct_change(total, prev_total)},
            roi: %{value: "#{roi}%", change: pct_change(roi, prev_roi)}
          },
          sponsor: %{
            id: profile["id"],
            company_name: profile["company_name"],
            total_investment: profile["total_investment"] || 0,
            active_campaigns: profile["active_campaigns"] || 0,
            students_reached: profile["students_reached"] || 0,
            roi_percentage: profile["roi_percentage"] || 0
          }
        }
      })
    end
  end

  @doc "GET /sponsors/campaigns — paginated campaign list."
  def campaigns(conn, params) do
    with {:ok, profile} <- sponsor_profile(conn) do
      sid = profile["id"]
      page = int(params["page"], 1) |> max(1)
      limit = int(params["limit"], 10) |> max(1) |> min(50)
      offset = (page - 1) * limit
      status_filter = params["status_filter"] || "all"

      {status_clause, sargs} =
        if status_filter == "all", do: {"", []}, else: {" and status = $2", [status_filter]}

      rows =
        SQL.json_all(
          "select to_jsonb(c) as row from public.sponsor_campaigns c where c.sponsor_id = $1::uuid#{status_clause} order by c.created_at desc limit #{limit} offset #{offset}",
          [sid | sargs]
        )
        |> Enum.map(&campaign_view/1)

      total = SQL.scalar("select count(*)::int from public.sponsor_campaigns where sponsor_id = $1::uuid#{status_clause}", [sid | sargs], 0)

      json(conn, %{success: true, data: %{campaigns: rows, pagination: %{page: page, limit: limit, total: total, pages: div(total + limit - 1, limit)}}})
    end
  end

  @doc "GET /sponsors/campaigns/detailed — same rows, full detail."
  def campaigns_detailed(conn, params) do
    with {:ok, profile} <- sponsor_profile(conn) do
      status_filter = params["status_filter"] || "all"
      {clause, args} = if status_filter == "all", do: {"", []}, else: {" and status = $2", [status_filter]}
      rows = SQL.json_all("select to_jsonb(c) as row from public.sponsor_campaigns c where c.sponsor_id = $1::uuid#{clause} order by c.created_at desc", [profile["id"] | args])
      json(conn, %{success: true, data: %{campaigns: rows}})
    end
  end

  def create_campaign(conn, params) do
    with {:ok, profile} <- sponsor_profile(conn) do
      title = (params["title"] || "") |> to_string() |> String.trim()
      budget = num(params["budget"])

      cond do
        title == "" -> conn |> put_status(400) |> json(%{detail: "Campaign title is required"})
        budget <= 0 -> conn |> put_status(400) |> json(%{detail: "Campaign budget must be greater than 0"})
        true ->
          id =
            SQL.scalar(
              "insert into public.sponsor_campaigns (sponsor_id, title, description, budget, start_date, end_date, status) values ($1::uuid, $2, $3, $4, $5::text::date, $6::text::date, 'draft') returning id::text",
              [profile["id"], title, String.trim(to_string(params["description"] || "")), budget, blank(params["startDate"]), blank(params["endDate"])]
            )

          json(conn, %{success: true, message: "Campaign created successfully", data: %{campaignId: id}})
      end
    end
  end

  def update_campaign(conn, %{"campaign_id" => id} = params) do
    with {:ok, profile} <- sponsor_profile(conn),
         true <- owns_campaign?(id, profile["id"]) do
      mapping = %{"title" => "title", "description" => "description", "budget" => "budget", "status" => "status", "studentsReached" => "students_reached", "completionPercentage" => "completion_percentage"}
      updates = for {k, col} <- mapping, Map.has_key?(params, k), into: %{}, do: {col, params[k]}

      if map_size(updates) == 0 do
        conn |> put_status(400) |> json(%{detail: "No valid fields to update"})
      else
        cols = Map.keys(updates)
        set = cols |> Enum.with_index(2) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}" end)
        SQL.maps("update public.sponsor_campaigns set #{set} where id = $1::uuid", [id | Enum.map(cols, &updates[&1])])
        json(conn, %{success: true, message: "Campaign updated successfully"})
      end
    else
      false -> conn |> put_status(404) |> json(%{detail: "Campaign not found or access denied"})
      other -> other
    end
  end

  def delete_campaign(conn, %{"campaign_id" => id}) do
    with {:ok, profile} <- sponsor_profile(conn) do
      case SQL.one("select status from public.sponsor_campaigns where id = $1::uuid and sponsor_id = $2::uuid", [id, profile["id"]]) do
        nil -> conn |> put_status(404) |> json(%{detail: "Campaign not found or access denied"})
        %{status: "active"} -> conn |> put_status(400) |> json(%{detail: "Cannot delete active campaigns. Please pause or complete the campaign first."})
        _ ->
          SQL.maps("delete from public.sponsor_campaigns where id = $1::uuid", [id])
          json(conn, %{success: true, message: "Campaign deleted successfully"})
      end
    end
  end

  @doc "GET /sponsors/recent-impact — recent campaign + event activity feed."
  def recent_impact(conn, params) do
    with {:ok, profile} <- sponsor_profile(conn) do
      days = int(params["days"], 30) |> max(1) |> min(90)

      campaigns =
        SQL.maps(
          "select title, students_reached, created_at from public.sponsor_campaigns where sponsor_id = $1::uuid and created_at >= now() - ($2 || ' days')::interval and completion_percentage > 0 order by created_at desc limit 5",
          [profile["id"], to_string(days)]
        )
        |> Enum.map(fn c ->
          %{id: Ecto.UUID.generate(), type: "Campaign Progress",
            description: "#{c.title} reached #{c.students_reached || 0} students",
            impact: if((c.students_reached || 0) > 100, do: "High", else: "Medium"),
            date: ago(c.created_at)}
        end)

      events =
        SQL.maps(
          "select title, current_attendees, start_date from public.events where organizer_id = $1::uuid and start_date >= now() - ($2 || ' days')::interval order by start_date desc limit 3",
          [uid(conn), to_string(days)]
        )
        |> Enum.map(fn e ->
          %{id: Ecto.UUID.generate(), type: "Event Success",
            description: "#{e.title} reached #{e.current_attendees || 0}+ participants",
            impact: if((e.current_attendees || 0) > 200, do: "High", else: "Medium"),
            date: ago(e.start_date)}
        end)

      json(conn, %{success: true, data: %{activities: Enum.take(campaigns ++ events, 10)}})
    end
  end

  def update_request_status(conn, %{"request_id" => id} = params) do
    with {:ok, _} <- require_role(conn, "sponsor") do
      new_status = params["status"]

      if new_status not in ["approved", "rejected", "under_review"] do
        conn |> put_status(400) |> json(%{detail: "Invalid status. Must be 'approved', 'rejected', or 'under_review'"})
      else
        SQL.maps(
          "update public.sponsorship_requests set status = $2, reviewed_at = now(), reviewer_notes = $3, updated_at = now() where id = $1::uuid",
          [id, new_status, params["notes"] || ""]
        )

        json(conn, %{success: true, message: "Sponsorship request #{new_status} successfully"})
      end
    end
  end

  # ---- events ---------------------------------------------------------------

  @event_map %{
    "title" => "title", "description" => "description", "category" => "category",
    "startDate" => "start_date", "endDate" => "end_date", "location" => "location",
    "isVirtual" => "is_online", "budget" => "price", "maxAttendees" => "max_attendees",
    "imageUrl" => "image_url", "tags" => "tags", "level" => "level",
    "hasCertificate" => "has_certificate", "isFeatured" => "is_featured"
  }

  def events(conn, params) do
    with {:ok, profile} <- sponsor_profile(conn) do
      company = profile["company_name"]
      page = int(params["page"], 1) |> max(1)
      limit = int(params["limit"], 20) |> max(1) |> min(100)
      offset = (page - 1) * limit

      rows =
        SQL.json_all(
          "select to_jsonb(e) as row from public.events e where (e.sponsor = $1 or e.organizer_id = $2::uuid) order by e.start_date desc nulls last limit #{limit} offset #{offset}",
          [company, uid(conn)]
        )
        |> Enum.map(&event_list_view/1)

      summary = event_summary(company, uid(conn))
      json(conn, %{success: true, data: %{events: rows, summary: summary, pagination: %{page: page, limit: limit, total: summary.totalEvents}}})
    end
  end

  def create_event(conn, params) do
    with {:ok, profile} <- sponsor_profile(conn) do
      {cols, vals} = event_columns(params)
      allcols = ["id", "organizer_id", "sponsor"] ++ cols
      allph = ["gen_random_uuid()", "$1::uuid", "$2"] ++ event_placeholders(cols, 3)
      id = SQL.scalar("insert into public.events (#{Enum.join(allcols, ", ")}) values (#{Enum.join(allph, ", ")}) returning id::text", [uid(conn), profile["company_name"] | vals])
      json(conn, %{success: true, message: "Event created successfully", data: %{event_id: id}})
    end
  end

  def get_event(conn, %{"event_id" => id}) do
    with {:ok, profile} <- sponsor_profile(conn) do
      case SQL.json_one("select to_jsonb(e) as row from public.events e where e.id = $1::uuid and (e.sponsor = $2 or e.organizer_id = $3::uuid)", [id, profile["company_name"], uid(conn)]) do
        nil -> conn |> put_status(404) |> json(%{detail: "Event not found"})
        e -> json(conn, %{success: true, data: event_detail_view(e)})
      end
    end
  end

  def update_event(conn, %{"event_id" => id} = params) do
    with {:ok, profile} <- sponsor_profile(conn),
         true <- owns_event?(id, profile["company_name"], uid(conn)) do
      {cols, vals} = event_columns(params)

      if cols == [] do
        json(conn, %{success: true, message: "Event updated successfully"})
      else
        set = event_placeholders(cols, 2) |> Enum.zip(cols) |> Enum.map_join(", ", fn {ph, c} -> "#{c} = #{ph}" end)
        SQL.maps("update public.events set #{set} where id = $1::uuid", [id | vals])
        json(conn, %{success: true, message: "Event updated successfully"})
      end
    else
      false -> conn |> put_status(404) |> json(%{detail: "Event not found or access denied"})
      other -> other
    end
  end

  def delete_event(conn, %{"event_id" => id}) do
    with {:ok, profile} <- sponsor_profile(conn),
         true <- owns_event?(id, profile["company_name"], uid(conn)) do
      SQL.maps("delete from public.event_registrations where event_id = $1::uuid", [id])
      SQL.maps("delete from public.events where id = $1::uuid", [id])
      json(conn, %{success: true, message: "Event deleted successfully"})
    else
      false -> conn |> put_status(404) |> json(%{detail: "Event not found or access denied"})
      other -> other
    end
  end

  def launch_event(conn, %{"event_id" => id}) do
    with {:ok, profile} <- sponsor_profile(conn),
         true <- owns_event?(id, profile["company_name"], uid(conn)) do
      SQL.maps("update public.events set is_featured = true where id = $1::uuid", [id])
      json(conn, %{success: true, message: "Event launched successfully"})
    else
      false -> conn |> put_status(404) |> json(%{detail: "Event not found or access denied"})
      other -> other
    end
  end

  # ---- sponsorship requests -------------------------------------------------

  def sponsorship_requests(conn, params) do
    with {:ok, _} <- require_role(conn, "sponsor") do
      status_filter = params["status_filter"] || "all"
      {clause, args} = if status_filter == "all", do: {"", []}, else: {" and sr.status::text = $1", [status_filter]}

      rows =
        SQL.maps(
          """
          select sr.id::text, sr.title, sr.description, sr.amount_requested::float, sr.students_impacted,
            sr.status::text status, sr.submitted_at, sr.reviewed_at, sr.reviewer_notes,
            nullif(trim(coalesce(up.first_name, '') || ' ' || coalesce(up.last_name, '')), '') teacher_name,
            u.email teacher_email, up.phone teacher_phone, tp.title teacher_title,
            tp.experience_years, tp.average_rating, tp.specializations,
            'Education' category,
            case when sr.amount_requested > 200000 then 'high' when sr.amount_requested > 100000 then 'medium' else 'low' end urgency
          from public.sponsorship_requests sr
          join public.users u on sr.teacher_id = u.id
          left join public.user_profiles up on u.id = up.user_id
          left join public.teacher_profiles tp on u.id = tp.user_id
          where 1=1#{clause} order by sr.submitted_at desc nulls last limit 100
          """,
          args
        )

      json(conn, %{success: true, data: %{requests: rows}})
    end
  end

  # ---- event helpers --------------------------------------------------------

  defp event_columns(params) do
    Enum.reduce(@event_map, {[], []}, fn {k, col}, {cols, vals} ->
      if Map.has_key?(params, k), do: {cols ++ [col], vals ++ [event_value(col, params[k])]}, else: {cols, vals}
    end)
  end

  defp event_value("start_date", v), do: blank(v)
  defp event_value("end_date", v), do: blank(v)
  defp event_value(_col, v), do: v

  # Placeholder generator with per-column casts, starting at index `start`.
  defp event_placeholders(cols, start) do
    cols
    |> Enum.with_index(start)
    |> Enum.map(fn {c, i} ->
      case c do
        "start_date" -> "$#{i}::text::timestamp"
        "end_date" -> "$#{i}::text::timestamp"
        "tags" -> "$#{i}::text[]"
        _ -> "$#{i}"
      end
    end)
  end

  defp owns_event?(id, company, user_id) do
    not is_nil(SQL.one("select id from public.events where id = $1::uuid and (sponsor = $2 or organizer_id = $3::uuid)", [id, company, user_id]))
  end

  defp event_summary(company, user_id) do
    s =
      SQL.one(
        """
        select count(*)::int total,
          count(*) filter (where start_date > now())::int upcoming,
          count(*) filter (where start_date <= now() and end_date >= now())::int ongoing,
          count(*) filter (where end_date < now())::int completed,
          coalesce(sum(price), 0)::float investment,
          coalesce(sum(current_attendees), 0)::int attendees,
          coalesce(sum(case when max_attendees > 0 then max_attendees else 0 end), 0)::int capacity
        from public.events where (sponsor = $1 or organizer_id = $2::uuid)
        """,
        [company, user_id]
      )

    %{
      totalEvents: s.total, upcomingEvents: s.upcoming, ongoingEvents: s.ongoing,
      completedEvents: s.completed, totalInvestment: s.investment, totalAttendees: s.attendees,
      averageEngagement: if(s.capacity > 0, do: Float.round(s.attendees / s.capacity * 100, 1), else: 0)
    }
  end

  defp event_list_view(e) do
    att = e["current_attendees"] || 0
    cap = e["max_attendees"] || 0
    fill = if cap > 0, do: att / cap * 100, else: 0

    %{
      id: e["id"], title: e["title"], description: e["description"] || "No description provided",
      status: event_status(e), type: event_type(e), sponsorshipLevel: sponsorship_level(num(e["price"])),
      startDate: e["start_date"], endDate: e["end_date"], location: e["location"], isVirtual: e["is_online"],
      budget: num(e["price"]), maxAttendees: cap, currentAttendees: att, expectedROI: "#{trunc(fill)}%",
      category: e["category"], imageUrl: e["image_url"], tags: e["tags"] || [], sponsor: e["sponsor"], isFeatured: e["is_featured"]
    }
  end

  defp event_detail_view(e) do
    %{
      id: e["id"], title: e["title"], description: e["description"], category: e["category"],
      startDate: e["start_date"], endDate: e["end_date"], location: e["location"], isVirtual: e["is_online"],
      budget: num(e["price"]), maxAttendees: e["max_attendees"], currentAttendees: e["current_attendees"] || 0,
      imageUrl: e["image_url"], tags: e["tags"] || [], level: e["level"], hasCertificate: e["has_certificate"],
      sponsor: e["sponsor"], isFeatured: e["is_featured"]
    }
  end

  defp event_status(e) do
    now = DateTime.utc_now()
    start = parse_ts(e["start_date"])
    fin = parse_ts(e["end_date"])

    cond do
      start && DateTime.compare(start, now) == :gt -> "upcoming"
      fin && DateTime.compare(fin, now) == :lt -> "completed"
      start && fin -> "ongoing"
      true -> "planned"
    end
  end

  defp event_type(e) do
    cond do
      e["category"] in ["workshop", "training"] -> "Workshop"
      e["category"] in ["conference", "seminar"] -> "Conference"
      e["is_online"] -> "Webinar"
      e["category"] in ["competition", "hackathon"] -> "Competition"
      true -> "Event"
    end
  end

  defp sponsorship_level(price) do
    cond do
      price > 10_000 -> "Platinum"
      price > 5_000 -> "Gold"
      price > 1_000 -> "Silver"
      true -> "Bronze"
    end
  end

  defp campaign_view(c) do
    %{
      id: c["id"], title: c["title"], description: c["description"],
      budget: "LKR #{commas(num(c["budget"]))}",
      studentsReached: c["students_reached"] || 0, completion: c["completion_percentage"] || 0,
      status: c["status"], startDate: c["start_date"], endDate: c["end_date"], createdAt: c["created_at"]
    }
  end

  defp owns_campaign?(id, sponsor_id) do
    not is_nil(SQL.one("select id from public.sponsor_campaigns where id = $1::uuid and sponsor_id = $2::uuid", [id, sponsor_id]))
  end

  defp ago(nil), do: "recently"
  defp ago(ts) do
    case parse_ts(ts) do
      nil -> "recently"
      dt ->
        hours = DateTime.diff(DateTime.utc_now(), dt) / 3600
        if hours < 24, do: "#{trunc(hours)} hours ago", else: "#{trunc(hours / 24)} days ago"
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

  defp num(nil), do: 0.0
  defp num(n) when is_number(n), do: n * 1.0
  defp num(%Decimal{} = d), do: Decimal.to_float(d)
  defp num(n) when is_binary(n), do: (case Float.parse(n) do
    {f, _} -> f
    :error -> 0.0
  end)
  defp num(_), do: 0.0

  defp int(nil, default), do: default
  defp int(v, _default) when is_integer(v), do: v
  defp int(v, default) when is_binary(v), do: (case Integer.parse(v) do
    {n, _} -> n
    :error -> default
  end)
  defp int(_, default), do: default

  defp blank(""), do: nil
  defp blank(v), do: v

  defp campaign_totals(sponsor_id, window) do
    {clause, args} = window_clause(window, "created_at", [sponsor_id])

    SQL.one(
      """
      select count(*) filter (where status = 'active')::int active,
             coalesce(sum(students_reached), 0)::int students,
             coalesce(sum(budget), 0)::float budget
      from public.sponsor_campaigns where sponsor_id = $1::uuid#{clause}
      """,
      args
    )
  end

  defp event_investment(user_id, window) do
    {clause, args} = window_clause(window, "created_at", [user_id])

    SQL.scalar(
      "select coalesce(sum(coalesce(price, 0) * coalesce(current_attendees, 0)), 0)::float from public.events where organizer_id = $1::uuid#{clause}",
      args, 0.0
    )
  end

  # Builds a "created_at >= now()-Nd and < now()-Md" clause for the prior window.
  defp window_clause(nil, _col, args), do: {"", args}
  defp window_clause({from_days, to_days}, col, args) do
    {" and #{col} >= now() - interval '#{from_days} days' and #{col} < now() - interval '#{to_days} days'", args}
  end

  # ---- shared formatting (reused across sponsor endpoints) ------------------

  def pct_change(current, previous) do
    cond do
      previous <= 0 and current > 0 -> "+100%"
      previous <= 0 -> "0%"
      true ->
        delta = (current - previous) / previous * 100
        sign = if delta >= 0, do: "+", else: ""
        "#{sign}#{round(delta)}%"
    end
  end

  def int_change(current, previous) do
    d = current - previous
    if d >= 0, do: "+#{d}", else: "#{d}"
  end

  def commas(n) do
    n |> trunc() |> Integer.to_string() |> String.reverse() |> String.replace(~r/(\d{3})(?=\d)/, "\\1,") |> String.reverse()
  end

  def lkr_compact(amount) do
    a = amount * 1.0
    cond do
      a >= 1_000_000 -> "LKR #{:erlang.float_to_binary(a / 1_000_000, decimals: 1)}M"
      a >= 1_000 -> "LKR #{:erlang.float_to_binary(a / 1_000, decimals: 0)}K"
      true -> "LKR #{:erlang.float_to_binary(a, decimals: 0)}"
    end
  end

  @doc "Resolve the caller's sponsor_profiles row or return a tagged error tuple."
  def sponsor_profile(conn) do
    with {:ok, _} <- require_role(conn, "sponsor") do
      case SQL.json_one("select to_jsonb(s) as row from public.sponsor_profiles s where s.user_id = $1::uuid", [uid(conn)]) do
        nil -> {:error, conn |> put_status(400) |> json(%{detail: "Sponsor profile not set up. Complete /sponsors/profile/setup first."})}
        profile -> {:ok, profile}
      end
    end
  end

  defp insert_profile(user_id, data) do
    cols = Map.keys(data)
    ph = if cols == [], do: "", else: ", " <> Enum.map_join(2..(length(cols) + 1), ", ", &"$#{&1}")
    col_sql = if cols == [], do: "", else: ", " <> Enum.join(cols, ", ")

    SQL.scalar(
      "insert into public.sponsor_profiles (user_id#{col_sql}, created_at, updated_at) values ($1::uuid#{ph}, now(), now()) returning id::text",
      [user_id | Enum.map(cols, &data[&1])]
    )
  end

  defp update_profile(_id, data) when map_size(data) == 0, do: :ok
  defp update_profile(id, data) do
    cols = Map.keys(data)
    set = cols |> Enum.with_index(2) |> Enum.map_join(", ", fn {c, i} -> "#{c} = $#{i}" end)
    SQL.maps("update public.sponsor_profiles set #{set}, updated_at = now() where id = $1::uuid", [id | Enum.map(cols, &data[&1])])
  end

  defp uid(conn), do: conn.assigns.current_user_id
end
