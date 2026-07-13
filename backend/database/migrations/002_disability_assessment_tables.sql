-- ============================================================================
-- DISABILITY ASSESSMENT SYSTEM - DATABASE SCHEMA
-- Stores assessment responses, inferred disabilities, and auto-applied adaptations
-- ============================================================================

-- Enum for disability types
DO $$ BEGIN
    CREATE TYPE disability_type AS ENUM (
        'dyslexia',
        'dysgraphia',
        'dyscalculia',
        'adhd',
        'asd',
        'intellectual_disability',
        'sld',
        'visual_impairment',
        'hearing_impairment',
        'physical_disability',
        'color_vision_deficiency'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum for severity levels
DO $$ BEGIN
    CREATE TYPE severity_level AS ENUM ('mild', 'moderate', 'severe');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum for color vision types
DO $$ BEGIN
    CREATE TYPE color_vision_type AS ENUM ('protanopia', 'deuteranopia', 'tritanopia', 'none');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum for teacher specialization level
DO $$ BEGIN
    CREATE TYPE specialization_level AS ENUM ('basic', 'intermediate', 'advanced', 'expert');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- TABLE: disability_assessments
-- Stores each assessment session a student completes
-- ============================================================================
CREATE TABLE IF NOT EXISTS disability_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Assessment metadata
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    is_complete BOOLEAN DEFAULT FALSE,

    -- Who helped (optional)
    assisted_by TEXT, -- 'self', 'parent', 'guardian', 'counselor'
    assistant_relationship TEXT,

    -- Assessment version (for future updates)
    assessment_version INTEGER DEFAULT 1,

    -- Raw responses stored as JSONB
    responses JSONB DEFAULT '[]'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick user lookups
CREATE INDEX IF NOT EXISTS idx_disability_assessments_user_id ON disability_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_disability_assessments_completed ON disability_assessments(user_id, is_complete);

-- ============================================================================
-- TABLE: inferred_disabilities
-- Stores the system-inferred disabilities from assessment responses
-- ============================================================================
CREATE TABLE IF NOT EXISTS inferred_disabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assessment_id UUID REFERENCES disability_assessments(id) ON DELETE CASCADE,

    -- Inferred disability details
    disability_type disability_type NOT NULL,
    confidence_score DECIMAL(5,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    severity severity_level NOT NULL,

    -- For color vision deficiency
    color_vision_subtype color_vision_type,

    -- User can override/dismiss inference
    user_confirmed BOOLEAN DEFAULT NULL, -- NULL = not reviewed, TRUE = confirmed, FALSE = dismissed
    user_confirmed_at TIMESTAMP WITH TIME ZONE,

    -- Professional diagnosis (optional)
    professionally_diagnosed BOOLEAN DEFAULT FALSE,
    diagnosis_date DATE,
    diagnosing_professional TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user disability lookups
CREATE INDEX IF NOT EXISTS idx_inferred_disabilities_user_id ON inferred_disabilities(user_id);
CREATE INDEX IF NOT EXISTS idx_inferred_disabilities_type ON inferred_disabilities(user_id, disability_type);

-- ============================================================================
-- TABLE: user_adaptation_profiles
-- Stores the auto-generated and user-customized adaptation settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_adaptation_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Profile can be auto-generated or manually customized
    is_auto_generated BOOLEAN DEFAULT TRUE,
    based_on_assessment_id UUID REFERENCES disability_assessments(id),

    -- Visual adaptations
    font_family TEXT DEFAULT 'system-ui, -apple-system, sans-serif',
    font_size INTEGER DEFAULT 100 CHECK (font_size >= 50 AND font_size <= 300),
    line_height DECIMAL(3,2) DEFAULT 1.5,
    letter_spacing DECIMAL(4,3) DEFAULT 0,
    word_spacing DECIMAL(4,3) DEFAULT 0,
    text_color TEXT DEFAULT '#1a1a1a',
    background_color TEXT DEFAULT '#ffffff',
    high_contrast BOOLEAN DEFAULT FALSE,
    color_filter color_vision_type DEFAULT 'none',

    -- Cognitive adaptations
    reduced_animations BOOLEAN DEFAULT FALSE,
    focus_mode BOOLEAN DEFAULT FALSE,
    simplified_ui BOOLEAN DEFAULT FALSE,
    chunk_content BOOLEAN DEFAULT FALSE,
    break_reminders BOOLEAN DEFAULT FALSE,
    break_interval_minutes INTEGER DEFAULT 25,

    -- Reading aids
    reading_guide BOOLEAN DEFAULT FALSE,
    reading_ruler BOOLEAN DEFAULT FALSE,
    text_to_speech BOOLEAN DEFAULT FALSE,
    tts_rate DECIMAL(3,2) DEFAULT 1.0,
    tts_voice TEXT,

    -- Input adaptations
    large_click_targets BOOLEAN DEFAULT FALSE,
    keyboard_navigation BOOLEAN DEFAULT FALSE,
    voice_input BOOLEAN DEFAULT FALSE,
    extended_timeouts BOOLEAN DEFAULT FALSE,
    timeout_multiplier DECIMAL(3,2) DEFAULT 1.5,

    -- Audio adaptations
    visual_alerts BOOLEAN DEFAULT FALSE,
    captions_enabled BOOLEAN DEFAULT FALSE,
    sign_language_support BOOLEAN DEFAULT FALSE,

    -- Layout adaptations
    predictable_layout BOOLEAN DEFAULT FALSE,
    reduced_sensory_input BOOLEAN DEFAULT FALSE,
    clear_navigation_cues BOOLEAN DEFAULT FALSE,

    -- Metadata
    last_auto_update TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_user_profile UNIQUE(user_id)
);

-- ============================================================================
-- TABLE: teacher_disability_specializations
-- Stores teacher expertise in specific disabilities
-- ============================================================================
CREATE TABLE IF NOT EXISTS teacher_disability_specializations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Specialization details
    disability_type disability_type NOT NULL,
    specialization_level specialization_level DEFAULT 'basic',

    -- Credentials
    certified BOOLEAN DEFAULT FALSE,
    certification_name TEXT,
    certification_date DATE,
    certification_expiry DATE,

    -- Experience
    years_experience INTEGER DEFAULT 0,
    students_taught INTEGER DEFAULT 0,

    -- Self-reported comfort level (1-5)
    comfort_level INTEGER DEFAULT 3 CHECK (comfort_level >= 1 AND comfort_level <= 5),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_teacher_specialty UNIQUE(teacher_id, disability_type)
);

