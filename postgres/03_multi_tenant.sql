-- ================================================================
-- School Attendance System — Migration 03: Multi-tenancy
-- Runs AFTER 02_auth_schema.sql (alphabetical order guaranteed)
-- ================================================================

CREATE SCHEMA IF NOT EXISTS attendance;
SET search_path TO attendance;

-- ─── INSTITUTIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS institutions (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL UNIQUE,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── institution_id COLUMNS ──────────────────────────────────────
-- NOT NULL (after backfill below) on every institution-owned table.
ALTER TABLE academic_years        ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE courses               ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE guardians             ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE students              ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE course_academic_years ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE enrollments           ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE absences              ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE justifications        ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE photo_logs            ADD COLUMN IF NOT EXISTS institution_id INTEGER;

-- NULLABLE: NULL means "platform superadmin", not bound to any institution.
ALTER TABLE users                 ADD COLUMN IF NOT EXISTS institution_id INTEGER;

-- ─── BACKFILL + ROLE/PERMISSIONS SEED ────────────────────────────
DO $$
DECLARE
  v_institution_id  INTEGER;
  v_superadmin_id    INTEGER;
  v_resource         TEXT;
  v_resources        TEXT[] := ARRAY[
    'students','absences','justifications','guardians',
    'enrollments','courses','academic_years','users',
    'roles','dashboard','import','export'
  ];
BEGIN
  -- Generic placeholder name on purpose: real institution names are renamed
  -- later through the Instituciones UI, not committed to this script.
  INSERT INTO institutions (name) VALUES ('Institución migrada')
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_institution_id FROM institutions WHERE name = 'Institución migrada';

  UPDATE academic_years        SET institution_id = v_institution_id WHERE institution_id IS NULL;
  UPDATE courses               SET institution_id = v_institution_id WHERE institution_id IS NULL;
  UPDATE guardians             SET institution_id = v_institution_id WHERE institution_id IS NULL;
  UPDATE students              SET institution_id = v_institution_id WHERE institution_id IS NULL;
  UPDATE course_academic_years SET institution_id = v_institution_id WHERE institution_id IS NULL;
  UPDATE enrollments           SET institution_id = v_institution_id WHERE institution_id IS NULL;
  UPDATE absences              SET institution_id = v_institution_id WHERE institution_id IS NULL;
  UPDATE justifications        SET institution_id = v_institution_id WHERE institution_id IS NULL;
  UPDATE photo_logs            SET institution_id = v_institution_id WHERE institution_id IS NULL;
  -- Any user that already exists at migration time predates multi-tenancy
  -- entirely (the seedSuperAdmin() bootstrap only runs later, on the next
  -- backend boot) — so every existing user here is institution-bound, not
  -- a superadmin. On a fresh install this table is still empty (no-op).
  UPDATE users                 SET institution_id = v_institution_id WHERE institution_id IS NULL;

  -- ─── SUPERADMIN ROLE ────────────────────────────────────────────
  INSERT INTO roles (name, description) VALUES
    ('superadmin', 'Platform operator — manages institutions and can view/operate any institution''s data')
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_superadmin_id FROM roles WHERE name = 'superadmin';

  -- Same full-access matrix as 'admin' on every existing resource.
  FOREACH v_resource IN ARRAY v_resources LOOP
    INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
    VALUES (v_superadmin_id, v_resource, TRUE, TRUE, TRUE, TRUE)
    ON CONFLICT (role_id, resource) DO NOTHING;
  END LOOP;

  -- 'institutions' is cross-tenant and deliberately NOT in the loop above
  -- (that loop also runs for 'teacher', which gets blanket read access —
  -- wrong for a resource that lists every institution). Superadmin only.
  INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
  VALUES (v_superadmin_id, 'institutions', TRUE, TRUE, TRUE, TRUE)
  ON CONFLICT (role_id, resource) DO NOTHING;
END $$;

-- ─── NOT NULL + FOREIGN KEYS + INDEXES ───────────────────────────
ALTER TABLE academic_years        ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE courses               ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE guardians             ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE students              ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE course_academic_years ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE enrollments           ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE absences              ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE justifications        ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE photo_logs            ALTER COLUMN institution_id SET NOT NULL;

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS"; guard each one explicitly
-- so this script stays safely re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_academic_years_institution') THEN
    ALTER TABLE academic_years ADD CONSTRAINT fk_academic_years_institution FOREIGN KEY (institution_id) REFERENCES institutions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_courses_institution') THEN
    ALTER TABLE courses ADD CONSTRAINT fk_courses_institution FOREIGN KEY (institution_id) REFERENCES institutions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guardians_institution') THEN
    ALTER TABLE guardians ADD CONSTRAINT fk_guardians_institution FOREIGN KEY (institution_id) REFERENCES institutions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_institution') THEN
    ALTER TABLE students ADD CONSTRAINT fk_students_institution FOREIGN KEY (institution_id) REFERENCES institutions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_course_academic_years_institution') THEN
    ALTER TABLE course_academic_years ADD CONSTRAINT fk_course_academic_years_institution FOREIGN KEY (institution_id) REFERENCES institutions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_enrollments_institution') THEN
    ALTER TABLE enrollments ADD CONSTRAINT fk_enrollments_institution FOREIGN KEY (institution_id) REFERENCES institutions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_absences_institution') THEN
    ALTER TABLE absences ADD CONSTRAINT fk_absences_institution FOREIGN KEY (institution_id) REFERENCES institutions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_justifications_institution') THEN
    ALTER TABLE justifications ADD CONSTRAINT fk_justifications_institution FOREIGN KEY (institution_id) REFERENCES institutions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_photo_logs_institution') THEN
    ALTER TABLE photo_logs ADD CONSTRAINT fk_photo_logs_institution FOREIGN KEY (institution_id) REFERENCES institutions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_institution') THEN
    ALTER TABLE users ADD CONSTRAINT fk_users_institution FOREIGN KEY (institution_id) REFERENCES institutions(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_academic_years_institution        ON academic_years(institution_id);
CREATE INDEX IF NOT EXISTS idx_courses_institution               ON courses(institution_id);
CREATE INDEX IF NOT EXISTS idx_guardians_institution             ON guardians(institution_id);
CREATE INDEX IF NOT EXISTS idx_students_institution              ON students(institution_id);
CREATE INDEX IF NOT EXISTS idx_course_academic_years_institution ON course_academic_years(institution_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_institution           ON enrollments(institution_id);
CREATE INDEX IF NOT EXISTS idx_absences_institution              ON absences(institution_id);
CREATE INDEX IF NOT EXISTS idx_justifications_institution        ON justifications(institution_id);
CREATE INDEX IF NOT EXISTS idx_photo_logs_institution             ON photo_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_users_institution                 ON users(institution_id);

-- ─── COMPOSITE UNIQUES (replace global name uniqueness) ──────────
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
  WHERE rel.relname = 'academic_years'
    AND con.contype = 'u'
    AND array_length(con.conkey, 1) = 1
    AND att.attname = 'name';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE academic_years DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
  WHERE rel.relname = 'courses'
    AND con.contype = 'u'
    AND array_length(con.conkey, 1) = 1
    AND att.attname = 'name';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE courses DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_academic_years_institution_name') THEN
    ALTER TABLE academic_years ADD CONSTRAINT uq_academic_years_institution_name UNIQUE (institution_id, name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_courses_institution_name') THEN
    ALTER TABLE courses ADD CONSTRAINT uq_courses_institution_name UNIQUE (institution_id, name);
  END IF;
END $$;

-- ─── VIEWS: pass through institution_id ──────────────────────────
-- DROP+CREATE instead of CREATE OR REPLACE: some deployments still carry an
-- older column layout (e.g. "absences_id" vs "absence_id"), and Postgres
-- refuses to REPLACE a view while renaming its output columns.
DROP VIEW IF EXISTS v_enrollments_detail;
CREATE VIEW v_enrollments_detail AS
SELECT
  m.id                AS enrollment_id,
  al.id               AS academic_year_id,
  al.name             AS academic_year,
  c.id                AS course_id,
  c.name              AS course,
  ca.teacher,
  e.id                AS student_id,
  m.roster_number,
  e.id_number,
  e.name              AS full_name,
  e.gender,
  e.birth_date,
  DATE_PART('year', AGE(CURRENT_DATE, e.birth_date))::INTEGER AS age,
  m.is_enrolled,
  m.student_phone,
  m.student_email,
  r.id                AS guardian_id,
  r.name              AS guardian_name,
  r.phone             AS guardian_phone,
  r.whatsapp_link,
  r.email             AS guardian_email,
  m.is_active,
  m.deleted_at,
  m.created_at,
  r.id_number         AS guardian_id_number,
  m.institution_id
FROM enrollments m
JOIN students e        ON e.id = m.student_id
JOIN courses c         ON c.id = m.course_id
JOIN academic_years al ON al.id = m.academic_year_id
LEFT JOIN guardians r  ON r.id = m.guardian_id
LEFT JOIN course_academic_years ca ON ca.course_id = m.course_id
                                  AND ca.academic_year_id = m.academic_year_id
WHERE m.deleted_at IS NULL
  AND e.deleted_at IS NULL
  AND c.deleted_at IS NULL;

DROP VIEW IF EXISTS v_absences_detail;
CREATE VIEW v_absences_detail AS
SELECT
  a.id          AS absence_id,
  al.name       AS academic_year,
  c.name        AS course,
  e.name        AS student_name,
  m.roster_number,
  a.date,
  a.type,
  a.notes,
  a.photo_source,
  a.is_active,
  a.deleted_at,
  a.created_at,
  a.institution_id,
  EXISTS (
    SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id
  ) AS is_justified
FROM absences a
JOIN enrollments m    ON m.id = a.enrollment_id
JOIN students e       ON e.id = m.student_id
JOIN courses c        ON c.id = m.course_id
JOIN academic_years al ON al.id = m.academic_year_id
WHERE a.deleted_at IS NULL
  AND m.deleted_at IS NULL;
