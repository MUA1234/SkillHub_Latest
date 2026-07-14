defmodule SkillHub.Notifications do
  @moduledoc """
  The Notifications context. Read/update over the shared `notifications` table,
  plus a helper to broadcast realtime pushes to a user's channel.
  """
  import Ecto.Query, warn: false

  alias SkillHub.Repo
  alias SkillHub.Notifications.Notification

  @doc """
  List a user's notifications, newest first. `unread_only` filters to unread.
  Returns `{notifications, unread_count}` so the bell can render in one call —
  the same shape the Python `/notifications` endpoint returns.
  """
  def list_for_user(user_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 50) |> min(100)
    unread_only = Keyword.get(opts, :unread_only, false)

    base = from n in Notification, where: n.user_id == ^user_id, order_by: [desc: n.created_at]
    base = if unread_only, do: where(base, [n], n.is_read == false), else: base

    notifications = base |> limit(^limit) |> Repo.all()
    unread_count = unread_count(user_id)
    {notifications, unread_count}
  end

  def unread_count(user_id) do
    Repo.aggregate(
      from(n in Notification, where: n.user_id == ^user_id and n.is_read == false),
      :count,
      :id
    )
  end

  @doc "Mark one notification read, scoped to the owner so IDs can't be forged."
  def mark_read(user_id, notification_id) do
    {count, _} =
      from(n in Notification, where: n.id == ^notification_id and n.user_id == ^user_id)
      |> Repo.update_all(set: [is_read: true])

    if count > 0, do: :ok, else: {:error, :not_found}
  end

  @doc "Mark all of a user's notifications read."
  def mark_all_read(user_id) do
    {count, _} =
      from(n in Notification, where: n.user_id == ^user_id and n.is_read == false)
      |> Repo.update_all(set: [is_read: true])

    {:ok, count}
  end

  def delete(user_id, notification_id) do
    {count, _} =
      from(n in Notification, where: n.id == ^notification_id and n.user_id == ^user_id)
      |> Repo.delete_all()

    if count > 0, do: :ok, else: {:error, :not_found}
  end

  @doc "Load a single notification by id (used by the realtime listener fan-out)."
  def get(notification_id), do: Repo.get(Notification, notification_id)

  @doc """
  Push a notification to its owner's realtime channel. The channel topic is
  `notifications:<user_id>`; the bell subscribes on login. This is what deletes
  the old polling.
  """
  def broadcast(%Notification{} = n) do
    SkillHubWeb.Endpoint.broadcast("notifications:#{n.user_id}", "new_notification", n)
  end
end
