-- ============================================================================
-- LANGUAGE PREFERENCE SYSTEM
-- Adds comprehensive language preference support across the platform
-- ============================================================================

-- Add language preference to user_settings table
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en',
ADD COLUMN IF NOT EXISTS language_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add language preferences to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en',
ADD COLUMN IF NOT EXISTS secondary_languages TEXT[] DEFAULT '{}';

-- Create index for fast language lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_language 
ON user_settings(user_id, preferred_language);

CREATE INDEX IF NOT EXISTS idx_user_profiles_language 
ON user_profiles(user_id, preferred_language);

-- Create language_preferences table for detailed settings
CREATE TABLE IF NOT EXISTS language_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
    fallback_language VARCHAR(10) DEFAULT 'en',
    date_format VARCHAR(20) DEFAULT 'MM/DD/YYYY',
    time_format VARCHAR(10) DEFAULT '12h',
    timezone VARCHAR(50) DEFAULT 'UTC',
    currency VARCHAR(10) DEFAULT 'USD',
    number_format VARCHAR(20) DEFAULT 'en-US',
    auto_translate BOOLEAN DEFAULT FALSE,
    show_original_content BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create index for language preferences
CREATE INDEX IF NOT EXISTS idx_language_prefs_user ON language_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_language_prefs_lang ON language_preferences(preferred_language);

-- Create function to automatically create language preferences for new users
CREATE OR REPLACE FUNCTION create_default_language_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO language_preferences (user_id, preferred_language)
    VALUES (NEW.id, COALESCE(NEW.preferred_language, 'en'))
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-create language preferences
DROP TRIGGER IF EXISTS trigger_create_language_preferences ON users;
CREATE TRIGGER trigger_create_language_preferences
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_default_language_preferences();

-- Create function to update user_settings when language_preferences changes
CREATE OR REPLACE FUNCTION sync_language_to_settings()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_settings
    SET preferred_language = NEW.preferred_language,
        language_updated_at = NOW()
    WHERE user_id = NEW.user_id;
    
    UPDATE user_profiles
    SET preferred_language = NEW.preferred_language
    WHERE user_id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync language changes
DROP TRIGGER IF EXISTS trigger_sync_language_preferences ON language_preferences;
CREATE TRIGGER trigger_sync_language_preferences
    AFTER INSERT OR UPDATE OF preferred_language ON language_preferences
    FOR EACH ROW
    EXECUTE FUNCTION sync_language_to_settings();

-- Create function to get user's language preference
CREATE OR REPLACE FUNCTION get_user_language(p_user_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_language VARCHAR(10);
BEGIN
    SELECT preferred_language INTO v_language
    FROM language_preferences
    WHERE user_id = p_user_id;
    
    RETURN COALESCE(v_language, 'en');
END;
$$ LANGUAGE plpgsql;

-- Create supported languages reference table
CREATE TABLE IF NOT EXISTS supported_languages (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    native_name VARCHAR(100) NOT NULL,
    direction VARCHAR(3) DEFAULT 'ltr', -- ltr or rtl
    is_active BOOLEAN DEFAULT TRUE,
    is_beta BOOLEAN DEFAULT FALSE,
    flag_emoji VARCHAR(10),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert supported languages
INSERT INTO supported_languages (code, name, native_name, direction, flag_emoji, sort_order) VALUES
('en', 'English', 'English', 'ltr', '🇺🇸', 1),
('es', 'Spanish', 'Español', 'ltr', '🇪🇸', 2),
('fr', 'French', 'Français', 'ltr', '🇫🇷', 3),
('de', 'German', 'Deutsch', 'ltr', '🇩🇪', 4),
('zh', 'Chinese', '中文', 'ltr', '🇨🇳', 5),
('ja', 'Japanese', '日本語', 'ltr', '🇯🇵', 6),
('ko', 'Korean', '한국어', 'ltr', '🇰🇷', 7),
('ar', 'Arabic', 'العربية', 'rtl', '🇸🇦', 8),
('hi', 'Hindi', 'हिन्दी', 'ltr', '🇮🇳', 9),
('pt', 'Portuguese', 'Português', 'ltr', '🇵🇹', 10),
('ru', 'Russian', 'Русский', 'ltr', '🇷🇺', 11),
('it', 'Italian', 'Italiano', 'ltr', '🇮🇹', 12)
ON CONFLICT (code) DO NOTHING;

-- Create function to get available languages
CREATE OR REPLACE FUNCTION get_supported_languages()
RETURNS TABLE (
    code VARCHAR,
    name VARCHAR,
    native_name VARCHAR,
    direction VARCHAR,
    flag_emoji VARCHAR,
    is_beta BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sl.code,
        sl.name,
        sl.native_name,
        sl.direction,
        sl.flag_emoji,
        sl.is_beta
    FROM supported_languages sl
    WHERE sl.is_active = true
    ORDER BY sl.sort_order;
END;
$$ LANGUAGE plpgsql;

-- Update accessibility_preferences to include language
ALTER TABLE accessibility_preferences
ADD COLUMN IF NOT EXISTS content_language VARCHAR(10) DEFAULT 'en',
ADD COLUMN IF NOT EXISTS caption_language VARCHAR(10) DEFAULT 'en';

-- Row Level Security for language_preferences
ALTER TABLE language_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view and update their own language preferences
CREATE POLICY "Users manage own language prefs" ON language_preferences
    FOR ALL USING (auth.uid() = user_id);

-- Update timestamp trigger for language_preferences
CREATE OR REPLACE FUNCTION update_language_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_language_prefs_timestamp ON language_preferences;
CREATE TRIGGER trigger_update_language_prefs_timestamp
    BEFORE UPDATE ON language_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_language_preferences_timestamp();

-- Create view for user language settings (combines all language-related data)
CREATE OR REPLACE VIEW user_language_settings AS
SELECT 
    u.id as user_id,
    u.email,
    COALESCE(lp.preferred_language, up.preferred_language, us.preferred_language, 'en') as preferred_language,
    lp.fallback_language,
    lp.date_format,
    lp.time_format,
    lp.timezone,
    lp.currency,
    lp.auto_translate,
    up.secondary_languages,
    sl.name as language_name,
    sl.native_name as language_native_name,
    sl.direction as text_direction,
    sl.flag_emoji
FROM users u
LEFT JOIN language_preferences lp ON lp.user_id = u.id
LEFT JOIN user_profiles up ON up.user_id = u.id
LEFT JOIN user_settings us ON us.user_id = u.id
LEFT JOIN supported_languages sl ON sl.code = COALESCE(lp.preferred_language, up.preferred_language, us.preferred_language, 'en');

-- Add comments for documentation
COMMENT ON TABLE language_preferences IS 'Stores user language and localization preferences';
COMMENT ON TABLE supported_languages IS 'List of languages supported by the platform';
COMMENT ON COLUMN language_preferences.preferred_language IS 'Primary language for UI and content';
COMMENT ON COLUMN language_preferences.fallback_language IS 'Fallback language if content not available in preferred language';
COMMENT ON COLUMN language_preferences.auto_translate IS 'Automatically translate content to preferred language';
COMMENT ON FUNCTION get_user_language IS 'Returns the preferred language for a given user';
COMMENT ON VIEW user_language_settings IS 'Consolidated view of all user language settings';

-- Migration complete message
DO $$
BEGIN
    RAISE NOTICE 'Language preferences system installed successfully!';
    RAISE NOTICE 'Supported languages: 12 (English, Spanish, French, German, Chinese, Japanese, Korean, Arabic, Hindi, Portuguese, Russian, Italian)';
END $$;
