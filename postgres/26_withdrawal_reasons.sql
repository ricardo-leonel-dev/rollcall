-- ================================================================
-- Migración 26 — Catálogo de motivos de retiro por institución
-- ================================================================
SET search_path TO attendance, public;

CREATE TABLE IF NOT EXISTS withdrawal_reasons (
    id              SERIAL PRIMARY KEY,
    institution_id  INTEGER NOT NULL REFERENCES institutions(id),
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_reasons_institution
    ON withdrawal_reasons(institution_id);

-- Unique per institution, case-insensitive, only among non-deleted rows:
-- a deleted name can be created again, and "Otro"/"otro" cannot coexist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_withdrawal_reasons_institution_name
    ON withdrawal_reasons(institution_id, lower(name))
    WHERE deleted_at IS NULL;

-- Keep this list identical to DEFAULT_WITHDRAWAL_REASONS in
-- src/services/withdrawal-reason.service.ts (a test compares them).
INSERT INTO withdrawal_reasons (institution_id, name)
SELECT i.id, d.name
FROM institutions i
CROSS JOIN (VALUES
    ('Cambio de domicilio'),
    ('Cambio de institución educativa'),
    ('Situación económica'),
    ('Problemas de salud'),
    ('Viaje o migración'),
    ('Bajo rendimiento académico'),
    ('Motivos disciplinarios'),
    ('Otro')
) AS d(name)
WHERE NOT EXISTS (
    SELECT 1 FROM withdrawal_reasons w
    WHERE w.institution_id = i.id
      AND lower(w.name) = lower(d.name)
);

INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
SELECT id, 'withdrawal-reasons', TRUE, TRUE, TRUE, TRUE
FROM roles
WHERE name IN ('admin', 'rector', 'superadmin')
ON CONFLICT (role_id, resource) DO NOTHING;
