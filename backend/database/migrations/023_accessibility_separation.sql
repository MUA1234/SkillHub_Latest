-- ============================================================================
-- 023_accessibility_separation.sql
-- Strong logical separation for differently-abled students (Visual / Hearing
-- tracks) within the SINGLE shared Supabase database.
--
-- Design decision (chosen over a physically separate DB): keep one database so
-- shared auth, payments and sponsorship stay intact, and separate the
-- differently-abled experience LOGICALLY —
--   • track columns (added in 021) decide a student's dashboard + the wall;
--   • the teacher<->student "data wall" is enforced in the application layer
--     (services/track_matching.py), because the FastAPI service talks to
--     Supabase with the service-role key, which BYPASSES RLS. RLS is therefore
--     defence-in-depth only; the authoritative wall is in Python.
--
-- This migration:
--   1. Re-asserts the accessibility media columns on course_content (safe on
--      databases created before 006/018). Media is stored either as a plain
--      URL or as the `r2://<object-key>` convention, presigned at read time.
--   2. Adds partial indexes so the track content libraries (audio-described /
--      captioned / signed) filter quickly.
--   3. Adds `accessibility_specialist_bookings` — a differently-abled student
--      booking a verified specialist for their track (the "matching + booking"
--      feature), kept in its own accessibility-domain table.
--
-- Idempotent — safe to run more than once.
-- ============================================================================

-- --- 1. accessibility media columns on content ------------------------------
ALTER TABLE course_content
    ADD COLUMN IF NOT EXISTS caption_url text,
    ADD COLUMN IF NOT EXISTS transcript_url text,
    ADD COLUMN IF NOT EXISTS audio_description_url text,
    ADD COLUMN IF NOT EXISTS sign_language_video_url text,
    ADD COLUMN IF NOT EXISTS audio_url text;

COMMENT ON COLUMN course_content.audio_url IS
    'Audio-first track: a stand-alone audio rendition of the lesson (URL or r2://key). Powers the Visual track''s Audio Library.';

-- --- 2. partial indexes for the track libraries -----------------------------
-- Visual track surfaces content with an audio rendition or audio description.
CREATE INDEX IF NOT EXISTS idx_course_content_audio
    ON course_content (course_id)
    WHERE audio_url IS NOT NULL OR audio_description_url IS NOT NULL;

-- Hearing track surfaces content with captions, a transcript, or signing.
CREATE INDEX IF NOT EXISTS idx_course_content_captioned
    ON course_content (course_id)
    WHERE caption_url IS NOT NULL
       OR transcript_url IS NOT NULL
       OR sign_language_video_url IS NOT NULL;

-- --- 3. specialist bookings --------------------------------------------------
CREATE TABLE IF NOT EXISTS accessibility_specialist_bookings (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teacher_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track         text NOT NULL CHECK (track IN ('visual', 'hearing')),
    session_id    uuid,          -- optional link to a live_sessions row once scheduled
    status        text NOT NULL DEFAULT 'requested'
                    CHECK (status IN ('requested', 'accepted', 'declined', 'cancelled', 'completed')),
    message       text,
    requested_at  timestamptz NOT NULL DEFAULT now(),
    responded_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE accessibility_specialist_bookings IS
    'A differently-abled student booking a verified specialist for their track. The teacher<->student track overlap is validated in the application layer before insert.';

CREATE INDEX IF NOT EXISTS idx_asb_student ON accessibility_specialist_bookings (student_id, status);
CREATE INDEX IF NOT EXISTS idx_asb_teacher ON accessibility_specialist_bookings (teacher_id, status);

-- No unique constraint on (student_id, teacher_id): a student may re-book the
-- same specialist across terms. The app prevents duplicate *open* requests.

-- --- 4. RLS (defence-in-depth; the Python wall remains authoritative) --------
ALTER TABLE accessibility_specialist_bookings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'accessibility_specialist_bookings'
          AND policyname = 'asb_student_rw'
    ) THEN
        CREATE POLICY asb_student_rw ON accessibility_specialist_bookings
            FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'accessibility_specialist_bookings'
          AND policyname = 'asb_teacher_r'
    ) THEN
        CREATE POLICY asb_teacher_r ON accessibility_specialist_bookings
            FOR SELECT USING (teacher_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'accessibility_specialist_bookings'
          AND policyname = 'asb_teacher_respond'
    ) THEN
        CREATE POLICY asb_teacher_respond ON accessibility_specialist_bookings
            FOR UPDATE USING (teacher_id = auth.uid());
    END IF;
END $$;
