-- ============================================================================
-- ACCESSIBILITY TABLES MIGRATION FOR SKILLHUB
-- Inclusive Education Platform Database Schema
-- ============================================================================

-- Create custom enum types for accessibility
DO $$ BEGIN
    CREATE TYPE disability_type AS ENUM (
        'dyslexia',
        'dysgraphia',
        'dyscalculia',
        'adhd',
        'asd',
        'intellectual_disability',
        'sld',
        'visual_impairment_low_vision',
        'visual_impairment_blind',
        'hearing_impairment_hard_of_hearing',
        'hearing_impairment_deaf',
        'physical_disability_mobility',
        'physical_disability_no_limbs',
        'color_vision_protanopia',
        'color_vision_deuteranopia',
        'color_vision_tritanopia',
        'color_vision_achromatopsia',
        'color_vision_protanomaly',
        'color_vision_deuteranomaly',
        'color_vision_tritanomaly'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE severity_level AS ENUM ('mild', 'moderate', 'severe');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE color_blind_filter AS ENUM (
        'none',
        'protanopia',
        'deuteranopia',
        'tritanopia',
        'achromatopsia',
        'protanomaly',
        'deuteranomaly',
        'tritanomaly'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE reading_mode AS ENUM (
        'standard',
        'simplified',
        'visual_first',
        'audio_primary',
        'step_by_step'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE teacher_specialization_type AS ENUM (
        'general_education',
        'special_education',
        'dyslexia_specialist',
        'adhd_specialist',
        'asd_specialist',
        'visual_impairment_specialist',
        'hearing_impairment_specialist',
        'physical_disability_specialist',
        'speech_language_pathologist',
        'occupational_therapist',
        'behavioral_specialist',
        'inclusive_education'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- STUDENT DISABILITY PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_disability_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Primary disability information
    has_disability BOOLEAN DEFAULT FALSE,
    disability_types TEXT[] DEFAULT '{}',
    primary_disability VARCHAR(100),
    severity_levels JSONB DEFAULT '{}',

    -- Diagnosis and documentation
    professionally_diagnosed BOOLEAN DEFAULT FALSE,
    diagnosis_date TIMESTAMP,
    iep_status BOOLEAN DEFAULT FALSE,
    accommodation_letter BOOLEAN DEFAULT FALSE,

    -- Guardian/Parent information
    guardian_consent BOOLEAN DEFAULT FALSE,
    guardian_email VARCHAR(255),
    guardian_phone VARCHAR(50),
    guardian_relationship VARCHAR(50),

    -- Additional notes
    additional_needs TEXT,
    medical_notes TEXT,

    -- Privacy settings
    share_with_teachers BOOLEAN DEFAULT TRUE,
    share_with_sponsors BOOLEAN DEFAULT FALSE,

    -- Metadata
    onboarding_completed BOOLEAN DEFAULT FALSE,
    last_assessment_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_user_disability_profile UNIQUE (user_id)
);

-- ============================================================================
-- ACCESSIBILITY PREFERENCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS accessibility_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    disability_profile_id UUID REFERENCES student_disability_profiles(id),

    -- ============ VISUAL PREFERENCES ============
    font_family VARCHAR(50) DEFAULT 'system',
    font_size INTEGER DEFAULT 100 CHECK (font_size >= 50 AND font_size <= 300),
    font_weight VARCHAR(20) DEFAULT 'normal',
    letter_spacing DECIMAL(4,2) DEFAULT 0,
    word_spacing DECIMAL(4,2) DEFAULT 0,
    line_height DECIMAL(4,2) DEFAULT 1.5,

    -- Color settings
    color_scheme VARCHAR(50) DEFAULT 'default',
    background_color VARCHAR(20) DEFAULT '#ffffff',
    text_color VARCHAR(20) DEFAULT '#1a1a1a',
    link_color VARCHAR(20) DEFAULT '#0066cc',
    highlight_color VARCHAR(20) DEFAULT '#ffff00',

    -- Color vision deficiency
    color_blind_mode VARCHAR(50) DEFAULT 'none',
    color_blind_strength INTEGER DEFAULT 100 CHECK (color_blind_strength >= 0 AND color_blind_strength <= 100),

    -- Contrast and brightness
    high_contrast BOOLEAN DEFAULT FALSE,
    contrast_level INTEGER DEFAULT 100 CHECK (contrast_level >= 50 AND contrast_level <= 200),
    brightness_level INTEGER DEFAULT 100 CHECK (brightness_level >= 50 AND brightness_level <= 150),
    invert_colors BOOLEAN DEFAULT FALSE,

    -- ============ MOTION & ANIMATION ============
    reduced_motion BOOLEAN DEFAULT FALSE,
    disable_animations BOOLEAN DEFAULT FALSE,
    disable_auto_play BOOLEAN DEFAULT TRUE,
    disable_parallax BOOLEAN DEFAULT FALSE,

    -- ============ LAYOUT & NAVIGATION ============
    simplified_ui BOOLEAN DEFAULT FALSE,
    large_click_targets BOOLEAN DEFAULT FALSE,
    sticky_navigation BOOLEAN DEFAULT TRUE,
    breadcrumbs_enabled BOOLEAN DEFAULT TRUE,

    -- ============ READING PREFERENCES ============
    reading_mode VARCHAR(50) DEFAULT 'standard',
    reading_guide BOOLEAN DEFAULT FALSE,
    reading_ruler BOOLEAN DEFAULT FALSE,
    text_mask BOOLEAN DEFAULT FALSE,
    focus_highlight BOOLEAN DEFAULT FALSE,

    -- ============ AUDIO PREFERENCES ============
    screen_reader_optimized BOOLEAN DEFAULT FALSE,
    text_to_speech BOOLEAN DEFAULT FALSE,
    tts_voice VARCHAR(50) DEFAULT 'default',
    tts_speed DECIMAL(3,2) DEFAULT 1.0 CHECK (tts_speed >= 0.5 AND tts_speed <= 2.0),
    tts_pitch DECIMAL(3,2) DEFAULT 1.0 CHECK (tts_pitch >= 0.5 AND tts_pitch <= 2.0),
    audio_descriptions BOOLEAN DEFAULT TRUE,

    -- ============ CONTENT DELIVERY ============
    auto_captions BOOLEAN DEFAULT TRUE,
    sign_language_videos BOOLEAN DEFAULT FALSE,
    simplified_language BOOLEAN DEFAULT FALSE,
    visual_learning_mode BOOLEAN DEFAULT FALSE,
    step_by_step_mode BOOLEAN DEFAULT FALSE,

    -- ============ COGNITIVE SUPPORT ============
    focus_mode BOOLEAN DEFAULT FALSE,
    break_reminders BOOLEAN DEFAULT FALSE,
    break_interval_minutes INTEGER DEFAULT 25,
    progress_indicators BOOLEAN DEFAULT TRUE,
    chunked_content BOOLEAN DEFAULT FALSE,
    cognitive_load_indicator BOOLEAN DEFAULT FALSE,

    -- ============ INPUT PREFERENCES ============
    keyboard_navigation BOOLEAN DEFAULT FALSE,
    voice_input BOOLEAN DEFAULT FALSE,
    switch_access BOOLEAN DEFAULT FALSE,
    touch_accommodations BOOLEAN DEFAULT FALSE,
    extended_time_default BOOLEAN DEFAULT FALSE,

    -- ============ MATH SUPPORT ============
    math_visualization BOOLEAN DEFAULT FALSE,
    calculator_always_visible BOOLEAN DEFAULT FALSE,
    number_line_helper BOOLEAN DEFAULT FALSE,
    step_by_step_math BOOLEAN DEFAULT FALSE,

    -- ============ WRITING SUPPORT ============
    spell_check_enhanced BOOLEAN DEFAULT TRUE,
    grammar_suggestions BOOLEAN DEFAULT TRUE,
    word_prediction BOOLEAN DEFAULT FALSE,
    speech_to_text BOOLEAN DEFAULT FALSE,

    -- ============ NOTIFICATION PREFERENCES ============
    quiet_mode BOOLEAN DEFAULT FALSE,
    notification_sounds BOOLEAN DEFAULT TRUE,
    visual_notifications BOOLEAN DEFAULT TRUE,
    haptic_feedback BOOLEAN DEFAULT FALSE,

    -- Presets
    active_preset VARCHAR(50) DEFAULT 'custom',
    custom_presets JSONB DEFAULT '{}',

    -- Metadata
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_across_devices BOOLEAN DEFAULT TRUE,

    CONSTRAINT unique_user_accessibility UNIQUE (user_id)
);

-- ============================================================================
-- ACCESSIBILITY PRESETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS accessibility_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    disability_type VARCHAR(100),
    is_system_preset BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),

    settings JSONB NOT NULL,

    usage_count INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2) DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TEACHER SPECIALIZATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_specializations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES teacher_profiles(id) ON DELETE CASCADE,

    specializations TEXT[] DEFAULT '{}',
    disability_experience TEXT[] DEFAULT '{}',

    certifications JSONB DEFAULT '[]',
    training_completed JSONB DEFAULT '[]',
    years_special_education INTEGER DEFAULT 0,

    teaching_methods TEXT[] DEFAULT '{}',
    accommodation_strategies JSONB DEFAULT '{}',
    assistive_tech_proficiency TEXT[] DEFAULT '{}',

    sign_language_proficiency VARCHAR(50),
    braille_proficiency VARCHAR(50),
    aac_experience BOOLEAN DEFAULT FALSE,

    accepts_iep_students BOOLEAN DEFAULT TRUE,
    max_special_needs_students INTEGER DEFAULT 5,

    inclusion_rating DECIMAL(3,2) DEFAULT 0,
    inclusion_reviews_count INTEGER DEFAULT 0,

    verified_specialist BOOLEAN DEFAULT FALSE,
    verification_date TIMESTAMP,
    verified_by VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_teacher_specialization UNIQUE (teacher_id)
);

