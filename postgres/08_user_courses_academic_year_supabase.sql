-- ================================================================
-- Migración 08 (variante Supabase) — año lectivo único activo +
-- user_courses por año.
-- Misma lógica que 08_user_courses_academic_year.sql, pero calificada
-- con el schema "attendance" en vez de "public": en Supabase el
-- DB_SCHEMA real es "attendance" (a diferencia del rig local, donde
-- ese schema es inerte y todo vive en "public"). Ver esa nota en el
-- archivo original antes de confundir cuál corre dónde.
-- ================================================================

-- ─── 1. Resolver instituciones con más de un año "activo" hoy ────────
UPDATE attendance.academic_years a
SET is_active = FALSE
WHERE a.is_active = TRUE
  AND a.deleted_at IS NULL
  AND a.id <> (
    SELECT b.id FROM attendance.academic_years b
    WHERE b.institution_id = a.institution_id
      AND b.is_active = TRUE
      AND b.deleted_at IS NULL
    ORDER BY b.name DESC, b.id DESC
    LIMIT 1
  );

-- ─── 2. Forzar un solo año activo por institución, de aquí en más ────
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_year_per_institution
  ON attendance.academic_years(institution_id)
  WHERE is_active AND deleted_at IS NULL;

-- ─── 3. user_courses con año lectivo ──────────────────────────────────
ALTER TABLE attendance.user_courses ADD COLUMN IF NOT EXISTS academic_year_id INTEGER;

UPDATE attendance.user_courses uc
SET academic_year_id = ay.id
FROM attendance.users u
JOIN attendance.academic_years ay
  ON ay.institution_id = u.institution_id
 AND ay.is_active = TRUE
 AND ay.deleted_at IS NULL
WHERE uc.user_id = u.id
  AND uc.academic_year_id IS NULL;

DELETE FROM attendance.user_courses WHERE academic_year_id IS NULL;

ALTER TABLE attendance.user_courses ALTER COLUMN academic_year_id SET NOT NULL;

ALTER TABLE attendance.user_courses
  ADD CONSTRAINT fk_user_courses_academic_year
  FOREIGN KEY (academic_year_id) REFERENCES attendance.academic_years(id);

ALTER TABLE attendance.user_courses DROP CONSTRAINT IF EXISTS user_courses_user_id_course_id_key;
ALTER TABLE attendance.user_courses
  ADD CONSTRAINT user_courses_user_course_year_key UNIQUE (user_id, course_id, academic_year_id);

CREATE INDEX IF NOT EXISTS idx_user_courses_academic_year ON attendance.user_courses(academic_year_id);
