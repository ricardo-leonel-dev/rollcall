-- ================================================================
-- School Attendance System — Migration 04: User avatar
-- Runs AFTER 03_multi_tenant.sql (alphabetical order guaranteed)
-- ================================================================

CREATE SCHEMA IF NOT EXISTS attendance;
SET search_path TO attendance;

-- 'preset:<id>' for a built-in avatar, or '/api/uploads/avatars/<file>' for
-- an uploaded photo. NULL means "show initials" (current default look).
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
