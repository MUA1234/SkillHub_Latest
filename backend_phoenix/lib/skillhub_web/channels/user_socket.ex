defmodule SkillHubWeb.UserSocket do
  @moduledoc """
  WebSocket entrypoint for realtime. The client connects with `?token=<jwt>`
  (the same access token used for REST); we verify it once at connect time and
  pin the user id onto the socket so channels can authorize per-topic.
  """
  use Phoenix.Socket

  channel "notifications:*", SkillHubWeb.NotificationChannel

  @impl true
  def connect(params, socket, _connect_info) do
    token = params["token"] || params["access_token"]

    case token && SkillHub.Auth.Token.verify(token) do
      {:ok, user_id} -> {:ok, assign(socket, :user_id, user_id)}
      _ -> :error
    end
  end

  # Lets the server disconnect all of a user's sockets if needed later.
  @impl true
  def id(socket), do: "user_socket:#{socket.assigns.user_id}"
end
