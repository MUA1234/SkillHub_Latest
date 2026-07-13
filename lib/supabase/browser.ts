/**
 * Singleton Supabase client for browser-side realtime subscriptions.
 *
 * Realtime broadcasts and `postgres_changes` events are the only reason the
 * frontend talks to Supabase directly — auth, REST, and writes still go
 * through the FastAPI backend so RLS / business rules stay in one place.
 *
 * `useRealtimeSignaling` predates this and creates its own client per hook
 * instance. New code should import from here so we don't open a fresh
 * websocket per page mount.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return client;
}
