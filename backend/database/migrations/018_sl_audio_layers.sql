-- ============================================================================
-- 018_sl_audio_layers.sql
-- Phase G4 — Sign language + audio-description tracks on content.
--
-- `course_content` already has `content_url` for the primary asset and
-- a `has_sign_language` boolean flag. The flag alone can't drive
-- playback — we need the actual URL. Adds two new URL columns:
--
--   - sign_language_video_url: a second video file with a sign-language
--     interpreter, rendered as a picture-in-picture overlay by the
--     accessible VideoPlayer (Phase I1).
--   - audio_description_url: a parallel audio track with descriptive
--     narration for visually-impaired learners; the player swaps the
--     main audio for this track when the AD toggle is on.
--
-- Both URLs are nullable. The existing `has_sign_language` /
-- `has_audio_description` boolean flags stay in place as the "is this
-- available" answer for filter queries — derived from the URL columns
-- in the application layer so a flag without a URL doesn't slip past
-- (validated on save in the backend handler).
--
-- Idempotent. Re-running is a no-op.
-- ============================================================================

ALTER TABLE course_content
    ADD COLUMN IF NOT EXISTS sign_language_video_url text;

ALTER TABLE course_content
    ADD COLUMN IF NOT EXISTS audio_description_url text;

COMMENT ON COLUMN course_content.sign_language_video_url IS
    'URL of an interpreter video, rendered as PIP by the accessible player.';
COMMENT ON COLUMN course_content.audio_description_url IS
    'URL of a parallel descriptive-narration track for visually-impaired learners.';
