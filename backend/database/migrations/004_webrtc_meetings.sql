-- ============================================================================
-- WEBRTC LIVE MEETINGS INFRASTRUCTURE
-- Real-time video/audio communication for Student-Teacher and Teacher-Sponsor
-- ============================================================================

-- Enum for meeting types
DO $$ BEGIN
    CREATE TYPE meeting_type AS ENUM (
        'one_on_one_tutoring',
        'group_class',
        'teacher_sponsor_meeting',
        'parent_teacher_conference',
        'assessment',
        'consultation'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum for meeting status
DO $$ BEGIN
    CREATE TYPE meeting_status AS ENUM (
        'scheduled',
        'starting',
        'live',
        'ended',
        'cancelled',
        'no_show'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum for participant role
DO $$ BEGIN
    CREATE TYPE participant_role AS ENUM ('host', 'co_host', 'participant', 'observer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- TABLE: live_meeting_rooms
-- WebRTC meeting rooms with metadata and settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS live_meeting_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Meeting metadata
    title TEXT NOT NULL,
    description TEXT,
    meeting_type meeting_type NOT NULL,

    -- Host (teacher or sponsor)
    host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Scheduling
    scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
    scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,

    -- Status
    status meeting_status DEFAULT 'scheduled',

    -- WebRTC room identifier
    room_id TEXT UNIQUE NOT NULL, -- Used for WebRTC signaling channel

    -- Meeting settings
    max_participants INTEGER DEFAULT 50,
    current_participant_count INTEGER DEFAULT 0,

    -- Features enabled
    video_enabled BOOLEAN DEFAULT TRUE,
    audio_enabled BOOLEAN DEFAULT TRUE,
    screen_share_enabled BOOLEAN DEFAULT TRUE,
    chat_enabled BOOLEAN DEFAULT TRUE,
    recording_enabled BOOLEAN DEFAULT FALSE,
    captions_enabled BOOLEAN DEFAULT FALSE,

    -- Recording data
    recording_started_at TIMESTAMP WITH TIME ZONE,
    recording_url TEXT,
    recording_size_bytes BIGINT,

    -- Accessibility settings (inherited from student profiles)
    accessibility_mode_enabled BOOLEAN DEFAULT FALSE,
    low_distraction_mode BOOLEAN DEFAULT FALSE,
    high_contrast_mode BOOLEAN DEFAULT FALSE,
    large_controls BOOLEAN DEFAULT FALSE,

    -- Related entities
    course_id UUID, -- Optional: if part of a course
    session_id UUID, -- Optional: if part of a scheduled session

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TABLE: meeting_participants
-- Tracks users in a meeting with permissions and accessibility preferences
-- ============================================================================
CREATE TABLE IF NOT EXISTS meeting_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES live_meeting_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Participant role and permissions
    role participant_role DEFAULT 'participant',

    -- Join/leave tracking
    joined_at TIMESTAMP WITH TIME ZONE,
    left_at TIMESTAMP WITH TIME ZONE,
    is_currently_in_meeting BOOLEAN DEFAULT FALSE,

    -- Media state
    video_enabled BOOLEAN DEFAULT TRUE,
    audio_enabled BOOLEAN DEFAULT TRUE,
    is_screen_sharing BOOLEAN DEFAULT FALSE,

    -- Connection quality
    connection_quality TEXT, -- 'excellent', 'good', 'poor', 'disconnected'
    last_seen TIMESTAMP WITH TIME ZONE,

    -- Accessibility preferences for this participant
    needs_captions BOOLEAN DEFAULT FALSE,
    prefers_large_video BOOLEAN DEFAULT FALSE,
    prefers_low_distraction BOOLEAN DEFAULT FALSE,
    keyboard_only_mode BOOLEAN DEFAULT FALSE,

    -- Attendance tracking
    total_time_minutes INTEGER DEFAULT 0,
    attended BOOLEAN DEFAULT FALSE,

    -- Participation metrics
    spoke_count INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_meeting_participant UNIQUE(meeting_id, user_id)
);

-- ============================================================================
-- TABLE: webrtc_signaling_messages
-- Stores WebRTC signaling messages (offer, answer, ICE candidates)
-- Used with Supabase Realtime for WebRTC negotiation
-- ============================================================================
CREATE TABLE IF NOT EXISTS webrtc_signaling_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES live_meeting_rooms(id) ON DELETE CASCADE,

    -- Signaling details
    from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    to_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL for broadcast

    -- Message type
    message_type TEXT NOT NULL, -- 'offer', 'answer', 'ice-candidate', 'join', 'leave', 'state-change'

    -- Payload (JSON)
    payload JSONB NOT NULL,

    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,

    -- TTL (auto-delete old messages)
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour'),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick signaling lookups
CREATE INDEX IF NOT EXISTS idx_webrtc_signaling_meeting ON webrtc_signaling_messages(meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webrtc_signaling_to_user ON webrtc_signaling_messages(to_user_id, processed);
CREATE INDEX IF NOT EXISTS idx_webrtc_signaling_expires ON webrtc_signaling_messages(expires_at);

-- ============================================================================
-- TABLE: meeting_chat_messages
-- Text chat messages during meetings (fallback communication)
-- ============================================================================
CREATE TABLE IF NOT EXISTS meeting_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES live_meeting_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Message content
    message TEXT NOT NULL,
    message_type TEXT DEFAULT 'text', -- 'text', 'system', 'announcement'

    -- Metadata
    is_private BOOLEAN DEFAULT FALSE,
    recipient_id UUID REFERENCES auth.users(id), -- For private messages

    -- Reactions
    reactions JSONB DEFAULT '[]'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_chat_meeting ON meeting_chat_messages(meeting_id, created_at);

-- ============================================================================
-- TABLE: meeting_captions
-- Live captions/transcripts for accessibility
-- ============================================================================
CREATE TABLE IF NOT EXISTS meeting_captions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES live_meeting_rooms(id) ON DELETE CASCADE,

    -- Speaker
    speaker_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    speaker_name TEXT,

    -- Caption text
    text TEXT NOT NULL,

    -- Timing
    timestamp_offset_seconds DECIMAL(10,3) NOT NULL, -- Offset from meeting start
    duration_seconds DECIMAL(10,3),

    -- Confidence (from speech recognition)
    confidence DECIMAL(3,2), -- 0.00 to 1.00

    -- Language
    language TEXT DEFAULT 'en',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_captions_meeting ON meeting_captions(meeting_id, timestamp_offset_seconds);

-- ============================================================================
-- TABLE: meeting_recordings
-- Metadata for recorded meetings
-- ============================================================================
CREATE TABLE IF NOT EXISTS meeting_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES live_meeting_rooms(id) ON DELETE CASCADE,

    -- Recording file
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    duration_seconds INTEGER,

    -- Format
    format TEXT DEFAULT 'mp4', -- 'mp4', 'webm', 'audio-only'

    -- Processing status
    processing_status TEXT DEFAULT 'processing', -- 'processing', 'ready', 'failed'
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,

    -- Accessibility
    has_captions BOOLEAN DEFAULT FALSE,
    captions_file_path TEXT,

    -- Access control
    is_public BOOLEAN DEFAULT FALSE,
    password_protected BOOLEAN DEFAULT FALSE,

    -- Expiry
    expires_at TIMESTAMP WITH TIME ZONE,

    -- Views tracking
    view_count INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TABLE: meeting_analytics
-- Analytics data for meeting performance and engagement
-- ============================================================================
CREATE TABLE IF NOT EXISTS meeting_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES live_meeting_rooms(id) ON DELETE CASCADE,

    -- Overall metrics
    total_participants INTEGER DEFAULT 0,
    average_attendance_minutes DECIMAL(10,2),
    peak_concurrent_users INTEGER DEFAULT 0,

    -- Engagement
    total_messages INTEGER DEFAULT 0,
    total_reactions INTEGER DEFAULT 0,
    screen_shares_count INTEGER DEFAULT 0,

    -- Technical quality
    average_connection_quality DECIMAL(3,2), -- 0-5 scale
    disconnect_count INTEGER DEFAULT 0,

    -- Accessibility usage
    captions_used_count INTEGER DEFAULT 0,
    keyboard_navigation_users INTEGER DEFAULT 0,

    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_meetings_host ON live_meeting_rooms(host_id, scheduled_start DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON live_meeting_rooms(status, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_meetings_room_id ON live_meeting_rooms(room_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled ON live_meeting_rooms(scheduled_start, scheduled_end);

CREATE INDEX IF NOT EXISTS idx_participants_meeting ON meeting_participants(meeting_id, joined_at);
CREATE INDEX IF NOT EXISTS idx_participants_user ON meeting_participants(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_participants_currently_in ON meeting_participants(meeting_id, is_currently_in_meeting);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE live_meeting_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE webrtc_signaling_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_captions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_analytics ENABLE ROW LEVEL SECURITY;

-- Meeting hosts can manage their meetings
CREATE POLICY "Hosts can manage meetings" ON live_meeting_rooms
    FOR ALL USING (auth.uid() = host_id);

-- Participants can view meetings they're invited to
CREATE POLICY "Participants can view meetings" ON live_meeting_rooms
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM meeting_participants
            WHERE meeting_participants.meeting_id = live_meeting_rooms.id
            AND meeting_participants.user_id = auth.uid()
        )
    );

-- Participants can view and manage their own participation
CREATE POLICY "Users manage own participation" ON meeting_participants
    FOR ALL USING (auth.uid() = user_id);

-- Meeting participants can view other participants
CREATE POLICY "Participants see other participants" ON meeting_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM meeting_participants mp
            WHERE mp.meeting_id = meeting_participants.meeting_id
            AND mp.user_id = auth.uid()
        )
    );

-- WebRTC signaling: participants can send/receive in their meetings
CREATE POLICY "Participants can send signaling" ON webrtc_signaling_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM meeting_participants
            WHERE meeting_participants.meeting_id = webrtc_signaling_messages.meeting_id
            AND meeting_participants.user_id = auth.uid()
        )
    );

CREATE POLICY "Participants can receive signaling" ON webrtc_signaling_messages
    FOR SELECT USING (
        to_user_id IS NULL OR to_user_id = auth.uid() OR from_user_id = auth.uid()
    );

-- Chat messages
CREATE POLICY "Participants can send chat" ON meeting_chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM meeting_participants
            WHERE meeting_participants.meeting_id = meeting_chat_messages.meeting_id
            AND meeting_participants.user_id = auth.uid()
        )
    );

