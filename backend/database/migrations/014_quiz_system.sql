-- ============================================================================
-- 014_quiz_system.sql
-- Phase I3 — Quiz / examination authoring + delivery.
--
-- The base `examinations` table from Database.sql is a "scheduled offline
-- exam" model (exam_date, total_marks, passing_marks) — useful as the
-- envelope but missing the question payload + submission shape we need
-- for an in-app online quiz. We extend it instead of creating a parallel
-- `quizzes` table so the existing FKs and any future reporting on
-- examination_results keeps working.
--
-- Changes:
--   1. examinations: add `questions jsonb`, `instructions`, `status`,
--      `is_published`, `accepts_short_answer`, `randomize_questions`,
--      `attempts_allowed`.
--   2. examination_results: add `student_answers jsonb`,
--      `time_taken_seconds`, `submitted_at`, `accommodations_applied jsonb`,
--      `attempt_number`, `started_at`.
--
-- Question payload shape (jsonb array, one object per question):
--   { "id": "q1",
--     "type": "mcq" | "short_answer" | "true_false",
--     "prompt": "What is 2+2?",
--     "marks": 1,
--     "options": ["3","4","5"],          // mcq + true_false only
--     "correct_answer": "4" | ["4","B"], // grading hint (kept hidden from students)
--     "explanation": "Optional rationale"
--   }
--
-- All changes idempotent (`IF NOT EXISTS`). Re-run safe.
-- ============================================================================

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS questions jsonb DEFAULT '[]'::jsonb;

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS instructions text;

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS status varchar(20) DEFAULT 'draft';

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT false;

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS accepts_short_answer boolean DEFAULT false;

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS randomize_questions boolean DEFAULT false;

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS attempts_allowed integer DEFAULT 1;

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS available_from timestamp;

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS available_until timestamp;


-- Submission-side columns: student_answers stores the per-question
-- response, time_taken_seconds is wall-clock, attempt_number lets us
-- support `attempts_allowed > 1` without a second table.
ALTER TABLE examination_results
    ADD COLUMN IF NOT EXISTS student_answers jsonb DEFAULT '{}'::jsonb;

ALTER TABLE examination_results
    ADD COLUMN IF NOT EXISTS time_taken_seconds integer;

ALTER TABLE examination_results
    ADD COLUMN IF NOT EXISTS started_at timestamp;

ALTER TABLE examination_results
    ADD COLUMN IF NOT EXISTS submitted_at timestamp;

ALTER TABLE examination_results
    ADD COLUMN IF NOT EXISTS accommodations_applied jsonb DEFAULT '{}'::jsonb;

ALTER TABLE examination_results
    ADD COLUMN IF NOT EXISTS attempt_number integer DEFAULT 1;

ALTER TABLE examination_results
    ADD COLUMN IF NOT EXISTS status varchar(20) DEFAULT 'in_progress';


-- Indexes for the read-paths the quiz UI uses:
--   - students browsing the list of published exams for a course
--   - the student dashboard looking up a student's prior results
CREATE INDEX IF NOT EXISTS idx_examinations_course_published
    ON examinations (course_id, is_published)
    WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_examination_results_student_exam
    ON examination_results (student_id, exam_id);


COMMENT ON COLUMN examinations.questions IS
    'jsonb array of question objects. See migration 014 header for shape.';
COMMENT ON COLUMN examinations.status IS
    'draft | published | closed — soft state separate from `is_published`.';
COMMENT ON COLUMN examination_results.student_answers IS
    'jsonb map of question_id -> selected_option_or_text.';
COMMENT ON COLUMN examination_results.accommodations_applied IS
    'Snapshot of which student_course_accommodations were honored on this attempt.';
