-- ================================================================
-- Migración 25 — Separar `{{hora}}` de `{{fecha}}` en citaciones
-- Feature: citation_template_separate_hora_placeholder (#19)
-- Splits the citations WhatsApp template's `{{fecha}}` placeholder
-- (which currently carried date+time of the scheduled appointment)
-- into a dedicated `{{hora}}` placeholder, and rewords the default
-- so the guardian clearly sees WHEN to come. Also rewrites any
-- legacy user_message_templates citations rows that still use the
-- old "fecha carries time" convention by appending ` a las {{hora}}`
-- immediately after the first `{{fecha}}` occurrence.
--
-- Idempotency: the catalog UPDATE is by primary key, so a second run
-- simply overwrites with the same values. The user-template rewrite
-- is guarded by `template NOT LIKE '%{{hora}}%'`, so a second run
-- matches zero rows and is a no-op. The `absences` row is left
-- untouched by the WHERE clauses.
-- ================================================================

SET search_path TO attendance, public;

UPDATE message_template_actions
SET placeholders = '[{"key":"nombre","label":"Nombre del estudiante"},
                     {"key":"fecha","label":"Fecha de la citación"},
                     {"key":"hora","label":"Hora de la citación"}]'::jsonb,
    default_template = 'Estimado representante, se le cita a la institución el {{fecha}} a las {{hora}} para tratar un asunto relacionado con {{nombre}}. Por favor confirmar asistencia.'
WHERE action_key = 'citations';

UPDATE user_message_templates
SET template = REPLACE(template, '{{fecha}}', '{{fecha}} a las {{hora}}')
WHERE action_key = 'citations'
  AND template LIKE '%{{fecha}}%'
  AND template NOT LIKE '%{{hora}}%';
