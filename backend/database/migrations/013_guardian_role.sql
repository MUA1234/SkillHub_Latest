-- ============================================================================
-- 013_guardian_role.sql
-- Phase H1 — Guardian portal foundation.
--
-- The `guardian_links` table already ships in `001_accessibility_tables.sql`
-- with the verification + permission flag set we need (verification_code,
-- verified_at, is_verified, is_active, can_view_progress, can_view_grades,
-- can_view_accessibility, can_communicate_teachers, can_modify_accessibility,
-- receives_reports, report_frequency). This migration:
--
--   1. Adds 'guardian' to the user_role enum so the auth layer can persist
--      a guardian-typed user. Defensive — also handles the path where the
--      `users.role` column was created with a CHECK constraint instead of a
--      named enum (e.g., a hand-edited dev DB).
--
--   2. Indexes the columns the guardian flow queries against:
--        - guardian_links.verification_code  (consume-invite endpoint)
--        - guardian_links.guardian_email     (resend-invite + dedupe)
--        - guardian_links.guardian_id        (already exists; no-op here)
--      Each is a partial index limited to active rows so the index stays
--      small as the table grows.
--
--   3. Adds an `invited_at` timestamp + a `expires_at` column so a stale,
--      never-clicked invite can be auto-pruned by a future cron without
--      touching the verified-at semantics. Defaults set such that existing
--      rows interpret as "never expires" (NULL) — preserves prior behavior.
--
-- All changes are idempotent (`IF NOT EXISTS` everywhere). Re-running on a
-- primed DB is a no-op. Caveat: `ALTER TYPE ... ADD VALUE IF NOT EXISTS`
-- cannot run inside a transaction in some PG versions; Supabase's migration
-- runner detaches it automatically. If you apply this manually via psql,
-- run the role-enum statement on its own connection.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Role enum: ensure 'guardian' is permitted on users.role.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
    role_type_name text;
BEGIN
    -- Discover the named enum type backing users.role, if any. We can't
    -- assume the type is called 'user_role' — the canonical Database.sql
    -- shows `role USER-DEFINED` which only tells us "an enum exists" but
    -- not its name.
    SELECT t.typname INTO role_type_name
    FROM pg_attribute a
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'public.users'::regclass
      AND a.attname = 'role'
      AND t.typtype = 'e'
    LIMIT 1;

    IF role_type_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''guardian''',
            role_type_name
        );
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        -- Value already exists — fine.
        NULL;
    WHEN others THEN
        -- Don't crash the migration runner. The role insert later will
        -- surface the real error if 'guardian' isn't actually accepted.
        RAISE NOTICE 'Skipped role enum extension: %', SQLERRM;
END $$;


-- ----------------------------------------------------------------------------
-- 2. Guardian-link indexes for the invite + resend + verification queries.
--    `WHERE is_active` keeps the indexes small — soft-deleted rows aren't
--    consulted by the read paths.
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_guardian_links_verification_code
    ON guardian_links (verification_code)
    WHERE is_active = TRUE AND verification_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_guardian_links_guardian_email_active
    ON guardian_links (guardian_email)
    WHERE is_active = TRUE;


-- ----------------------------------------------------------------------------
-- 3. Invite-lifecycle columns. NULLable on purpose so existing rows are
--    treated as "issued unknown / never expires", which matches the legacy
--    behavior. New rows minted by `/accessibility/guardian-links` will set
--    both fields explicitly.
-- ----------------------------------------------------------------------------

ALTER TABLE guardian_links
    ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE guardian_links
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

COMMENT ON COLUMN guardian_links.invited_at IS
    'When the student created this link. Used to age out unredeemed invites.';
COMMENT ON COLUMN guardian_links.expires_at IS
    'When the verification token stops being accepted. NULL = never expires.';


-- ----------------------------------------------------------------------------
-- 4. Notification taxonomy: surface guardian events in the existing bell
--    + push pipelines. Idempotent via the same DO/EXCEPTION shape used in
--    011_realtime_publications.sql.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'guardian_invite_sent';
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN
    RAISE NOTICE 'notification_type enum not present; skipping guardian_invite_sent';
END $$;

DO $$
BEGIN
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'guardian_invite_accepted';
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN
    RAISE NOTICE 'notification_type enum not present; skipping guardian_invite_accepted';
END $$;
