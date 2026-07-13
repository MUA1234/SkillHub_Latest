-- ============================================================================
-- CONTENT DISABILITY FILTERING ENHANCEMENT
-- Adds columns to support filtering content by disability type
-- ============================================================================

-- Add target disability types to course_content table
ALTER TABLE course_content
ADD COLUMN IF NOT EXISTS target_disability_types TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS caption_url TEXT,
ADD COLUMN IF NOT EXISTS transcript_url TEXT,
ADD COLUMN IF NOT EXISTS audio_description_url TEXT,
ADD COLUMN IF NOT EXISTS sign_language_video_url TEXT,
ADD COLUMN IF NOT EXISTS is_accessible_for_all BOOLEAN DEFAULT TRUE;

-- Add accessibility metadata to course_content
ALTER TABLE course_content
ADD COLUMN IF NOT EXISTS requires_vision BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS requires_hearing BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS requires_motor_skills BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS cognitive_level INTEGER DEFAULT 3 CHECK (cognitive_level >= 1 AND cognitive_level <= 5);

-- Add columns to live_sessions for disability targeting
ALTER TABLE live_sessions
ADD COLUMN IF NOT EXISTS target_disability_types TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS has_live_captions BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_sign_language_interpreter BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS accessibility_level INTEGER DEFAULT 3 CHECK (accessibility_level >= 1 AND accessibility_level <= 5),
ADD COLUMN IF NOT EXISTS special_accommodations TEXT;

-- Create index for faster filtering by disability types
CREATE INDEX IF NOT EXISTS idx_course_content_disability_types 
ON course_content USING gin(target_disability_types);

CREATE INDEX IF NOT EXISTS idx_live_sessions_disability_types 
ON live_sessions USING gin(target_disability_types);

-- Create table for content captions (multiple languages)
CREATE TABLE IF NOT EXISTS content_captions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES course_content(id) ON DELETE CASCADE,
    language VARCHAR(10) DEFAULT 'en',
    caption_format VARCHAR(10) DEFAULT 'vtt', -- vtt, srt, etc.
    caption_url TEXT NOT NULL,
    auto_generated BOOLEAN DEFAULT TRUE,
    accuracy_percentage INTEGER CHECK (accuracy_percentage >= 0 AND accuracy_percentage <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_captions_content_id ON content_captions(content_id);
CREATE INDEX IF NOT EXISTS idx_content_captions_language ON content_captions(content_id, language);

-- Update student_disability_profiles to track preferred content
ALTER TABLE student_disability_profiles
ADD COLUMN IF NOT EXISTS preferred_content_format VARCHAR(50) DEFAULT 'video_with_captions',
ADD COLUMN IF NOT EXISTS subtitle_preference VARCHAR(20) DEFAULT 'always_on',
ADD COLUMN IF NOT EXISTS preferred_teachers UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS avoid_flashing_content BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS prefer_text_heavy BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS prefer_video_heavy BOOLEAN DEFAULT FALSE;

-- Create materialized view for quickly finding accessible content for students
CREATE MATERIALIZED VIEW IF NOT EXISTS student_accessible_content AS
SELECT 
    sdp.user_id as student_id,
    cc.id as content_id,
    cc.course_id,
    cc.title,
    cc.content_type,
    COALESCE(
        array_length(ARRAY(
            SELECT unnest(sdp.disability_types) 
            INTERSECT 
            SELECT unnest(cc.target_disability_types)
        ), 1), 
        0
    ) as disability_match_count,
    CASE 
        WHEN cc.is_accessible_for_all THEN true
        WHEN cc.target_disability_types = '{}' THEN true
        WHEN sdp.disability_types && cc.target_disability_types THEN true
        ELSE false
    END as is_accessible
FROM student_disability_profiles sdp
CROSS JOIN course_content cc
WHERE sdp.has_disability = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_accessible_content_unique 
ON student_accessible_content(student_id, content_id);

CREATE INDEX IF NOT EXISTS idx_student_accessible_content_student 
ON student_accessible_content(student_id, is_accessible);

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_student_accessible_content()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY student_accessible_content;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to refresh view when relevant data changes
DROP TRIGGER IF EXISTS trigger_refresh_accessible_content_on_profile ON student_disability_profiles;
CREATE TRIGGER trigger_refresh_accessible_content_on_profile
AFTER INSERT OR UPDATE OR DELETE ON student_disability_profiles
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_student_accessible_content();

DROP TRIGGER IF EXISTS trigger_refresh_accessible_content_on_content ON course_content;
CREATE TRIGGER trigger_refresh_accessible_content_on_content
AFTER INSERT OR UPDATE OR DELETE ON course_content
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_student_accessible_content();

-- Create function to get recommended content for a student
CREATE OR REPLACE FUNCTION get_student_recommended_content(
    p_student_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    content_id UUID,
    course_id UUID,
    title VARCHAR,
    content_type content_type,
    disability_match_count INTEGER,
    relevance_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sac.content_id,
        sac.course_id,
        sac.title,
        sac.content_type,
        sac.disability_match_count,
        (sac.disability_match_count * 10.0 + 
         CASE WHEN sac.is_accessible THEN 50.0 ELSE 0.0 END) as relevance_score
    FROM student_accessible_content sac
    WHERE sac.student_id = p_student_id
        AND sac.is_accessible = true
    ORDER BY relevance_score DESC, sac.disability_match_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON COLUMN course_content.target_disability_types IS 'Array of disability types this content is specifically designed for';
COMMENT ON COLUMN course_content.is_accessible_for_all IS 'Whether this content is accessible to all students regardless of disability';
COMMENT ON COLUMN live_sessions.target_disability_types IS 'Array of disability types this session accommodates';
COMMENT ON COLUMN live_sessions.has_live_captions IS 'Real-time captions available during live session';
COMMENT ON COLUMN live_sessions.has_sign_language_interpreter IS 'Sign language interpreter present in live session';
COMMENT ON TABLE content_captions IS 'Stores caption/subtitle files for video content in multiple languages';
COMMENT ON MATERIALIZED VIEW student_accessible_content IS 'Pre-computed accessible content matches for faster queries';
COMMENT ON FUNCTION get_student_recommended_content IS 'Returns personalized content recommendations based on student disability profile';