-- Index for finding specialized teachers
CREATE INDEX IF NOT EXISTS idx_teacher_specializations_type ON teacher_disability_specializations(disability_type);
CREATE INDEX IF NOT EXISTS idx_teacher_specializations_certified ON teacher_disability_specializations(disability_type, certified);

-- ============================================================================
-- TABLE: course_accessibility_tags
-- Tags courses with disability compatibility
-- ============================================================================
CREATE TABLE IF NOT EXISTS course_accessibility_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL, -- References courses table

    -- Accessibility features
    disability_type disability_type NOT NULL,
    compatibility_level INTEGER DEFAULT 3 CHECK (compatibility_level >= 1 AND compatibility_level <= 5),

    -- Specific accommodations available
    has_captions BOOLEAN DEFAULT FALSE,
    has_transcripts BOOLEAN DEFAULT FALSE,
    has_audio_description BOOLEAN DEFAULT FALSE,
    has_sign_language BOOLEAN DEFAULT FALSE,
    has_simplified_version BOOLEAN DEFAULT FALSE,
    has_extended_time BOOLEAN DEFAULT FALSE,

    -- Content warnings
    has_flashing_content BOOLEAN DEFAULT FALSE,
    has_audio_required BOOLEAN DEFAULT FALSE,
    has_video_required BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_course_disability UNIQUE(course_id, disability_type)
);

-- ============================================================================
-- TABLE: student_teacher_accessibility_sharing
-- Controls what accessibility info teachers can see
-- ============================================================================
CREATE TABLE IF NOT EXISTS student_teacher_accessibility_sharing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Sharing permissions
    share_disability_types BOOLEAN DEFAULT TRUE,
    share_severity BOOLEAN DEFAULT FALSE,
    share_specific_needs BOOLEAN DEFAULT TRUE,
    share_accommodation_notes BOOLEAN DEFAULT TRUE,

    -- Auto-approved for enrolled courses
    auto_approved BOOLEAN DEFAULT TRUE,
    manually_revoked BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_student_teacher_share UNIQUE(student_id, teacher_id)
);

-- ============================================================================
-- TABLE: guardian_links
-- Links students to guardians/parents who can assist
-- ============================================================================
CREATE TABLE IF NOT EXISTS guardian_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Guardian info (may or may not have account)
    guardian_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    guardian_email TEXT NOT NULL,
    guardian_name TEXT,
    guardian_phone TEXT,
    relationship TEXT DEFAULT 'parent', -- 'parent', 'guardian', 'caregiver', 'counselor'

    -- Permissions
    can_view_progress BOOLEAN DEFAULT TRUE,
    can_modify_settings BOOLEAN DEFAULT FALSE,
    can_communicate_teachers BOOLEAN DEFAULT TRUE,

    -- Verification
    is_verified BOOLEAN DEFAULT FALSE,
    verification_code TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT unnest(ARRAY[
            'disability_assessments',
            'inferred_disabilities',
            'user_adaptation_profiles',
            'teacher_disability_specializations',
            'course_accessibility_tags',
            'student_teacher_accessibility_sharing',
            'guardian_links'
        ])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;
            CREATE TRIGGER update_%s_updated_at
                BEFORE UPDATE ON %s
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE disability_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inferred_disabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_adaptation_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_disability_specializations ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_teacher_accessibility_sharing ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_links ENABLE ROW LEVEL SECURITY;

-- Users can only see their own assessment data
CREATE POLICY "Users can view own assessments" ON disability_assessments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assessments" ON disability_assessments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assessments" ON disability_assessments
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can only see their own disabilities
CREATE POLICY "Users can view own disabilities" ON inferred_disabilities
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own disabilities" ON inferred_disabilities
    FOR ALL USING (auth.uid() = user_id);

-- Users can only manage their own adaptation profiles
CREATE POLICY "Users can manage own adaptations" ON user_adaptation_profiles
    FOR ALL USING (auth.uid() = user_id);

-- Teachers can manage their own specializations
CREATE POLICY "Teachers can manage own specializations" ON teacher_disability_specializations
    FOR ALL USING (auth.uid() = teacher_id);

-- Sharing permissions
CREATE POLICY "Students can manage sharing" ON student_teacher_accessibility_sharing
    FOR ALL USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view shared info" ON student_teacher_accessibility_sharing
    FOR SELECT USING (auth.uid() = teacher_id);

-- Guardian links
CREATE POLICY "Students can manage guardians" ON guardian_links
    FOR ALL USING (auth.uid() = student_id);

CREATE POLICY "Guardians can view links" ON guardian_links
    FOR SELECT USING (auth.uid() = guardian_user_id);
