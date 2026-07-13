-- Migration 010: Sponsor → Student funding (the heart of the platform).
--
-- Phase E adds four tables that let a sponsor fund students directly rather
-- than only funding a teacher. The general flow is:
--
--   sponsor opens a `scholarships` row (budget + eligibility criteria)
--      → eligible students see it via the matcher, submit
--        `scholarship_applications`
--      → sponsor approves an application
--      → a `student_funding_grants` row is minted, which the payments
--        endpoint can consume to satisfy a session price without the
--        student paying a cent.
--
--   `access_codes` is a parallel, lighter-weight path: a sponsor pre-prints
--   one-time codes (e.g. handed out at an outreach event) that any student
--   can redeem to unlock a free enrollment immediately.
--
-- All currency values are stored in LKR — Sri Lanka is the only audience
-- for now (Phase C anchored the platform on LKR and the matcher uses
-- `family_income_lkr` for income-tested scholarships).
--
-- Idempotent: re-running this migration on a database that already has
-- these tables is a no-op (`IF NOT EXISTS`).

-- ============================================================================
-- Scholarships: the funding pool a sponsor opens
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scholarships (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sponsor_id                  uuid NOT NULL REFERENCES public.sponsor_profiles(id) ON DELETE CASCADE,
    title                       varchar(255) NOT NULL,
    description                 text,
    -- Total amount the sponsor is willing to disburse across all approved
    -- applications. Stored in LKR; per-applicant grants are sized at
    -- approval time, not stored here.
    total_amount_lkr            numeric(12, 2) NOT NULL DEFAULT 0,
    -- Currency is hard-coded to LKR for the MVP; the column exists so a
    -- future sponsor (e.g. an overseas donor) can pledge in another
    -- currency without an additional migration.
    currency                    varchar(3) NOT NULL DEFAULT 'LKR',
    -- Free-form criteria — the matcher reads known keys (province,
    -- max_family_income_lkr, min_grade, max_grade, schools[]) but a
    -- sponsor can stash extra rules here without a schema change.
    eligibility_criteria        jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Disability targeting is a first-class column (not just a jsonb key)
    -- because the matcher runs an array overlap query against
    -- `student_disability_profiles` — a typed array indexes properly.
    target_disability_types     text[] NOT NULL DEFAULT ARRAY[]::text[],
    target_locations            text[] NOT NULL DEFAULT ARRAY[]::text[],
    slots_available             integer NOT NULL DEFAULT 0 CHECK (slots_available >= 0),
    slots_filled                integer NOT NULL DEFAULT 0 CHECK (slots_filled >= 0),
    status                      varchar(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'open', 'closed', 'archived')),
    start_date                  date,
    end_date                    date,
    created_at                  timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scholarships_sponsor       ON public.scholarships (sponsor_id);
CREATE INDEX IF NOT EXISTS idx_scholarships_open
    ON public.scholarships (status)
    WHERE status = 'open';
-- GIN index lets `target_disability_types && ARRAY[...]` queries by the
-- matcher run in O(log n) instead of a full table scan.
CREATE INDEX IF NOT EXISTS idx_scholarships_disability    ON public.scholarships USING gin (target_disability_types);
CREATE INDEX IF NOT EXISTS idx_scholarships_locations     ON public.scholarships USING gin (target_locations);