-- ============================================================================
-- TEACHER ACCESSIBILITY TRAINING
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_accessibility_training (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES teacher_profiles(id) ON DELETE CASCADE,

    training_name VARCHAR(255) NOT NULL,
    training_provider VARCHAR(255),
    training_type VARCHAR(100),
    disability_focus TEXT[] DEFAULT '{}',

    completed_date TIMESTAMP,
    expiry_date TIMESTAMP,
    certificate_url TEXT,
    hours_completed INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- COURSE ACCESSIBILITY INFO
-- ============================================================================

CREATE TABLE IF NOT EXISTS course_accessibility_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

    has_captions BOOLEAN DEFAULT FALSE,
    has_transcripts BOOLEAN DEFAULT FALSE,
    has_audio_description BOOLEAN DEFAULT FALSE,
    has_sign_language BOOLEAN DEFAULT FALSE,
    has_simplified_version BOOLEAN DEFAULT FALSE,
    has_visual_version BOOLEAN DEFAULT FALSE,

    reading_level VARCHAR(50),
    available_formats TEXT[] DEFAULT '{}',

    suitable_for TEXT[] DEFAULT '{}',
    not_recommended_for TEXT[] DEFAULT '{}',

    allows_extended_time BOOLEAN DEFAULT TRUE,
    flexible_deadlines BOOLEAN DEFAULT FALSE,
    self_paced BOOLEAN DEFAULT FALSE,

    break_friendly BOOLEAN DEFAULT TRUE,
    cognitive_load_level VARCHAR(20) DEFAULT 'medium',
    requires_fine_motor BOOLEAN DEFAULT FALSE,
    requires_audio BOOLEAN DEFAULT FALSE,
    requires_video BOOLEAN DEFAULT FALSE,

    accommodation_notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_course_accessibility UNIQUE (course_id)
);

