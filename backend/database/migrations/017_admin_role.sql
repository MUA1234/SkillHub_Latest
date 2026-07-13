-- ============================================================================
-- 017_admin_role.sql
-- Phase L1 — Admin role.
--
-- Discovers the named enum backing `users.role` and adds 'admin' to it.
-- Defensive: tolerates dev DBs that used a CHECK constraint instead of a
-- named enum. Same pattern used in `013_guardian_role.sql`.
--
-- `database/models.py` already lists `admin` in the Python `UserRole`
-- enum (added in Phase A6), so once this migration applies, the backend
-- can persist an admin-typed row immediately.
-- ============================================================================

DO $$
DECLARE
    role_type_name text;
BEGIN
    SELECT t.typname INTO role_type_name
    FROM pg_attribute a
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'public.users'::regclass
      AND a.attname = 'role'
      AND t.typtype = 'e'
    LIMIT 1;

    IF role_type_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''admin''',
            role_type_name
        );
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN
        RAISE NOTICE 'Skipped role enum extension: %', SQLERRM;
END $$;
