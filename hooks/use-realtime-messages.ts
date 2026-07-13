/**
 * Realtime chat messages subscription.
 *
 * Subscribes to INSERT events on `public.messages` filtered by
 * `conversation_id`, dedupes against rows the caller already has (so the
 * optimistic "just sent" message and the realtime echo don't double-render),
 * and hands new rows to the caller via `onMessage`.
 *
 * Sending stays on the REST endpoint (`POST /students/conversations/:id/messages`).
 * Realtime is purely the *receive* path so the inbox feels live without
 * the page polling the API.
 */

import { useEffect, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export interface RealtimeMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachments?: string[] | null;
  is_read?: boolean | null;
  created_at: string;
}

export function useRealtimeMessages(
  conversationId: string | null | undefined,
  onMessage: (row: RealtimeMessageRow) => void,
) {
  const callbackRef = useRef(onMessage);
  useEffect(() => {
    callbackRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!conversationId) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channel: RealtimeChannel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as RealtimeMessageRow;
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
  }, [conversationId]);
}
