-- ================================================================
-- Migración 28 — Eventos de dominio (auditoría append-only)
-- ================================================================
SET search_path TO attendance, public;

BEGIN;

CREATE TABLE IF NOT EXISTS domain_events (
    id              BIGSERIAL PRIMARY KEY,
    institution_id  INTEGER     NOT NULL,
    event_type      VARCHAR(64) NOT NULL,
    entity_type     VARCHAR(64) NOT NULL,
    entity_id       INTEGER     NOT NULL,
    actor_user_id   INTEGER     NULL,
    payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_events_institution_time
    ON domain_events (institution_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_entity
    ON domain_events (entity_type, entity_id, occurred_at DESC);

-- La auditoría es append-only: nada puede reescribir ni borrar una fila ya
-- registrada. La única excepción es un DELETE explícito dentro de una
-- transacción con app.domain_events_purge = 'on' (purga de pruebas o de un
-- job de retención futuro). UPDATE y TRUNCATE siempre se rechazan.
CREATE OR REPLACE FUNCTION domain_events_append_only() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' AND current_setting('app.domain_events_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'domain_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_domain_events_append_only ON domain_events;
CREATE TRIGGER trg_domain_events_append_only
    BEFORE UPDATE OR DELETE ON domain_events
    FOR EACH ROW EXECUTE FUNCTION domain_events_append_only();

DROP TRIGGER IF EXISTS trg_domain_events_no_truncate ON domain_events;
CREATE TRIGGER trg_domain_events_no_truncate
    BEFORE TRUNCATE ON domain_events
    FOR EACH STATEMENT EXECUTE FUNCTION domain_events_append_only();

INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
SELECT id, 'audit-events', TRUE, FALSE, FALSE, FALSE
FROM roles
WHERE name IN ('admin', 'rector', 'superadmin')
ON CONFLICT (role_id, resource) DO NOTHING;

COMMIT;
