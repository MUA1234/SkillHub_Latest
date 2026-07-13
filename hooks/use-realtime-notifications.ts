/**
 * Realtime notifications subscription.
 *
 * Listens for INSERT events on `public.notifications` filtered by
 * `user_id=eq.<userId>` and hands rows to the caller via `onNotification`.
 * The bell in `authenticated-navigation.tsx` uses this to bump its unread
 * count and prepend the new row to its dropdown without polling.
 *
 * The list/mark-read writes still go through the FastAPI backend
 * (`/api/v1/notifications/*`) — realtime is purely the receive path.
 */

import { useEffect, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export interface RealtimeNotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link_url?: string | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  priority?: string | null;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at: string;
}

export function useRealtimeNotifications(
  userId: string | null | undefined,
  onNotification: (row: RealtimeNotificationRow) => void,
) {
  const callbackRef = useRef(onNotification);
  useEffect(() => {
    callbackRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    if (!userId) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channel: RealtimeChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as RealtimeNotificationRow;
          if (row && row.id) callbackRef.current(row);
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
      }
    };
  }, [userId]);
}
