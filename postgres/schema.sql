-- ================================================================
-- School Attendance System
-- Unidad Educativa Particular "Tia Blanquita"
-- v2.0 — Full structure with per-academic-year history
-- ================================================================

CREATE SCHEMA IF NOT EXISTS attendance;
SET search_path TO attendance;

-- ─── AÑOS LECTIVOS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_years (
    id          SERIAL PRIMARY KEY,
    name      VARCHAR(20) NOT NULL UNIQUE,  -- '2026-2027'
    start_date DATE,
    end_date    DATE,
    is_active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CURSOS ───────────────────────────────────────────────────────
-- Un curso existe independiente del año lectivo (8vo A, 9no B, etc.)
-- La asignación de teacher se hace por año lectivo en course_academic_years
CREATE TABLE IF NOT EXISTS courses (
    id          SERIAL PRIMARY KEY,
    name      VARCHAR(150) NOT NULL UNIQUE, -- 'OCTAVO "A" BASICA SUPERIOR'
    shift     VARCHAR(50) DEFAULT 'MATUTINA',
    is_active      BOOLEAN DEFAULT TRUE,
    deleted_at  TIMESTAMPTZ,                  -- soft delete
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ASIGNACIÓN CURSO-AÑO LECTIVO ────────────────────────────────
-- Permite que el teacher cambie cada año lectivo
CREATE TABLE IF NOT EXISTS course_academic_years (
    id              SERIAL PRIMARY KEY,
    course_id        INTEGER REFERENCES courses(id),
    academic_year_id INTEGER REFERENCES academic_years(id),
    teacher         VARCHAR(200),
    is_active          BOOLEAN DEFAULT TRUE,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(course_id, academic_year_id)
);

-- ─── REPRESENTANTES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guardians (
    id              SERIAL PRIMARY KEY,
    name          VARCHAR(200) NOT NULL,
    id_number          VARCHAR(20),
    phone        VARCHAR(20),
    whatsapp_link   VARCHAR(300), -- enlace directo wa.me/NUMERO
    email           VARCHAR(150),
    is_active          BOOLEAN DEFAULT TRUE,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ESTUDIANTES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
    id              SERIAL PRIMARY KEY,
    id_number          VARCHAR(20),
    name          VARCHAR(200) NOT NULL,
    gender            CHAR(1),
    birth_date DATE,
    is_active          BOOLEAN DEFAULT TRUE,
    deleted_at      TIMESTAMPTZ,              -- soft delete
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MATRÍCULA ────────────────────────────────────────────────────
-- Relaciona estudiante + curso + año lectivo
-- Permite historial completo: en 2026-2027 estaba en 9no A,
-- en 2027-2028 pasó a 10mo A con otro representante
CREATE TABLE IF NOT EXISTS enrollments (
    id                  SERIAL PRIMARY KEY,
    student_id       INTEGER REFERENCES students(id),
    course_id            INTEGER REFERENCES courses(id),
    academic_year_id     INTEGER REFERENCES academic_years(id),
    guardian_id    INTEGER REFERENCES guardians(id),
    roster_number       INTEGER,              -- número en la lista del curso ese año
    is_enrolled         BOOLEAN DEFAULT TRUE, -- SI/NO del Excel
    student_phone VARCHAR(20),
    student_email    VARCHAR(150),
    is_active              BOOLEAN DEFAULT TRUE,
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, course_id, academic_year_id)
);

-- ─── ASISTENCIA ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS absences (
    id              SERIAL PRIMARY KEY,
    enrollment_id    INTEGER REFERENCES enrollments(id), -- vincula al año lectivo correcto
    date           DATE NOT NULL,
    type            VARCHAR(5) NOT NULL CHECK (type IN ('F', 'AT')),
    -- F=falta (ausente), AT=atraso. "Justificado" no es un type: se deriva
    -- de la existencia de una fila en justification_absences.
    notes     TEXT,
    photo_source     VARCHAR(300),
    is_active          BOOLEAN DEFAULT TRUE,
    deleted_at      TIMESTAMPTZ,             -- soft delete
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(enrollment_id, date)
);

-- ─── FOTOS PROCESADAS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photo_logs (
    id                          SERIAL PRIMARY KEY,
    filename                    VARCHAR(300),
    list_date                 DATE,
    course_id                    INTEGER REFERENCES courses(id),
    academic_year_id             INTEGER REFERENCES academic_years(id),
    records_created           INTEGER DEFAULT 0,
    records_not_found    TEXT[],
    created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ÍNDICES ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_absences_date         ON absences(date);
CREATE INDEX IF NOT EXISTS idx_absences_enrollment     ON absences(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student    ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course         ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_academic_year          ON enrollments(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_students_name       ON students(name);
CREATE INDEX IF NOT EXISTS idx_guardians_name    ON guardians(name);

-- ─── VISTA ÚTIL: listado con edad calculada ────────────────────────
CREATE OR REPLACE VIEW v_enrollments_detail AS
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
JOIN students e ON e.id = m.student_id
JOIN courses c ON c.id = m.course_id
JOIN academic_years al ON al.id = m.academic_year_id
LEFT JOIN guardians r ON r.id = m.guardian_id
LEFT JOIN course_academic_years ca ON ca.course_id = m.course_id AND ca.academic_year_id = m.academic_year_id
WHERE m.deleted_at IS NULL
  AND e.deleted_at IS NULL
  AND c.deleted_at IS NULL;

-- ─── VISTA: absences con detalle ────────────────────────────────
CREATE OR REPLACE VIEW v_absences_detail AS
SELECT
    a.id AS absences_id,
    al.name AS anio_lectivo,
    c.name AS curso,
    e.name AS estudiante,
    m.roster_number,
    a.date,
    a.type,
    a.notes,
    a.photo_source,
    a.created_at
FROM absences a
JOIN enrollments m ON m.id = a.enrollment_id
JOIN students e ON e.id = m.student_id
JOIN courses c ON c.id = m.course_id
JOIN academic_years al ON al.id = m.academic_year_id
WHERE a.deleted_at IS NULL
  AND m.deleted_at IS NULL;