-- ============================================================================
-- STUDENT COURSE ACCOMMODATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_course_accommodations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES teacher_profiles(id),

    extended_time_percentage INTEGER DEFAULT 0,
    flexible_deadlines BOOLEAN DEFAULT FALSE,
    alternative_assignments BOOLEAN DEFAULT FALSE,
    note_taking_assistance BOOLEAN DEFAULT FALSE,
    recording_allowed BOOLEAN DEFAULT TRUE,

    simplified_content BOOLEAN DEFAULT FALSE,
    audio_version BOOLEAN DEFAULT FALSE,
    large_print BOOLEAN DEFAULT FALSE,

    oral_exams_allowed BOOLEAN DEFAULT FALSE,
    calculator_allowed BOOLEAN DEFAULT TRUE,
    formula_sheet_allowed BOOLEAN DEFAULT FALSE,
    breaks_during_exams BOOLEAN DEFAULT TRUE,
    separate_testing_room BOOLEAN DEFAULT FALSE,

    custom_accommodations JSONB DEFAULT '{}',

    status VARCHAR(50) DEFAULT 'pending',
    approved_by UUID,
    approved_at TIMESTAMP,
    expires_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_student_course_accommodation UNIQUE (student_id, course_id)
);

-- ============================================================================
-- GUARDIAN LINKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS guardian_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guardian_id UUID REFERENCES users(id),

    guardian_email VARCHAR(255) NOT NULL,
    guardian_name VARCHAR(255),
    guardian_phone VARCHAR(50),
    relationship VARCHAR(50),

    can_view_progress BOOLEAN DEFAULT TRUE,
    can_view_grades BOOLEAN DEFAULT TRUE,
    can_view_accessibility BOOLEAN DEFAULT TRUE,
    can_communicate_teachers BOOLEAN DEFAULT TRUE,
    can_modify_accessibility BOOLEAN DEFAULT FALSE,
    receives_reports BOOLEAN DEFAULT TRUE,
    report_frequency VARCHAR(20) DEFAULT 'weekly',

    is_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(100),
    verified_at TIMESTAMP,

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ACCESSIBILITY PROGRESS REPORTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS accessibility_progress_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guardian_link_id UUID REFERENCES guardian_links(id),

    report_period_start TIMESTAMP NOT NULL,
    report_period_end TIMESTAMP NOT NULL,

    courses_active INTEGER DEFAULT 0,
    courses_completed INTEGER DEFAULT 0,
    average_progress DECIMAL(5,2) DEFAULT 0,
    study_hours DECIMAL(6,2) DEFAULT 0,

    accessibility_features_used JSONB DEFAULT '{}',
    accommodations_utilized JSONB DEFAULT '{}',

    session_count INTEGER DEFAULT 0,
    average_session_duration DECIMAL(6,2) DEFAULT 0,
    break_compliance DECIMAL(5,2) DEFAULT 0,

    teacher_notes JSONB DEFAULT '[]',

    report_content JSONB,
    report_url TEXT,

    sent_at TIMESTAMP,
    viewed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ACCESSIBILITY USAGE LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS accessibility_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    feature_name VARCHAR(100) NOT NULL,
    feature_category VARCHAR(50),

    action VARCHAR(50),
    old_value TEXT,
    new_value TEXT,

    context_page VARCHAR(255),
    session_id VARCHAR(100),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_disability_profiles_user ON student_disability_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_disability_profiles_has_disability ON student_disability_profiles(has_disability);
