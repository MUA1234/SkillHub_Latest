defmodule SkillHub.Groups.GroupMembership do
  @moduledoc "Mirrors `public.group_memberships`."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "group_memberships" do
    field :group_id, :binary_id
    field :user_id, :binary_id
    field :role, :string, default: "member"
    field :joined_at, :naive_datetime
    field :is_active, :boolean, default: true
  end

  def changeset(m, attrs) do
    m
    |> cast(attrs, [:group_id, :user_id, :role, :joined_at, :is_active])
    |> validate_required([:group_id, :user_id])
  end
end
