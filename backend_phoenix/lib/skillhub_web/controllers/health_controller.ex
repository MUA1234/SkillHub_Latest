defmodule SkillHubWeb.HealthController do
  use SkillHubWeb, :controller

  def show(conn, _params) do
    json(conn, %{status: "ok", service: "skillhub-gateway"})
  end
end
