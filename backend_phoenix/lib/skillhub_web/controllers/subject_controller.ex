defmodule SkillHubWeb.SubjectController do
  @moduledoc "Ported `/api/v1/subjects` — flat-array catalogue (see subjects.py)."
  use SkillHubWeb, :controller

  alias SkillHub.Catalog

  def index(conn, _params), do: json(conn, Catalog.list_subjects())

  def categories(conn, _params), do: json(conn, Catalog.list_categories())
end
