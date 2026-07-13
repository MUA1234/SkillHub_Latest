-- Migration 012: Web Push subscriptions (Phase F3).
--
-- One row per (user, browser-or-device). The browser hands us an `endpoint`
-- (a URL the push service hosts) plus two crypto keys; we keep them all and
-- pass them to `pywebpush` server-side when we want to fire a push.
--
-- We do NOT mirror this through Supabase Realtime — the writes happen from
-- the backend, and the reads happen from the backend, so realtime exposure
-- would only widen attack surface for no UX win.
--
-- Idempotent: `IF NOT EXISTS` everywhere; UNIQUE on `endpoint` makes a
-- repeat subscribe-call a no-op rather than a duplicate row.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- Push service URL the browser hands us. Unique because the same
    -- endpoint corresponds to a single device / browser profile.
    endpoint        text NOT NULL UNIQUE,
    -- Per-subscription ECDH public key (P-256, base64url) and shared
    -- auth secret (16 bytes, base64url). Both required by Web Push to
    -- encrypt the payload — pywebpush takes them as a `keys` dict.
    p256dh          text NOT NULL,
    auth            text NOT NULL,
    -- Optional human label (the browser's user-agent) so a user can
    -- identify and revoke specific devices later.
    user_agent      text,
    -- Last successful push, used to age out dead subscriptions.
    last_used_at    timestamp with time zone,
    -- A 410/404 from the push service means the browser has unsubscribed
    -- — we mark the row dead and skip future sends rather than deleting,
    -- so an audit log of past devices is still queryable.
    revoked_at      timestamp with time zone,
    created_at      timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
    ON public.push_subscriptions (user_id)
    WHERE revoked_at IS NULL;
