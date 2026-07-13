-- Phase L5 — Teacher payout tracking.
--
-- Records manual bank-transfer payouts to teachers. The demo-payments
-- flow has no real money to route automatically, so this table is the
-- bookkeeping side: admins compute earnings from `live_session_payments`
-- already attributed to the teacher, mark a payout request as paid once
-- the bank transfer happens out-of-band, and store the bank reference
-- for audit. When the real payment gateway lands later, an automated
-- payout pipeline can write to this same table without UI changes.
--
-- Idempotent: every CREATE / ALTER guarded.

CREATE TABLE IF NOT EXISTS teacher_payouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_profile_id uuid NOT NULL REFERENCES teacher_profiles(id) ON DELETE CASCADE,
    amount_lkr numeric(12,2) NOT NULL CHECK (amount_lkr >= 0),
    currency text NOT NULL DEFAULT 'LKR',
    status text NOT NULL DEFAULT 'pending',
        -- pending | approved | paid | cancelled
    period_start date,
    period_end date,
    bank_name text,
    bank_account_number text,
    bank_account_holder text,
    bank_reference text,             -- filled in on payout
    admin_notes text,
    requested_at timestamptz NOT NULL DEFAULT NOW(),
    approved_at timestamptz,
    paid_at timestamptz,
    approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
    paid_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teacher_payouts_teacher
    ON teacher_payouts(teacher_profile_id);

-- Partial index on the admin queue's primary lookup: pending + approved
-- rows are tiny vs the historical `paid` set, so a partial keeps it warm.
CREATE INDEX IF NOT EXISTS idx_teacher_payouts_open
    ON teacher_payouts(status, requested_at DESC)
    WHERE status IN ('pending', 'approved');

-- New notification types so the teacher's bell lights up on status changes.
DO $$ BEGIN
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payout_requested';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payout_approved';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payout_paid';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;
