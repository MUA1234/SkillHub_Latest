defmodule SkillHub.Repo.Migrations.NotificationNotifyTrigger do
  @moduledoc """
  Realtime plumbing: fire `pg_notify('skillhub_new_notification', <id>)` after
  every INSERT into `public.notifications`. `SkillHub.Notifications.Listener`
  LISTENs on that channel and pushes the row to the user's Phoenix channel —
  this is what lets the frontend drop its notification polling.

  Idempotent: safe to run repeatedly and independent of who inserts the row
  (Python today, Phoenix later).
  """
  use Ecto.Migration

  def up do
    execute """
    CREATE OR REPLACE FUNCTION public.skillhub_notify_new_notification()
    RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('skillhub_new_notification', NEW.id::text);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    """

    execute "DROP TRIGGER IF EXISTS skillhub_new_notification_trigger ON public.notifications;"

    execute """
    CREATE TRIGGER skillhub_new_notification_trigger
    AFTER INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.skillhub_notify_new_notification();
    """
  end

  def down do
    execute "DROP TRIGGER IF EXISTS skillhub_new_notification_trigger ON public.notifications;"
    execute "DROP FUNCTION IF EXISTS public.skillhub_notify_new_notification();"
  end
end
