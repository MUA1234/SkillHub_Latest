defmodule SkillHubWeb.AuthHelpers do
  @moduledoc "Small role-gating helpers for controllers."
  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  @doc """
  Ensures the current user has `role`. Returns `{:ok, user}` or sends a 403 and
  returns `{:error, conn}` — controllers pattern-match and bail on error.
  """
  def require_role(conn, role) do
    user = conn.assigns.current_user

    if to_string(user.role) == role do
      {:ok, user}
    else
      {:error, conn |> put_status(403) |> json(%{detail: "#{String.capitalize(role)} account required."})}
    end
  end

  def current_user_id(conn), do: conn.assigns.current_user_id
end
