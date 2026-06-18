-- ================================================================
-- School Attendance System — Migration 05: Per-user course scope
-- Runs AFTER 04_user_avatar.sql (alphabetical order guaranteed)
-- ================================================================

CREATE SCHEMA IF NOT EXISTS attendance;
SET search_path TO attendance;

-- A user with zero rows here sees every course in their institution
-- (e.g. rector, admin, "inspector general"). A user with one or more rows
-- is scoped to only those courses (e.g. teacher, "inspector de bloque").
-- The role itself (role_permissions) still controls what actions are
-- allowed — this table only controls which rows are visible.
CREATE TABLE IF NOT EXISTS user_courses (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    course_id   INTEGER NOT NULL REFERENCES courses(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_user_courses_user ON user_courses(user_id);
