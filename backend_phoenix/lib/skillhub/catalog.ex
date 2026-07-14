defmodule SkillHub.Catalog do
  @moduledoc "Shared, public-ish catalogue reads (subjects and their categories)."
  import Ecto.Query, warn: false

  alias SkillHub.Repo
  alias SkillHub.Catalog.Subject

  @doc "Active subjects as flat maps, ordered by name (contract: getSubjects())."
  def list_subjects do
    from(s in Subject, where: s.is_active == true, order_by: [asc: s.name])
    |> Repo.all()
    |> Enum.map(&%{id: &1.id, name: &1.name, description: &1.description, category: &1.category})
  end

  @doc "Distinct, non-empty subject categories, sorted (contract: getSubjectCategories())."
  def list_categories do
    from(s in Subject,
      where: s.is_active == true and not is_nil(s.category) and s.category != "",
      distinct: true,
      select: s.category
    )
    |> Repo.all()
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.uniq()
    |> Enum.sort()
  end
end
