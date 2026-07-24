-- ============================================================================
-- 022_content_thumbnail.sql
-- Per-content-item thumbnail/preview image. Stored like video content_url:
-- an "r2://<key>" marker resolved to a presigned URL on read. Shown as the
-- clickable preview in the teacher content library; clicking plays the video.
-- Idempotent.
-- ============================================================================
ALTER TABLE course_content ADD COLUMN IF NOT EXISTS thumbnail_url text;
