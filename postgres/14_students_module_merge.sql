-- ================================================================
-- School Attendance System — Migration 14: merge students/enrollments module keys
-- Runs AFTER 13_reports_permission.sql (alphabetical order guaranteed)
--
-- The sidebar's "Estudiantes" section is collapsing its two subnav items
-- (Listado → module key 'students', Matrículas → module key 'enrollments')
-- into a single "Administración de estudiantes" page gated by 'students'
-- alone. Users who only had 'enrollments' (or the already-unused
-- 'students:enrollments'/'students:list' children) granted must be
-- backfilled with 'students' so they don't silently lose access.
-- ================================================================

SET search_path TO attendance, public;

-- 1) Backfill: grant 'students' to any user who has 'enrollments' or
--    'students:enrollments' but not already 'students'.
INSERT INTO user_modules (user_id, module_key)
SELECT DISTINCT um.user_id, 'students'
FROM user_modules um
WHERE um.module_key IN ('enrollments', 'students:enrollments')
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um2
    WHERE um2.user_id = um.user_id AND um2.module_key = 'students'
  )
ON CONFLICT (user_id, module_key) DO NOTHING;

-- 2) Cleanup: remove the now-obsolete module keys. Safe because no route
--    references these keys anymore after this migration ships alongside
--    the frontend/backend code changes.
DELETE FROM user_modules
WHERE module_key IN ('enrollments', 'students:list', 'students:enrollments');