CREATE INDEX IF NOT EXISTS idx_accessibility_prefs_user ON accessibility_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_accessibility_presets_type ON accessibility_presets(disability_type);
CREATE INDEX IF NOT EXISTS idx_accessibility_presets_system ON accessibility_presets(is_system_preset);
CREATE INDEX IF NOT EXISTS idx_teacher_specializations_teacher ON teacher_specializations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_training_teacher ON teacher_accessibility_training(teacher_id);
CREATE INDEX IF NOT EXISTS idx_course_accessibility_course ON course_accessibility_info(course_id);
CREATE INDEX IF NOT EXISTS idx_student_accommodations_student ON student_course_accommodations(student_id);
CREATE INDEX IF NOT EXISTS idx_student_accommodations_course ON student_course_accommodations(course_id);
CREATE INDEX IF NOT EXISTS idx_guardian_links_student ON guardian_links(student_id);
CREATE INDEX IF NOT EXISTS idx_guardian_links_guardian ON guardian_links(guardian_id);
CREATE INDEX IF NOT EXISTS idx_progress_reports_student ON accessibility_progress_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON accessibility_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_feature ON accessibility_usage_logs(feature_name);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON accessibility_usage_logs(created_at);

-- ============================================================================
-- INSERT DEFAULT ACCESSIBILITY PRESETS
-- ============================================================================