CREATE POLICY "Participants can read chat" ON meeting_chat_messages
    FOR SELECT USING (
        NOT is_private OR recipient_id = auth.uid() OR user_id = auth.uid()
    );

-- Captions: readable by all meeting participants
CREATE POLICY "Participants can read captions" ON meeting_captions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM meeting_participants
            WHERE meeting_participants.meeting_id = meeting_captions.meeting_id
            AND meeting_participants.user_id = auth.uid()
        )
    );

-- Recordings: accessible to host and participants
CREATE POLICY "Participants can view recordings" ON meeting_recordings
    FOR SELECT USING (
        is_public OR
        EXISTS (
            SELECT 1 FROM live_meeting_rooms lmr
            JOIN meeting_participants mp ON mp.meeting_id = lmr.id
            WHERE lmr.id = meeting_recordings.meeting_id
            AND (lmr.host_id = auth.uid() OR mp.user_id = auth.uid())
        )
    );

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update participant count when participants join/leave
CREATE OR REPLACE FUNCTION update_meeting_participant_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.is_currently_in_meeting AND NOT OLD.is_currently_in_meeting) THEN
        UPDATE live_meeting_rooms
        SET current_participant_count = current_participant_count + 1
        WHERE id = NEW.meeting_id;
    ELSIF TG_OP = 'UPDATE' AND NOT NEW.is_currently_in_meeting AND OLD.is_currently_in_meeting THEN
        UPDATE live_meeting_rooms
        SET current_participant_count = GREATEST(current_participant_count - 1, 0)
        WHERE id = NEW.meeting_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE live_meeting_rooms
        SET current_participant_count = GREATEST(current_participant_count - 1, 0)
        WHERE id = OLD.meeting_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_participant_count_trigger
    AFTER INSERT OR UPDATE OR DELETE ON meeting_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_meeting_participant_count();

