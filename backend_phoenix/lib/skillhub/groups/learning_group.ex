defmodule SkillHub.Groups.LearningGroup do
  @moduledoc "Mirrors `public.learning_groups`."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @derive {Jason.Encoder,
           only: [
             :id, :name, :description, :subject_id, :group_type, :level, :admin_id,
             :max_members, :current_members, :language, :meeting_schedule, :location,
             :activity_level, :image_url, :tags, :is_private, :status, :upcoming_session,
             :achievements, :created_at, :last_activity
           ]}
  schema "learning_groups" do
    field :name, :string
    field :description, :string
    field :subject_id, :binary_id
    field :group_type, :string
    field :level, :string
    field :admin_id, :binary_id
    field :max_members, :integer
    field :current_members, :integer, default: 1
    field :language, :string
    field :meeting_schedule, :string
    field :location, :string
    field :activity_level, :string
    field :image_url, :string
    field :tags, {:array, :string}
    field :is_private, :boolean, default: false
    field :status, :string
    field :upcoming_session, :string
    field :achievements, {:array, :string}
    field :created_at, :naive_datetime
    field :last_activity, :naive_datetime
  end

  def create_changeset(group, attrs) do
    group
    |> cast(attrs, [
      :id, :name, :description, :subject_id, :group_type, :level, :admin_id,
      :max_members, :current_members, :language, :tags
    ])
    |> validate_required([:id, :name, :group_type, :admin_id])
    |> validate_length(:name, min: 2, max: 100)
  end
end
