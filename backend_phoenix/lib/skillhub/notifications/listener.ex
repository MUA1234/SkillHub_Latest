defmodule SkillHub.Notifications.Listener do
  @moduledoc """
  Realtime bridge: holds a dedicated Postgres session that `LISTEN`s on the
  `skillhub_new_notification` channel. A trigger on `public.notifications`
  fires `pg_notify(channel, new_id)` on INSERT; we load the row and broadcast it
  to `notifications:<user_id>`. This is what replaces the frontend polling.

  Resilient by design: if the DB session can't be established the gateway still
  boots and REST notifications keep working — only the live push degrades, and
  we retry the LISTEN on an interval.
  """
  use GenServer
  require Logger

  alias SkillHub.Notifications

  @channel "skillhub_new_notification"
  @retry_ms 5_000

  def start_link(_opts), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @impl true
  def init(:ok) do
    {:ok, %{conn: nil, ref: nil}, {:continue, :connect}}
  end

  @impl true
  def handle_continue(:connect, state), do: {:noreply, connect(state)}

  @impl true
  def handle_info(:reconnect, state), do: {:noreply, connect(state)}

  # A NOTIFY arrived — payload is the new notification's id.
  def handle_info({:notification, _pid, _ref, @channel, payload}, state) do
    payload
    |> String.trim()
    |> Notifications.get()
    |> case do
      nil -> :ok
      notification -> Notifications.broadcast(notification)
    end

    {:noreply, state}
  end

  # The Postgrex.Notifications connection died — retry.
  def handle_info({:DOWN, _ref, :process, pid, reason}, %{conn: pid} = state) do
    Logger.warning("notification LISTEN connection down (#{inspect(reason)}); retrying")
    Process.send_after(self(), :reconnect, @retry_ms)
    {:noreply, %{state | conn: nil, ref: nil}}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  defp connect(%{conn: conn} = state) when is_pid(conn), do: state

  defp connect(state) do
    case Postgrex.Notifications.start_link(connection_opts()) do
      {:ok, pid} ->
        Process.monitor(pid)
        # With auto_reconnect, listen/2 returns {:ok, ref} once connected or
        # {:eventually, ref} while the session is still coming up — both fine.
        {_status, ref} = Postgrex.Notifications.listen(pid, @channel)
        Logger.info("notification realtime listener attached (LISTEN #{@channel})")
        %{state | conn: pid, ref: ref}

      {:error, reason} ->
        Logger.warning(
          "notification listener could not connect (#{inspect(reason)}); " <>
            "realtime push disabled, retrying in #{@retry_ms}ms"
        )

        Process.send_after(self(), :reconnect, @retry_ms)
        state
    end
  end

  defp connection_opts do
    cfg = SkillHub.Repo.config()

    [
      hostname: cfg[:hostname],
      port: cfg[:port],
      username: cfg[:username],
      password: cfg[:password],
      database: cfg[:database],
      ssl: cfg[:ssl] || false,
      auto_reconnect: true
    ]
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
  end
end
