defmodule SkillHub.Repo.Migrations.FixMeetingParticipantsRlsRecursion do
  @moduledoc """
  `meeting_participants`' "Participants see other participants" SELECT policy
  queries `meeting_participants` from within its own USING clause:

      EXISTS (SELECT 1 FROM meeting_participants mp
              WHERE mp.meeting_id = meeting_participants.meeting_id
              AND mp.user_id = auth.uid())

  Evaluating that subquery re-triggers the same RLS policy, which re-triggers
  it again — Postgres detects the cycle and raises `infinite recursion
  detected in policy for relation "meeting_participants"` (42P17) on every
  read, including reads that happen as a side effect of writes elsewhere
  (e.g. the FK-adjacent checks hit while inserting a `webrtc_signaling_messages`
  row). Discovered live while wiring up the WebRTC signaling persistence path.

  Fix: move the self-lookup into a `SECURITY DEFINER` function. Functions
  owned by the table owner bypass RLS for their own internal queries, so the
  membership check no longer re-enters the policy it's guarding.
  """
  use Ecto.Migration

  def up do
    execute """
    CREATE OR REPLACE FUNCTION public.is_meeting_participant(p_meeting_id uuid, p_user_id uuid)
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    STABLE
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.meeting_participants
        WHERE meeting_id = p_meeting_id AND user_id = p_user_id
      );
    $$;
    """

    execute ~s(DROP POLICY IF EXISTS "Participants see other participants" ON public.meeting_participants;)

    execute """
    CREATE POLICY "Participants see other participants" ON public.meeting_participants
      FOR SELECT
      USING (public.is_meeting_participant(meeting_id, auth.uid()));
    """
  end

  def down do
    execute ~s(DROP POLICY IF EXISTS "Participants see other participants" ON public.meeting_participants;)

    execute """
    CREATE POLICY "Participants see other participants" ON public.meeting_participants
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.meeting_participants mp
          WHERE mp.meeting_id = meeting_participants.meeting_id
          AND mp.user_id = auth.uid()
        )
      );
    """

    execute "DROP FUNCTION IF EXISTS public.is_meeting_participant(uuid, uuid);"
  end
end
