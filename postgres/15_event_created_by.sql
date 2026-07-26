-- Migration 15: track who created each attendance-relevant record
-- (absence, justification, enrollment) so the student-history timeline
-- can show "quién hizo el registro" and derive the originating area
-- (Inspectoría/Maestro/...) from the creator's role.
-- Nullable: existing rows and any future insert without a clear actor
-- simply render without an author in the timeline.

SET search_path TO attendance, public;

ALTER TABLE absences       ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE justifications ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE enrollments    ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id);
