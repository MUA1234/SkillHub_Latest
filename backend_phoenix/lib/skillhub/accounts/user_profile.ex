defmodule SkillHub.Accounts.UserProfile do
  @moduledoc "Mirrors `public.user_profiles`. Only the fields the gateway touches."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: false}
  @foreign_key_type :binary_id
  @timestamps_opts [type: :naive_datetime, inserted_at: :created_at, updated_at: :updated_at]

  schema "user_profiles" do
    field :user_id, :binary_id
    field :first_name, :string
    field :last_name, :string
    field :phone, :string
    field :location, :string
    field :bio, :string
    field :avatar_url, :string
    field :reputation_score, :integer, default: 0

    timestamps()
  end

  def create_changeset(profile, attrs) do
    profile
    |> cast(attrs, [:id, :user_id, :first_name, :last_name, :phone, :location, :bio, :avatar_url])
    |> validate_required([:id, :user_id])
  end
end
