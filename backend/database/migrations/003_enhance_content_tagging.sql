-- ============================================================================
-- ENHANCED CONTENT TAGGING FOR ACCESSIBILITY
-- Adds sensory load and interaction type tagging for courses
-- ============================================================================

-- Enum for sensory load levels
DO $$ BEGIN
    CREATE TYPE sensory_load_level AS ENUM ('low', 'medium', 'high');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum for interaction types
DO $$ BEGIN
    CREATE TYPE interaction_type AS ENUM ('visual', 'auditory', 'kinesthetic', 'text_based', 'mixed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add sensory load and interaction type to course_accessibility_tags
ALTER TABLE course_accessibility_tags
ADD COLUMN IF NOT EXISTS sensory_load sensory_load_level DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS primary_interaction_type interaction_type DEFAULT 'mixed',
ADD COLUMN IF NOT EXISTS requires_sustained_attention BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS allows_self_pacing BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS estimated_cognitive_load INTEGER DEFAULT 3 CHECK (estimated_cognitive_load >= 1 AND estimated_cognitive_load <= 5);

-- Add metadata for content pacing
ALTER TABLE course_accessibility_tags
ADD COLUMN IF NOT EXISTS recommended_break_frequency INTEGER, -- Minutes between breaks
ADD COLUMN IF NOT EXISTS average_session_length INTEGER; -- Recommended session length in minutes

-- ============================================================================
-- TABLE: content_sensory_profiles
-- Detailed sensory profile for course content items
-- ============================================================================
CREATE TABLE IF NOT EXISTS content_sensory_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL, -- References course_content table
    course_id UUID NOT NULL, -- References courses table

    -- Visual load
    visual_complexity INTEGER DEFAULT 3 CHECK (visual_complexity >= 1 AND visual_complexity <= 5),
    color_count INTEGER, -- Number of distinct colors used
    has_animations BOOLEAN DEFAULT FALSE,
    animation_speed TEXT, -- 'slow', 'medium', 'fast'
    has_flashing BOOLEAN DEFAULT FALSE,
    contrast_level TEXT DEFAULT 'standard', -- 'low', 'standard', 'high'

    -- Auditory load
    auditory_complexity INTEGER DEFAULT 3 CHECK (auditory_complexity >= 1 AND auditory_complexity <= 5),
    has_background_music BOOLEAN DEFAULT FALSE,
    has_sound_effects BOOLEAN DEFAULT FALSE,
    audio_clarity INTEGER DEFAULT 3 CHECK (audio_clarity >= 1 AND audio_clarity <= 5),
    has_overlapping_audio BOOLEAN DEFAULT FALSE,

    -- Cognitive load
    text_density INTEGER DEFAULT 3 CHECK (text_density >= 1 AND text_density <= 5),
    concept_complexity INTEGER DEFAULT 3 CHECK (concept_complexity >= 1 AND concept_complexity <= 5),
    multitasking_required BOOLEAN DEFAULT FALSE,
    requires_sequential_processing BOOLEAN DEFAULT TRUE,

    -- Motor requirements
    requires_precise_clicking BOOLEAN DEFAULT FALSE,
    requires_typing BOOLEAN DEFAULT FALSE,
    requires_dragging BOOLEAN DEFAULT FALSE,
    has_time_limits BOOLEAN DEFAULT FALSE,

    -- Metadata
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_content_sensory_profile UNIQUE(content_id)
);

-- ============================================================================
-- TABLE: teacher_communication_preferences
-- Stores teacher preferences for different types of communication
-- ============================================================================
CREATE TABLE IF NOT EXISTS teacher_communication_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Communication channels enabled
    accepts_student_messages BOOLEAN DEFAULT TRUE,
    accepts_parent_messages BOOLEAN DEFAULT TRUE,
    accepts_sponsor_meetings BOOLEAN DEFAULT FALSE,
    accepts_teacher_collaboration BOOLEAN DEFAULT TRUE,

    -- Response time commitments
    typical_response_time_hours INTEGER DEFAULT 24,
    available_for_video_calls BOOLEAN DEFAULT TRUE,
    available_for_voice_calls BOOLEAN DEFAULT TRUE,
    available_for_text_chat BOOLEAN DEFAULT TRUE,

    -- Office hours (JSON array of time slots)
    office_hours JSONB DEFAULT '[]'::jsonb,

    -- Collaboration preferences
    open_to_co_teaching BOOLEAN DEFAULT FALSE,
    open_to_mentoring BOOLEAN DEFAULT TRUE,
    preferred_communication_language TEXT[],

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_teacher_communication UNIQUE(teacher_id)
);

