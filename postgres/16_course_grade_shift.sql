-- Adds structured grade fields to courses: a spelled-out full name and a
-- free-text paralelo, and turns shift into a real controlled value.
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS paralelo VARCHAR(10);

-- Replaces the (institution_id, name) uniqueness with one that also considers
-- shift, so the same abbreviated name can exist in two different shifts
-- (e.g. "10MO F BS" in the morning and another "10MO F BS" in the afternoon).
ALTER TABLE courses DROP CONSTRAINT IF EXISTS uq_courses_institution_name;
ALTER TABLE courses ADD CONSTRAINT uq_courses_institution_name_shift
  UNIQUE (institution_id, name, shift);

-- Additional uniqueness on the new structured fields, for once they're filled in.
-- (NULLs don't collide in a UNIQUE constraint, so this doesn't protect
-- existing courses until full_name/paralelo are set — the constraint above
-- covers that transition.)
ALTER TABLE courses ADD CONSTRAINT uq_courses_institution_fullname_paralelo_shift
  UNIQUE (institution_id, full_name, paralelo, shift);

-- Jornada becomes a controlled value (existing data is already 'MATUTINA').
ALTER TABLE courses ADD CONSTRAINT chk_courses_shift
  CHECK (shift IN ('MATUTINA', 'VESPERTINA', 'NOCTURNA'));
