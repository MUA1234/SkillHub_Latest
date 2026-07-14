defmodule SkillHub.Groups do
  @moduledoc "Learning groups context (groups.py): browse, mine, create, get, join, leave."
  import Ecto.Query, warn: false

  alias SkillHub.Repo
  alias SkillHub.Groups.{LearningGroup, GroupMembership}

  def list_groups(user_id, q) do
    groups =
      from(g in LearningGroup, order_by: [desc: g.created_at], limit: 100)
      |> Repo.all()
      |> filter_query(q)

    member_ids = active_group_ids(user_id)
    Enum.map(groups, fn g -> Map.put(to_map(g), :is_member, MapSet.member?(member_ids, g.id)) end)
  end

  def list_my_groups(user_id) do
    memberships =
      from(m in GroupMembership, where: m.user_id == ^user_id and m.is_active == true)
      |> Repo.all()

    by_group = Map.new(memberships, &{&1.group_id, &1})
    ids = Map.keys(by_group)

    from(g in LearningGroup, where: g.id in ^ids)
    |> Repo.all()
    |> Enum.map(fn g ->
      m = by_group[g.id]
      to_map(g) |> Map.put(:my_role, m.role) |> Map.put(:joined_at, m.joined_at)
    end)
  end

  def create_group(user_id, attrs) do
    group_id = Ecto.UUID.generate()

    params = %{
      id: group_id,
      name: attrs["name"],
      description: attrs["description"],
      subject_id: blank_to_nil(attrs["subject_id"]),
      group_type: attrs["group_type"] || "study",
      level: attrs["level"],
      admin_id: user_id,
      max_members: attrs["max_members"],
      current_members: 1,
      language: attrs["language"] || "en",
      tags: attrs["tags"] || []
    }

    with {:ok, group} <- %LearningGroup{} |> LearningGroup.create_changeset(params) |> Repo.insert() do
      %GroupMembership{}
      |> GroupMembership.changeset(%{group_id: group_id, user_id: user_id, role: "admin", is_active: true})
      |> Repo.insert()

      {:ok, group}
    end
  end

  def get_group(user_id, group_id) do
    case Repo.get(LearningGroup, group_id) do
      nil ->
        {:error, :not_found}

      group ->
        members =
          from(m in GroupMembership,
            where: m.group_id == ^group_id and m.is_active == true
          )
          |> Repo.all()

        member_rows =
          Enum.map(members, fn m ->
            p = profile(m.user_id)
            %{
              user_id: m.user_id,
              role: m.role,
              joined_at: m.joined_at,
              name: full_name(p) || "Member",
              avatar_url: p[:avatar_url]
            }
          end)

        mine = Enum.find(members, &(&1.user_id == user_id))

        {:ok,
         %{
           success: true,
           group: group,
           members: member_rows,
           my_role: mine && mine.role,
           is_member: not is_nil(mine)
         }}
    end
  end

  def join_group(user_id, group_id) do
    case Repo.get(LearningGroup, group_id) do
      nil ->
        {:error, :not_found}

      group ->
        existing =
          Repo.one(from m in GroupMembership, where: m.group_id == ^group_id and m.user_id == ^user_id)

        cond do
          existing && existing.is_active ->
            {:ok, %{success: true, already_member: true}}

          existing ->
            existing
            |> GroupMembership.changeset(%{is_active: true, joined_at: DateTime.utc_now()})
            |> Repo.update()

            bump_members(group_id, 1)
            {:ok, %{success: true}}

          group.max_members && (group.current_members || 0) >= group.max_members ->
            {:error, :full}

          true ->
            %GroupMembership{}
            |> GroupMembership.changeset(%{group_id: group_id, user_id: user_id, role: "member", is_active: true})
            |> Repo.insert()

            bump_members(group_id, 1)
            {:ok, %{success: true}}
        end
    end
  end

  def leave_group(user_id, group_id) do
    existing =
      Repo.one(from m in GroupMembership, where: m.group_id == ^group_id and m.user_id == ^user_id)

    cond do
      is_nil(existing) or not existing.is_active -> {:ok, %{success: true, not_a_member: true}}
      existing.role == "admin" -> {:error, :admin_cannot_leave}
      true ->
        existing |> GroupMembership.changeset(%{is_active: false}) |> Repo.update()
        bump_members(group_id, -1)
        {:ok, %{success: true}}
    end
  end

  # --- helpers ---------------------------------------------------------------

  defp to_map(%LearningGroup{} = g), do: g |> Map.from_struct() |> Map.drop([:__meta__])

  defp active_group_ids(user_id) do
    from(m in GroupMembership, where: m.user_id == ^user_id and m.is_active == true, select: m.group_id)
    |> Repo.all()
    |> MapSet.new()
  end

  defp bump_members(group_id, delta) do
    from(g in LearningGroup, where: g.id == ^group_id)
    |> Repo.update_all(inc: [current_members: delta])
  end

  defp filter_query(groups, nil), do: groups
  defp filter_query(groups, ""), do: groups
  defp filter_query(groups, q) do
    ql = String.downcase(q)
    Enum.filter(groups, fn g ->
      String.contains?(String.downcase(g.name || ""), ql) or
        String.contains?(String.downcase(g.description || ""), ql)
    end)
  end

  defp profile(user_id) do
    case Repo.query!(
           "select first_name, last_name, avatar_url from public.user_profiles where user_id = $1::uuid limit 1",
           [Ecto.UUID.dump!(user_id)]
         ).rows do
      [[first, last, avatar] | _] -> %{first_name: first, last_name: last, avatar_url: avatar}
      _ -> %{}
    end
  end

  defp full_name(%{first_name: f, last_name: l}) do
    name = String.trim("#{f || ""} #{l || ""}")
    if name == "", do: nil, else: name
  end
  defp full_name(_), do: nil

  defp blank_to_nil(nil), do: nil
  defp blank_to_nil(""), do: nil
  defp blank_to_nil(v), do: v
end