-- ============================================================================
-- TABLE: teacher_sponsor_connections
-- Tracks connections between teachers and sponsors for meetings/collaboration
-- ============================================================================
CREATE TABLE IF NOT EXISTS teacher_sponsor_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sponsor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Connection type
    connection_type TEXT DEFAULT 'general', -- 'sponsorship', 'collaboration', 'consultation'

    -- Status
    status TEXT DEFAULT 'pending', -- 'pending', 'active', 'completed', 'declined'

    -- Meeting history
    total_meetings INTEGER DEFAULT 0,
    last_meeting_at TIMESTAMP WITH TIME ZONE,

    -- Notes
    notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_teacher_sponsor UNIQUE(teacher_id, sponsor_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_content_sensory_course ON content_sensory_profiles(course_id);
CREATE INDEX IF NOT EXISTS idx_content_sensory_visual ON content_sensory_profiles(visual_complexity);
CREATE INDEX IF NOT EXISTS idx_content_sensory_auditory ON content_sensory_profiles(auditory_complexity);
CREATE INDEX IF NOT EXISTS idx_content_sensory_cognitive ON content_sensory_profiles(concept_complexity);

CREATE INDEX IF NOT EXISTS idx_teacher_comm_video_available ON teacher_communication_preferences(teacher_id, available_for_video_calls);
CREATE INDEX IF NOT EXISTS idx_teacher_sponsor_status ON teacher_sponsor_connections(status);
CREATE INDEX IF NOT EXISTS idx_teacher_sponsor_teacher ON teacher_sponsor_connections(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_sponsor_sponsor ON teacher_sponsor_connections(sponsor_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE content_sensory_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_communication_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_sponsor_connections ENABLE ROW LEVEL SECURITY;

-- Teachers and enrolled students can view content sensory profiles
CREATE POLICY "Users can view content sensory profiles" ON content_sensory_profiles
    FOR SELECT USING (true); -- Public read for now, can be restricted later

-- Teachers can manage their own sensory profiles
CREATE POLICY "Teachers can manage sensory profiles" ON content_sensory_profiles
    FOR ALL USING (
        reviewed_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = content_sensory_profiles.course_id
            AND c.teacher_id IN (
                SELECT tp.id FROM teacher_profiles tp WHERE tp.user_id = auth.uid()
            )
        )
    );

-- Teachers manage their own communication preferences
CREATE POLICY "Teachers manage own comm prefs" ON teacher_communication_preferences
    FOR ALL USING (auth.uid() = teacher_id);

-- Anyone can view teacher communication preferences (for contact info)
CREATE POLICY "Anyone can view teacher comm prefs" ON teacher_communication_preferences
    FOR SELECT USING (true);

-- Teachers and sponsors can view their connections
CREATE POLICY "Teachers view own connections" ON teacher_sponsor_connections
    FOR SELECT USING (auth.uid() = teacher_id OR auth.uid() = sponsor_id);

-- Teachers and sponsors can manage their connections
CREATE POLICY "Teachers manage connections" ON teacher_sponsor_connections
    FOR ALL USING (auth.uid() = teacher_id OR auth.uid() = sponsor_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_content_sensory_profiles_updated_at
    BEFORE UPDATE ON content_sensory_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teacher_communication_preferences_updated_at
    BEFORE UPDATE ON teacher_communication_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teacher_sponsor_connections_updated_at
    BEFORE UPDATE ON teacher_sponsor_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE course_accessibility_tags IS 'Tags courses with disability compatibility and sensory/interaction type';
COMMENT ON TABLE content_sensory_profiles IS 'Detailed sensory load analysis for individual content items';
COMMENT ON TABLE teacher_communication_preferences IS 'Teacher preferences for communication with students, parents, sponsors';
COMMENT ON TABLE teacher_sponsor_connections IS 'Tracks teacher-sponsor relationships for meetings and collaboration';

COMMENT ON COLUMN course_accessibility_tags.sensory_load IS 'Overall sensory load: low (minimal stimuli), medium (balanced), high (rich multimedia)';
COMMENT ON COLUMN course_accessibility_tags.primary_interaction_type IS 'Primary way students interact with content';
COMMENT ON COLUMN content_sensory_profiles.visual_complexity IS 'Visual complexity on scale 1-5';
COMMENT ON COLUMN content_sensory_profiles.auditory_complexity IS 'Auditory complexity on scale 1-5';
COMMENT ON COLUMN content_sensory_profiles.concept_complexity IS 'Cognitive complexity on scale 1-5';
