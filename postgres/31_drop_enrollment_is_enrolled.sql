-- ================================================================
-- Migración 31 — Eliminar la columna enrollments.is_enrolled
-- ================================================================
SET search_path TO attendance, public;

BEGIN;

-- La bandera SI/NO del Excel quedó sin uso: "no matriculado" nunca se
-- convirtió en retiro y hoy el retiro se registra en student_withdrawals.
-- La vista del roster se recrea sin la columna para no dejar referencias.
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

-- La columna se descarta: sus valores no significan un retiro y no se
-- convierten en ninguno.
ALTER TABLE enrollments DROP COLUMN IF EXISTS is_enrolled;

COMMIT;
