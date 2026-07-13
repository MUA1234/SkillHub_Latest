-- ============================================================================
-- 015_low_bandwidth.sql
-- Phase J1 — Low-bandwidth preference toggle.
--
-- Adds a single boolean to `accessibility_preferences`. The frontend
-- already exposes the rest of the connection-quality strategy (lazy
-- images, audio-only fallback for the VideoPlayer, deferred non-critical
-- assets) — this flag is the master switch the UI consults.
--
-- Idempotent. Re-running is a no-op.
-- ============================================================================

ALTER TABLE accessibility_preferences
    ADD COLUMN IF NOT EXISTS low_bandwidth_mode boolean DEFAULT false;

COMMENT ON COLUMN accessibility_preferences.low_bandwidth_mode IS
    'When true, the UI prefers audio-only sessions, defers non-critical '
    'images, and lazy-loads heavy components. Critical for rural Sri Lankan '
    'connections.';
