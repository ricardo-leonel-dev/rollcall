-- ================================================================
-- Migración 32 — Renombrar courses.paralelo a courses.section
-- ================================================================
-- La sección del curso (texto libre, agregada en la migración 16) pasa
-- a tener un identificador en inglés. La restricción única que la usa
-- se renombra igual. Ambos renombres están protegidos, así que el
-- archivo se puede aplicar más de una vez.
SET search_path TO attendance, public;

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'courses'
       AND column_name = 'paralelo'
  ) THEN
    ALTER TABLE courses RENAME COLUMN paralelo TO section;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'courses'
       AND t.relnamespace = current_schema()::regnamespace
       AND c.conname = 'uq_courses_institution_fullname_paralelo_shift'
  ) THEN
    ALTER TABLE courses RENAME CONSTRAINT uq_courses_institution_fullname_paralelo_shift
      TO uq_courses_institution_fullname_section_shift;
  END IF;
END $$;

COMMIT;
