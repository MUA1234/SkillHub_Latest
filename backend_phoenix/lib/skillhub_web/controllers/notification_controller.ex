defmodule SkillHubWeb.NotificationController do
  @moduledoc """
  Natively-ported `/api/v1/notifications` REST surface (contract matches
  backend/api/v1/endpoints/notifications.py). The push-subscription subroutes
  (`/vapid-public-key`, `/subscribe`, ...) are NOT defined here, so they fall
  through to the proxy and keep working from Python.
  """
  use SkillHubWeb, :controller

  alias SkillHub.Notifications

  @doc "GET /api/v1/notifications?limit=&unread_only="
  def index(conn, params) do
    user_id = conn.assigns.current_user_id
    limit = parse_int(params["limit"], 50)
    unread_only = params["unread_only"] in [true, "true", "1"]

    {notifications, unread_count} =
      Notifications.list_for_user(user_id, limit: limit, unread_only: unread_only)

    json(conn, %{notifications: notifications, unread_count: unread_count})
  end

  @doc "PATCH /api/v1/notifications/:id/read"
  def mark_read(conn, %{"id" => id}) do
    case Notifications.mark_read(conn.assigns.current_user_id, id) do
      :ok -> json(conn, %{message: "Notification marked as read"})
      {:error, :not_found} -> not_found(conn)
    end
  end

  @doc "PATCH /api/v1/notifications/mark-all-read"
  def mark_all_read(conn, _params) do
    {:ok, count} = Notifications.mark_all_read(conn.assigns.current_user_id)
    json(conn, %{message: "All notifications marked as read", updated: count})
  end

  @doc "DELETE /api/v1/notifications/:id"
  def delete(conn, %{"id" => id}) do
    case Notifications.delete(conn.assigns.current_user_id, id) do
      :ok -> json(conn, %{message: "Notification deleted"})
      {:error, :not_found} -> not_found(conn)
    end
  end

  defp not_found(conn) do
    conn |> put_status(404) |> json(%{detail: "Notification not found"})
  end

  defp parse_int(nil, default), do: default

  defp parse_int(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {n, _} -> n
      :error -> default
    end
  end

  defp parse_int(value, _default) when is_integer(value), do: value
  defp parse_int(_, default), do: default
end
