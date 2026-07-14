defmodule SkillHubWeb.GroupController do
  @moduledoc "Ported learning groups (groups.py)."
  use SkillHubWeb, :controller

  alias SkillHub.Groups

  def index(conn, params) do
    json(conn, %{success: true, groups: Groups.list_groups(uid(conn), params["q"])})
  end

  def mine(conn, _params) do
    json(conn, %{success: true, groups: Groups.list_my_groups(uid(conn))})
  end

  def create(conn, params) do
    case Groups.create_group(uid(conn), params) do
      {:ok, group} -> json(conn, %{success: true, group: group})
      {:error, %Ecto.Changeset{}} -> conn |> put_status(400) |> json(%{detail: "Could not create group."})
    end
  end

  def show(conn, %{"group_id" => group_id}) do
    case Groups.get_group(uid(conn), group_id) do
      {:ok, payload} -> json(conn, payload)
      {:error, :not_found} -> not_found(conn)
    end
  end

  def join(conn, %{"group_id" => group_id}) do
    case Groups.join_group(uid(conn), group_id) do
      {:ok, payload} -> json(conn, payload)
      {:error, :not_found} -> not_found(conn)
      {:error, :full} -> conn |> put_status(400) |> json(%{detail: "Group is full."})
    end
  end

  def leave(conn, %{"group_id" => group_id}) do
    case Groups.leave_group(uid(conn), group_id) do
      {:ok, payload} -> json(conn, payload)
      {:error, :admin_cannot_leave} ->
        conn |> put_status(400) |> json(%{detail: "Admins cannot leave their own group. Transfer admin first."})
    end
  end

  defp uid(conn), do: conn.assigns.current_user_id
  defp not_found(conn), do: conn |> put_status(404) |> json(%{detail: "Group not found."})
end
