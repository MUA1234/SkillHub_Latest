-- ============================================================================
-- 016_forum_extras.sql
-- Phase K1 — Forum: image attachments + accessibility tags.
--
-- `forum_posts` already has `tags ARRAY` (general-purpose) and the
-- `has_image boolean` flag. We add:
--   - `image_url`: the actual asset URL (the boolean alone isn't enough
--     to render the image, and a JOIN to a separate attachments table
--     is overkill for a single image per post).
--   - `accessibility_tags text[]`: a *separate* tag column so deaf
--     students can filter for `sign_language_friendly` threads without
--     polluting the topical `tags` namespace.
--
-- Idempotent.
-- ============================================================================

ALTER TABLE forum_posts
    ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE forum_posts
    ADD COLUMN IF NOT EXISTS accessibility_tags text[] DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS idx_forum_posts_accessibility_tags
    ON forum_posts USING GIN (accessibility_tags);

COMMENT ON COLUMN forum_posts.image_url IS
    'URL of an attached image, served from Supabase storage. NULL = no image.';
COMMENT ON COLUMN forum_posts.accessibility_tags IS
    'Independent tag namespace for accessibility traits — e.g. '
    'sign_language_friendly, screen_reader_friendly, plain_language.';