-- ============================================================================
-- Scholarship applications
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scholarship_applications (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scholarship_id      uuid NOT NULL REFERENCES public.scholarships(id) ON DELETE CASCADE,
    student_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    statement_of_need   text,
    -- Income is captured in LKR per month at the household level (matches
    -- how the matcher's `max_family_income_lkr` rule reads).
    family_income_lkr   numeric(10, 2),
    school              varchar(255),
    grade               varchar(50),
    status              varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'funded', 'withdrawn')),
    reviewed_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
    reviewer_notes      text,
    reviewed_at         timestamp with time zone,
    created_at          timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- A student can only apply once per scholarship — re-applying needs
    -- to update the existing row (or be a withdrawn → re-submitted case
    -- handled at the API layer).
    UNIQUE (scholarship_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_scholarship_applications_scholarship ON public.scholarship_applications (scholarship_id);
CREATE INDEX IF NOT EXISTS idx_scholarship_applications_student     ON public.scholarship_applications (student_id);
CREATE INDEX IF NOT EXISTS idx_scholarship_applications_pending
    ON public.scholarship_applications (scholarship_id, created_at DESC)
    WHERE status = 'pending';


-- ============================================================================
-- Funding grants — the disbursement record
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_funding_grants (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scholarship_application_id  uuid REFERENCES public.scholarship_applications(id) ON DELETE SET NULL,
    student_id                  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sponsor_id                  uuid NOT NULL REFERENCES public.sponsor_profiles(id) ON DELETE CASCADE,
    amount_lkr                  numeric(12, 2) NOT NULL CHECK (amount_lkr >= 0),
    -- Either of these may point at the entity the grant is being spent on.
    -- Both nullable so a "general study fund" grant can exist before the
    -- student picks the session/course it covers.
    applies_to_session_id       uuid REFERENCES public.live_sessions(id) ON DELETE SET NULL,
    applies_to_course_id        uuid REFERENCES public.courses(id) ON DELETE SET NULL,
    -- `available` → minted but unused.
    -- `used`      → spent on a session/course payment.
    -- `expired`   → grant aged out without being used.
    -- `revoked`   → sponsor pulled the grant before use.
    status                      varchar(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'used', 'expired', 'revoked')),
    used_at                     timestamp with time zone,
    expires_at                  timestamp with time zone,
    created_at                  timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_funding_grants_student   ON public.student_funding_grants (student_id);
CREATE INDEX IF NOT EXISTS idx_funding_grants_sponsor   ON public.student_funding_grants (sponsor_id);
CREATE INDEX IF NOT EXISTS idx_funding_grants_available
    ON public.student_funding_grants (student_id, created_at DESC)
    WHERE status = 'available';


-- ============================================================================
-- Access codes — the offline / event-handout path
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.access_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sponsor_id      uuid NOT NULL REFERENCES public.sponsor_profiles(id) ON DELETE CASCADE,
    code            varchar(64) NOT NULL UNIQUE,
    value_lkr       numeric(10, 2) NOT NULL CHECK (value_lkr >= 0),
    max_uses        integer NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
    uses            integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
    -- Free-form note ("Jaffna outreach 2026", "Press launch giveaway") so
    -- the sponsor can sort their codes without a separate campaigns table.
    label           varchar(255),
    expires_at      timestamp with time zone,
    created_at      timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Sanity: a code can never be redeemed more than `max_uses` times.
    -- Enforced at the API layer too, but the constraint guards against
    -- direct DB writes / race conditions in absence of SELECT FOR UPDATE.
    CONSTRAINT access_codes_uses_within_max CHECK (uses <= max_uses)
);

CREATE INDEX IF NOT EXISTS idx_access_codes_sponsor ON public.access_codes (sponsor_id);
CREATE INDEX IF NOT EXISTS idx_access_codes_active
    ON public.access_codes (code)
    WHERE uses < max_uses;


-- Each redemption is its own row so we can audit who used what (and stop a
-- single student from reusing the same code if the sponsor opted in to
-- single-redemption-per-student-per-code).
CREATE TABLE IF NOT EXISTS public.access_code_redemptions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    access_code_id  uuid NOT NULL REFERENCES public.access_codes(id) ON DELETE CASCADE,
    student_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    grant_id        uuid REFERENCES public.student_funding_grants(id) ON DELETE SET NULL,
    redeemed_at     timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (access_code_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_access_code_redemptions_code
    ON public.access_code_redemptions (access_code_id);


-- ============================================================================
-- Notification types
-- ============================================================================

DO $$
BEGIN
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scholarship_match';
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scholarship_application_received';
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scholarship_approved';
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scholarship_rejected';
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scholarship_funded';
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'access_code_redeemed';
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
