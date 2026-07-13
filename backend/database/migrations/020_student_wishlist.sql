-- ============================================================================
-- 020_student_wishlist.sql
-- Student wishlist — per-student set of saved courses.
--
-- Backs GET/POST/DELETE /students/wishlist (and the frontend
-- `getStudentWishlist()` client method, which previously 404'd because no
-- route or table existed). One row per (student, course); the unique
-- constraint makes POST idempotent at the DB level too.
--
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_wishlist (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_student_wishlist UNIQUE (student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_student_wishlist_student
    ON student_wishlist (student_id, created_at DESC);

COMMENT ON TABLE student_wishlist IS
    'Courses a student has saved for later. One row per (student, course).';
