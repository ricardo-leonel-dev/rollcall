-- ================================================================
-- School Attendance System — Migration 06: Institution branding
-- Runs AFTER 05_course_scope.sql (alphabetical order guaranteed)
-- ================================================================

CREATE SCHEMA IF NOT EXISTS attendance;
SET search_path TO attendance;

-- logo_url: '/api/uploads/logos/<file>' for an uploaded image, NULL for
-- the generic favicon/no-logo placeholder. primary_color/secondary_color:
-- '#RRGGBB' hex, NULL falls back to the app's default indigo/purple theme.
ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7),
  ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
