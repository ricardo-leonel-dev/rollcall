-- ================================================================
-- Migración 33 — Permiso propio para reincorporar y visibilidad por defecto
-- ================================================================
SET search_path TO attendance, public;

BEGIN;

-- Reincorporar pasa de "update" a "delete". Quien hoy puede reincorporar
-- (can_update) conserva ese derecho.
UPDATE role_permissions
   SET can_delete = TRUE
 WHERE resource = 'student-withdrawals' AND can_update AND NOT can_delete;

-- Los retiros nuevos ocultan todo el año lectivo por defecto. Las filas
-- existentes conservan su valor.
ALTER TABLE student_withdrawals ALTER COLUMN stats_visibility SET DEFAULT 'whole_year';

COMMIT;
