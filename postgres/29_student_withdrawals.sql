-- ================================================================
-- Migración 29 — Retiros de matrícula
-- ================================================================
SET search_path TO attendance, public;

BEGIN;

CREATE TABLE IF NOT EXISTS student_withdrawals (
    id                   SERIAL PRIMARY KEY,
    institution_id       INTEGER      NOT NULL REFERENCES institutions(id),
    enrollment_id        INTEGER      NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
    reason_id            INTEGER      NOT NULL REFERENCES withdrawal_reasons(id) ON DELETE RESTRICT,
    withdrawal_date      DATE         NOT NULL,
    notes                VARCHAR(1000),
    withdrawn_by_user_id INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    reverted_at          TIMESTAMPTZ,
    reverted_by_user_id  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_student_withdrawals_revert
        CHECK (reverted_at IS NOT NULL OR reverted_by_user_id IS NULL)
);

-- Solo una retirada vigente por matrícula. El índice parcial convierte el
-- filtro "esta matrícula está retirada" en una búsqueda directa, y evita
-- dos retiradas simultáneas para la misma matrícula.
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_withdrawals_active_enrollment
    ON student_withdrawals (enrollment_id) WHERE reverted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_withdrawals_institution_date
    ON student_withdrawals (institution_id, withdrawal_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_student_withdrawals_reason
    ON student_withdrawals (reason_id);

-- Leer sigue a students:read; retirar y reponer siguen a students:delete.
-- Ningún rol borra retiros: las filas nunca se eliminan.
INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
SELECT role_id, 'student-withdrawals', can_read, can_delete, can_delete, FALSE
FROM role_permissions
WHERE resource = 'students' AND can_read
ON CONFLICT (role_id, resource) DO NOTHING;

COMMIT;
