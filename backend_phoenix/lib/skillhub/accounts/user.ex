defmodule SkillHub.Accounts.User do
  @moduledoc """
  Mirrors the shared Supabase `public.users` table (same rows the Python
  backend reads/writes). Timestamps use the existing `created_at`/`updated_at`
  columns, which are `timestamp without time zone` → `:naive_datetime`.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: false}
  @foreign_key_type :binary_id
  @timestamps_opts [type: :naive_datetime, inserted_at: :created_at, updated_at: :updated_at]

  @roles ~w(student teacher sponsor guardian admin)

  schema "users" do
    field :email, :string
    field :password_hash, :string
    # `role` is a Postgres enum; Postgres casts the text param back to the enum.
    field :role, :string
    field :is_verified, :boolean, default: false
    field :is_active, :boolean, default: true

    has_one :profile, SkillHub.Accounts.UserProfile

    timestamps()
  end

  @doc "Insert changeset for a freshly registered user (password already hashed)."
  def create_changeset(user, attrs) do
    user
    |> cast(attrs, [:id, :email, :password_hash, :role, :is_verified, :is_active])
    |> validate_required([:id, :email, :password_hash, :role])
    |> validate_format(:email, ~r/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    |> validate_inclusion(:role, @roles)
    |> unique_constraint(:email)
  end

  def roles, do: @roles
end