INSERT INTO accessibility_presets (name, description, disability_type, is_system_preset, settings) VALUES
-- Dyslexia Preset
('Dyslexia Friendly', 'Optimized settings for users with dyslexia', 'dyslexia', TRUE, '{
    "font_family": "opendyslexic",
    "font_size": 110,
    "letter_spacing": 0.12,
    "word_spacing": 0.16,
    "line_height": 1.8,
    "background_color": "#fef6e4",
    "text_color": "#172c66",
    "reading_guide": true,
    "reading_ruler": true,
    "chunked_content": true,
    "spell_check_enhanced": true
}'),

-- ADHD Preset
('ADHD Focus Mode', 'Minimized distractions for users with ADHD', 'adhd', TRUE, '{
    "simplified_ui": true,
    "focus_mode": true,
    "reduced_motion": true,
    "disable_animations": true,
    "disable_auto_play": true,
    "break_reminders": true,
    "break_interval_minutes": 20,
    "progress_indicators": true,
    "chunked_content": true,
    "quiet_mode": true
}'),

-- Visual Impairment - Low Vision
('Low Vision', 'High visibility settings for low vision users', 'visual_impairment_low_vision', TRUE, '{
    "font_family": "atkinson_hyperlegible",
    "font_size": 150,
    "font_weight": "bold",
    "high_contrast": true,
    "contrast_level": 150,
    "large_click_targets": true,
    "screen_reader_optimized": true,
    "text_to_speech": true,
    "audio_descriptions": true
}'),

-- Visual Impairment - Blind
('Screen Reader Optimized', 'Full screen reader optimization for blind users', 'visual_impairment_blind', TRUE, '{
    "screen_reader_optimized": true,
    "text_to_speech": true,
    "audio_descriptions": true,
    "keyboard_navigation": true,
    "disable_animations": true,
    "reduced_motion": true,
    "simplified_ui": true
}'),

-- Hearing Impairment
('Hearing Accessible', 'Visual alternatives for hearing impaired users', 'hearing_impairment', TRUE, '{
    "auto_captions": true,
    "sign_language_videos": true,
    "visual_notifications": true,
    "notification_sounds": false,
    "haptic_feedback": true
}'),

-- Color Blindness - Protanopia
('Protanopia Filter', 'Color adjustments for red-blind users', 'color_vision_protanopia', TRUE, '{
    "color_blind_mode": "protanopia",
    "color_blind_strength": 100,
    "high_contrast": true
}'),

-- Color Blindness - Deuteranopia
('Deuteranopia Filter', 'Color adjustments for green-blind users', 'color_vision_deuteranopia', TRUE, '{
    "color_blind_mode": "deuteranopia",
    "color_blind_strength": 100,
    "high_contrast": true
}'),

-- Color Blindness - Tritanopia
('Tritanopia Filter', 'Color adjustments for blue-blind users', 'color_vision_tritanopia', TRUE, '{
    "color_blind_mode": "tritanopia",
    "color_blind_strength": 100,
    "high_contrast": true
}'),

