-- ================================================================
-- School Attendance System — Migration 02: Auth + Justifications
-- Runs AFTER 01_init.sql (alphabetical order guaranteed)
-- ================================================================

CREATE SCHEMA IF NOT EXISTS attendance;
SET search_path TO attendance;

-- ─── MISSING COLUMNS IN EXISTING TABLES ──────────────────────────
ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE course_academic_years
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE guardians
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE photo_logs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- ─── ROLES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ROLE PERMISSIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  id          SERIAL PRIMARY KEY,
  role_id     INTEGER NOT NULL REFERENCES roles(id),
  resource    VARCHAR(100) NOT NULL,
  can_read    BOOLEAN DEFAULT FALSE,
  can_create  BOOLEAN DEFAULT FALSE,
  can_update  BOOLEAN DEFAULT FALSE,
  can_delete  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, resource)
);

-- ─── USERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(200),
  email         VARCHAR(150),
  role_id       INTEGER REFERENCES roles(id),
  is_active     BOOLEAN DEFAULT TRUE,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  notification_template TEXT
);

-- ─── JUSTIFICATIONS ───────────────────────────────────────────────
-- One justification can cover multiple absences of the same student
CREATE TABLE IF NOT EXISTS justifications (
  id            SERIAL PRIMARY KEY,
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id),
  reason        TEXT NOT NULL,
  notified_by   VARCHAR(200),
  is_active     BOOLEAN DEFAULT TRUE,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PIVOT: JUSTIFICATION ↔ ABSENCE ──────────────────────────────
-- The 'type' field in absences NEVER changes to 'J'.
-- An absence is considered justified if it appears here.
CREATE TABLE IF NOT EXISTS justification_absences (
  id                SERIAL PRIMARY KEY,
  justification_id  INTEGER NOT NULL REFERENCES justifications(id),
  absence_id        INTEGER NOT NULL REFERENCES absences(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(justification_id, absence_id)
);

-- ─── ADDITIONAL INDEXES ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_justifications_enrollment ON justifications(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_justification_absences_absence ON justification_absences(absence_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

-- ─── INITIAL DATA: ROLES ─────────────────────────────────────────
INSERT INTO roles (name, description) VALUES
  ('admin',     'Full access, manages users and roles'),
  ('rector',    'Everything inspector can do + soft delete anything'),
  ('inspector', 'CRUD students, years, guardians, absences, justifications, enrollments'),
  ('teacher',   'Create/update students and absences, no delete'),
  ('readonly',  'Read-only access to listings and dashboards')
ON CONFLICT (name) DO NOTHING;

-- ─── ROLE PERMISSIONS ─────────────────────────────────────────────
DO $$
DECLARE
  v_admin_id     INTEGER;
  v_rector_id    INTEGER;
  v_inspector_id INTEGER;
  v_teacher_id   INTEGER;
  v_readonly_id  INTEGER;
  v_resource     TEXT;
  v_resources    TEXT[] := ARRAY[
    'students','absences','justifications','guardians',
    'enrollments','courses','academic_years','users',
    'roles','dashboard','import','export'
  ];
BEGIN
  SELECT id INTO v_admin_id     FROM roles WHERE name = 'admin';
  SELECT id INTO v_rector_id    FROM roles WHERE name = 'rector';
  SELECT id INTO v_inspector_id FROM roles WHERE name = 'inspector';
  SELECT id INTO v_teacher_id   FROM roles WHERE name = 'teacher';
  SELECT id INTO v_readonly_id  FROM roles WHERE name = 'readonly';

  FOREACH v_resource IN ARRAY v_resources LOOP
    -- admin: all
    INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
    VALUES (v_admin_id, v_resource, TRUE, TRUE, TRUE, TRUE)
    ON CONFLICT (role_id, resource) DO NOTHING;

    -- rector: all
    INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
    VALUES (v_rector_id, v_resource, TRUE, TRUE, TRUE, TRUE)
    ON CONFLICT (role_id, resource) DO NOTHING;

    -- inspector: CRUD on most, no user/role management
    INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
    VALUES (
      v_inspector_id, v_resource,
      TRUE,
      v_resource NOT IN ('users','roles'),
      v_resource NOT IN ('users','roles'),
      v_resource NOT IN ('users','roles','courses','academic_years')
    )
    ON CONFLICT (role_id, resource) DO NOTHING;

    -- teacher: create/update students and absences only
    INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
    VALUES (
      v_teacher_id, v_resource,
      TRUE,
      v_resource IN ('students','absences'),
      v_resource IN ('students','absences'),
      FALSE
    )
    ON CONFLICT (role_id, resource) DO NOTHING;

    -- readonly: read only
    INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
    VALUES (v_readonly_id, v_resource, TRUE, FALSE, FALSE, FALSE)
    ON CONFLICT (role_id, resource) DO NOTHING;
  END LOOP;
END $$;

-- ─── VIEW: absences with justification status ─────────────────────
-- DROP+CREATE instead of CREATE OR REPLACE: schema.sql's version of this
-- view uses "absences_id", this one renames it to "absence_id" — Postgres
-- refuses to REPLACE a view while renaming an output column.
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

-- ─── VIEW: enrollments with calculated age ────────────────────────
-- DROP+CREATE for the same reason as v_absences_detail above — safe even
-- when the column set happens to match today, avoids this breaking again
-- if either view's columns ever diverge.
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
  r.id_number         AS guardian_id_number
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

-- ─── INITIAL ADMIN USER ───────────────────────────────────────────
-- The backend creates the admin user on first boot if missing.
-- Default credentials: admin / Admin2026!
-- See backend/src/seed.ts
