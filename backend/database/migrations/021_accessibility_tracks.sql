-- ============================================================================
-- 021_accessibility_tracks.sql
-- Accessibility "tracks" — the coarse grouping (visual / hearing) that drives
-- dashboard routing and the teacher↔student data wall.
--
-- A track is derived from disability types by prefix:
--   visual  ← 'visual_impairment%'  OR 'color_vision%'
--   hearing ← 'hearing_impairment%'
-- Both the coarse (assessment) and granular (profile) vocabularies match,
-- since both share these prefixes.
--
-- Adds:
--   student_disability_profiles.primary_track  (decides landing dashboard)
--   student_disability_profiles.tracks[]       (all tracks the student is in)
--   teacher_specializations.teaching_tracks[]  (tracks a specialist teaches)
-- + GIN indexes for `&&` overlap queries, + a one-time backfill.
--
-- Idempotent.
-- ============================================================================

-- --- schema -----------------------------------------------------------------
ALTER TABLE student_disability_profiles
    ADD COLUMN IF NOT EXISTS primary_track text;

ALTER TABLE student_disability_profiles
    ADD COLUMN IF NOT EXISTS tracks text[] DEFAULT '{}';

ALTER TABLE teacher_specializations
    ADD COLUMN IF NOT EXISTS teaching_tracks text[] DEFAULT '{}';

-- --- indexes (array overlap) ------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sdp_tracks
    ON student_disability_profiles USING gin (tracks);

CREATE INDEX IF NOT EXISTS idx_sdp_primary_track
    ON student_disability_profiles (primary_track);

CREATE INDEX IF NOT EXISTS idx_tspec_teaching_tracks
    ON teacher_specializations USING gin (teaching_tracks);

-- --- backfill: student tracks[] ---------------------------------------------
UPDATE student_disability_profiles p
SET tracks = COALESCE((
    SELECT array_agg(DISTINCT tr ORDER BY tr)
    FROM (
        SELECT CASE
            WHEN dt LIKE 'visual_impairment%' OR dt LIKE 'color_vision%' THEN 'visual'
            WHEN dt LIKE 'hearing_impairment%' THEN 'hearing'
        END AS tr
        FROM unnest(p.disability_types) AS dt
    ) s
    WHERE s.tr IS NOT NULL
), '{}')
WHERE p.disability_types IS NOT NULL;

-- --- backfill: student primary_track ----------------------------------------
UPDATE student_disability_profiles
SET primary_track = CASE
    WHEN primary_disability LIKE 'visual_impairment%'
      OR primary_disability LIKE 'color_vision%'        THEN 'visual'
    WHEN primary_disability LIKE 'hearing_impairment%'  THEN 'hearing'
    ELSE tracks[1]   -- first matching track, or NULL when the student has none
END
WHERE primary_track IS NULL;

-- --- backfill: teacher teaching_tracks[] ------------------------------------
-- Union two sources:
--   1. disability_experience[] on teacher_specializations
--   2. teacher_disability_specializations (one disability_type per row)
-- NOTE: teacher_specializations.teacher_id → teacher_profiles(id), while
-- teacher_disability_specializations.teacher_id → users(id), so we hop through
-- teacher_profiles to line the two up.
UPDATE teacher_specializations ts
SET teaching_tracks = COALESCE((
    SELECT array_agg(DISTINCT tr ORDER BY tr)
    FROM (
        SELECT CASE
            WHEN val LIKE 'visual_impairment%' OR val LIKE 'color_vision%' THEN 'visual'
            WHEN val LIKE 'hearing_impairment%' THEN 'hearing'
        END AS tr
        FROM (
            SELECT unnest(ts.disability_experience) AS val
            UNION ALL
            SELECT tds.disability_type::text AS val
            FROM teacher_disability_specializations tds
            JOIN teacher_profiles tp ON tp.user_id = tds.teacher_id
            WHERE tp.id = ts.teacher_id
        ) vals
    ) s
    WHERE s.tr IS NOT NULL
), '{}')
WHERE (ts.teaching_tracks IS NULL OR ts.teaching_tracks = '{}');