-- Auto-delete expired signaling messages
CREATE OR REPLACE FUNCTION delete_expired_signaling_messages()
RETURNS void AS $$
BEGIN
    DELETE FROM webrtc_signaling_messages WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (run this periodically via cron or pg_cron)
-- SELECT delete_expired_signaling_messages();

-- Update timestamps
CREATE TRIGGER update_live_meeting_rooms_updated_at
    BEFORE UPDATE ON live_meeting_rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_participants_updated_at
    BEFORE UPDATE ON meeting_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_recordings_updated_at
    BEFORE UPDATE ON meeting_recordings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- REALTIME SUBSCRIPTIONS (Enable Supabase Realtime)
-- ============================================================================

-- Enable realtime for signaling
ALTER PUBLICATION supabase_realtime ADD TABLE webrtc_signaling_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_captions;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE live_meeting_rooms IS 'WebRTC meeting rooms with settings and metadata';
COMMENT ON TABLE meeting_participants IS 'Participants in meetings with accessibility preferences';
COMMENT ON TABLE webrtc_signaling_messages IS 'WebRTC signaling for peer connections';
COMMENT ON TABLE meeting_chat_messages IS 'Text chat during meetings';
COMMENT ON TABLE meeting_captions IS 'Live captions and transcripts';
COMMENT ON TABLE meeting_recordings IS 'Recorded meeting files';
COMMENT ON TABLE meeting_analytics IS 'Meeting analytics and metrics';

COMMENT ON COLUMN live_meeting_rooms.room_id IS 'Unique identifier for WebRTC signaling channel';
COMMENT ON COLUMN meeting_participants.needs_captions IS 'Auto-enabled for hearing-impaired students';
COMMENT ON COLUMN meeting_participants.keyboard_only_mode IS 'Auto-enabled for motor-impaired students';
