-- Migration 011: Enable Supabase Realtime for chat + notifications.
--
-- Phase F1 / F2 wiring. Both tables already exist (`messages` from the very
-- first auth migration, `notifications` likewise) but neither is in the
-- realtime publication, so a `postgres_changes` subscription from the
-- frontend never fires.
--
-- The webrtc tables in `004_webrtc_meetings.sql` set the precedent:
--    ALTER PUBLICATION supabase_realtime ADD TABLE ...
--
-- Idempotent: an `ADD TABLE` against a table that's already in the
-- publication errors out, so we wrap each call in a DO-block that ignores
-- duplicate-object errors. Re-running is safe.

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_object THEN
            -- `supabase_realtime` doesn't exist on a non-Supabase Postgres.
            -- Skip silently rather than blocking the migration.
            NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_object THEN NULL;
    END;
END $$;

-- `REPLICA IDENTITY FULL` makes UPDATE / DELETE realtime payloads include
-- the OLD row, which the notifications bell uses to detect when a row
-- transitions to is_read=true. For INSERT-only flows (chat) it's harmless.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
