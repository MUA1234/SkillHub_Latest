-- Live Session Enrollment and Payment System
-- Adds enrollment and payment tracking to existing live_sessions table

-- Add missing fields to live_sessions table
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS requires_payment BOOLEAN DEFAULT FALSE;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS subject VARCHAR(255);
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS grade_level VARCHAR(100);

-- Create live_session_participants table (if doesn't exist)
CREATE TABLE IF NOT EXISTS live_session_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    registration_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_amount NUMERIC(10, 2),
    joined_at TIMESTAMP WITH TIME ZONE,
    left_at TIMESTAMP WITH TIME ZONE,
    attended BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, student_id)
);

-- Session Enrollment Requests Table
CREATE TABLE IF NOT EXISTS live_session_enrollment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    request_message TEXT,
    teacher_response TEXT,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, student_id)
);

-- Session Payments Table
CREATE TABLE IF NOT EXISTS live_session_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_request_id UUID NOT NULL REFERENCES live_session_enrollment_requests(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
    payment_method VARCHAR(100),
    transaction_id VARCHAR(255) UNIQUE,
    payment_gateway VARCHAR(100),
    paid_at TIMESTAMP WITH TIME ZONE,
    refunded_at TIMESTAMP WITH TIME ZONE,
    refund_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Update existing notifications table to add new types if needed
-- Note: The notifications table already exists, we just need to ensure our types are supported
DO $$ 
BEGIN
    -- Add new notification types to the existing enum if it exists
    -- This is a safe operation that won't fail if types already exist
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'session_enrollment_request';
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'enrollment_approved';
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'enrollment_rejected';
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_required';
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_received';
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'session_starting_soon';
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'session_cancelled';
EXCEPTION
    WHEN OTHERS THEN
        -- If the enum doesn't exist or can't be modified, that's okay
        NULL;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_live_session_enrollments_session ON live_session_enrollment_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_live_session_enrollments_student ON live_session_enrollment_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_live_session_enrollments_status ON live_session_enrollment_requests(status);
CREATE INDEX IF NOT EXISTS idx_live_session_payments_student ON live_session_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_live_session_payments_teacher ON live_session_payments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_live_session_payments_session ON live_session_payments(session_id);
CREATE INDEX IF NOT EXISTS idx_live_session_payments_status ON live_session_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_live_sessions_subject ON live_sessions(subject);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON live_sessions(status);
CREATE INDEX IF NOT EXISTS idx_live_sessions_teacher ON live_sessions(teacher_id);

-- Update function for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_live_session_enrollments_updated_at ON live_session_enrollment_requests;
CREATE TRIGGER update_live_session_enrollments_updated_at 
    BEFORE UPDATE ON live_session_enrollment_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_live_session_payments_updated_at ON live_session_payments;
CREATE TRIGGER update_live_session_payments_updated_at 
    BEFORE UPDATE ON live_session_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE live_session_enrollment_requests IS 'Tracks student requests to join live sessions';
COMMENT ON TABLE live_session_payments IS 'Tracks payments for session enrollments';
COMMENT ON COLUMN live_sessions.price IS 'Session price in the specified currency';
COMMENT ON COLUMN live_sessions.requires_payment IS 'Whether payment is required to join this session';
COMMENT ON COLUMN live_sessions.subject IS 'Subject/topic of the session (e.g., Mathematics, Physics)';
COMMENT ON COLUMN live_sessions.grade_level IS 'Target grade level (e.g., Grade 10, University)';
