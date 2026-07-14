defmodule SkillHub.Accounts.LanguagePreference do
  @moduledoc "Mirrors `public.language_preferences`. Seeded on registration."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @timestamps_opts [type: :naive_datetime, inserted_at: :created_at, updated_at: :updated_at]

  schema "language_preferences" do
    field :user_id, :binary_id
    field :preferred_language, :string, default: "en"
    field :fallback_language, :string, default: "en"

    timestamps()
  end

  def create_changeset(pref, attrs) do
    pref
    |> cast(attrs, [:user_id, :preferred_language, :fallback_language])
    |> validate_required([:user_id, :preferred_language])
  end
end
