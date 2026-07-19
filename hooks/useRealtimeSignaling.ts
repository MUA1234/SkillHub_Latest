/**
 * Supabase Realtime Signaling Hook
 * Handles WebRTC signaling through Supabase Realtime channels
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { SignalingMessage, UseRealtimeSignalingReturn } from '@/lib/webrtc/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function useRealtimeSignaling(
  meetingId: string,
  userId: string,
  onSignal: (signal: SignalingMessage) => void
): UseRealtimeSignalingReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  const supabaseRef = useRef(createClient(supabaseUrl, supabaseAnonKey));
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!meetingId || !userId) return;

    const supabase = supabaseRef.current;
    const channelName = `meeting:${meetingId}`;

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: true },
        presence: { key: userId },
      },
    });

    channel
      .on('broadcast', { event: 'webrtc-signal' }, (payload) => {
        const signal = payload.payload as SignalingMessage;

        if (!signal.to_user_id || signal.to_user_id === userId) {
          onSignal(signal);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('Presence synced:', state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key, leftPresences);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setError(undefined);
          console.log('Realtime signaling connected:', channelName);

          channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setError(new Error('Failed to connect to signaling channel'));
        } else if (status === 'TIMED_OUT') {
          setIsConnected(false);
          setError(new Error('Connection timed out'));
        } else if (status === 'CLOSED') {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [meetingId, userId, onSignal]);

  const sendSignal = useCallback(
    async (signal: Partial<SignalingMessage>) => {
      if (!channelRef.current) {
        throw new Error('Signaling channel not connected');
      }

      const fullSignal: Partial<SignalingMessage> = {
        ...signal,
        meeting_id: meetingId,
        from_user_id: userId,
        created_at: new Date().toISOString(),
      };

      await channelRef.current.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: fullSignal,
      });

      try {
        const supabase = supabaseRef.current;
        const token = localStorage.getItem('access_token');

        if (token) {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/signaling`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(fullSignal),
          });
        }
      } catch (err) {
        console.error('Failed to persist signaling message:', err);
      }
    },
    [meetingId, userId]
  );

  return {
    sendSignal,
    isConnected,
    error,
  };
}