-- Dyscalculia
('Math Support', 'Enhanced math tools for dyscalculia', 'dyscalculia', TRUE, '{
    "math_visualization": true,
    "calculator_always_visible": true,
    "number_line_helper": true,
    "step_by_step_math": true,
    "visual_learning_mode": true,
    "chunked_content": true
}'),

-- Dysgraphia
('Writing Support', 'Writing assistance for dysgraphia', 'dysgraphia', TRUE, '{
    "spell_check_enhanced": true,
    "grammar_suggestions": true,
    "word_prediction": true,
    "speech_to_text": true,
    "extended_time_default": true
}'),

-- Motor/Physical Disability
('Motor Accessible', 'Large targets and keyboard navigation for motor disabilities', 'physical_disability', TRUE, '{
    "large_click_targets": true,
    "keyboard_navigation": true,
    "switch_access": true,
    "touch_accommodations": true,
    "sticky_navigation": true,
    "extended_time_default": true
}'),

-- ASD (Autism Spectrum Disorder)
('Autism Friendly', 'Predictable, calm interface for ASD users', 'asd', TRUE, '{
    "simplified_ui": true,
    "reduced_motion": true,
    "disable_animations": true,
    "disable_auto_play": true,
    "quiet_mode": false,
    "step_by_step_mode": true,
    "progress_indicators": true,
    "breadcrumbs_enabled": true,
    "visual_learning_mode": true
}')

ON CONFLICT DO NOTHING;

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_accessibility_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_disability_profile_timestamp ON student_disability_profiles;
CREATE TRIGGER update_disability_profile_timestamp
    BEFORE UPDATE ON student_disability_profiles
    FOR EACH ROW EXECUTE FUNCTION update_accessibility_timestamp();

DROP TRIGGER IF EXISTS update_accessibility_prefs_timestamp ON accessibility_preferences;
CREATE TRIGGER update_accessibility_prefs_timestamp
    BEFORE UPDATE ON accessibility_preferences
    FOR EACH ROW EXECUTE FUNCTION update_accessibility_timestamp();

DROP TRIGGER IF EXISTS update_teacher_specialization_timestamp ON teacher_specializations;
CREATE TRIGGER update_teacher_specialization_timestamp
    BEFORE UPDATE ON teacher_specializations
    FOR EACH ROW EXECUTE FUNCTION update_accessibility_timestamp();

DROP TRIGGER IF EXISTS update_course_accessibility_timestamp ON course_accessibility_info;
CREATE TRIGGER update_course_accessibility_timestamp
    BEFORE UPDATE ON course_accessibility_info
    FOR EACH ROW EXECUTE FUNCTION update_accessibility_timestamp();

DROP TRIGGER IF EXISTS update_student_accommodation_timestamp ON student_course_accommodations;
CREATE TRIGGER update_student_accommodation_timestamp
    BEFORE UPDATE ON student_course_accommodations
    FOR EACH ROW EXECUTE FUNCTION update_accessibility_timestamp();

DROP TRIGGER IF EXISTS update_guardian_link_timestamp ON guardian_links;
CREATE TRIGGER update_guardian_link_timestamp
    BEFORE UPDATE ON guardian_links
    FOR EACH ROW EXECUTE FUNCTION update_accessibility_timestamp();

-- Function to automatically create accessibility preferences when disability profile is created
CREATE OR REPLACE FUNCTION create_default_accessibility_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO accessibility_preferences (user_id, disability_profile_id)
    VALUES (NEW.user_id, NEW.id)
    ON CONFLICT (user_id) DO UPDATE
    SET disability_profile_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_create_accessibility_prefs ON student_disability_profiles;
CREATE TRIGGER auto_create_accessibility_prefs
    AFTER INSERT ON student_disability_profiles
    FOR EACH ROW EXECUTE FUNCTION create_default_accessibility_preferences();
