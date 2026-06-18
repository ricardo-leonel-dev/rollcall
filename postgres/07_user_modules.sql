-- ================================================================
-- School Attendance System — Migration 07: Per-user module access
-- Runs AFTER 06_institution_branding.sql (alphabetical order guaranteed)
-- ================================================================

CREATE SCHEMA IF NOT EXISTS attendance;
SET search_path TO attendance;

-- A user with zero rows here can navigate to every module/page in the
-- sidebar (today's behavior, unchanged). A user with one or more rows is
-- restricted to only those — enforced both in the sidebar/launcher and via
-- a frontend route guard (not a data-authorization mechanism: it only
-- gates which pages can be opened, role_permissions/institution/course
-- scope still control which rows can be read or written).
-- module_key is a fixed whitelist validated in code, not a DB-driven
-- resource: dashboard, absences, calendar, justifications, students,
-- enrollments, admin.
CREATE TABLE IF NOT EXISTS user_modules (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    module_key  VARCHAR(50) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_user_modules_user ON user_modules(user_id);
