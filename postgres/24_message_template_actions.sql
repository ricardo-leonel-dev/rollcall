-- ================================================================
-- Migración 24 — Catálogo configurable de acciones notificables
-- Feature: message_template_catalog (#18)
-- Replaces the hardcoded NOTIFICATION_ACTION_KEYS whitelist in
-- src/services/user.service.ts with a DB-backed catalog so the
-- backend is the single source of truth for which actions exist,
-- what their labels/placeholders/defaults are, and whether they are
-- currently active. Seeds 'absences' and 'citations' with the
-- verbatim frontend defaults, then adds the FK
-- user_message_templates.action_key -> message_template_actions.action_key.
-- ================================================================

SET search_path TO attendance, public;

CREATE TABLE IF NOT EXISTS message_template_actions (
    action_key        VARCHAR(50) PRIMARY KEY,
    label             VARCHAR(100) NOT NULL,
    description       TEXT,
    placeholders      JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_template  TEXT NOT NULL,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    active            BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO message_template_actions
    (action_key, label, description, placeholders, default_template, sort_order, active)
VALUES
    ('absences',
     'Faltas y atrasos',
     'Mensaje de WhatsApp al representante cuando el estudiante registra una falta o un atraso.',
     '[{"key":"nombre","label":"Nombre del estudiante"},
       {"key":"fecha","label":"Fecha"},
       {"key":"tipo","label":"Tipo (falta o atraso)"},
       {"key":"curso","label":"Curso"}]'::jsonb,
     'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.',
     10, TRUE),
    ('citations',
     'Citaciones',
     'Mensaje de WhatsApp al representante para notificar una citación.',
     '[{"key":"nombre","label":"Nombre del estudiante"},
       {"key":"fecha","label":"Fecha y hora de la citación"}]'::jsonb,
     'Estimado apoderado, se ha registrado una citación para {{nombre}} el {{fecha}}. Por favor confirmar asistencia.',
     20, TRUE)
ON CONFLICT (action_key) DO NOTHING;

ALTER TABLE user_message_templates
    DROP CONSTRAINT IF EXISTS fk_user_message_templates_action;
ALTER TABLE user_message_templates
    ADD CONSTRAINT fk_user_message_templates_action
    FOREIGN KEY (action_key) REFERENCES message_template_actions(action_key);