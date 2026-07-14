defmodule SkillHub.Notifications.Notification do
  @moduledoc """
  Mirrors `public.notifications`. Note: this table has a `created_at` column but
  NO `updated_at`, so we manage the timestamp field explicitly.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @derive {Jason.Encoder,
           only: [:id, :user_id, :type, :title, :message, :data, :is_read, :created_at]}
  schema "notifications" do
    field :user_id, :binary_id
    field :type, :string
    field :title, :string
    field :message, :string
    field :data, :map
    field :is_read, :boolean, default: false
    field :created_at, :naive_datetime
  end

  def changeset(notification, attrs) do
    notification
    |> cast(attrs, [:user_id, :type, :title, :message, :data, :is_read, :created_at])
    |> validate_required([:user_id, :type, :title, :message])
  end
end
