defmodule SkillHub.Catalog.Subject do
  @moduledoc "Mirrors `public.subjects` — the shared subject catalogue."
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "subjects" do
    field :name, :string
    field :description, :string
    field :category, :string
    field :is_active, :boolean, default: true
    field :created_at, :naive_datetime
  end
end
