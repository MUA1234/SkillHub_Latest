defmodule SkillHubWeb.NotificationChannel do
  @moduledoc """
  Per-user realtime notifications. Topic: `notifications:<user_id>`. A client
  may only join its own topic. New rows are pushed as `new_notification` events
  by `SkillHub.Notifications.Listener` (driven by a Postgres trigger) — this is
  what replaces the frontend's polling of `/notifications`.
  """
  use Phoenix.Channel

  @impl true
  def join("notifications:" <> user_id, _payload, socket) do
    if user_id == socket.assigns.user_id do
      {:ok, socket}
    else
      {:error, %{reason: "unauthorized"}}
    end
  end

  # Heartbeat so the client can confirm the live channel end-to-end.
  @impl true
  def handle_in("ping", _payload, socket) do
    {:reply, {:ok, %{pong: true, at: System.system_time(:millisecond)}}, socket}
  end
end
