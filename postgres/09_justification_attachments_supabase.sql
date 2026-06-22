-- ================================================================
-- Migración 09 (variante Supabase) — adjuntos (evidencia) de
-- justificaciones. Misma lógica que 09_justification_attachments.sql,
-- calificada con el schema "attendance" (el real en Supabase, ver
-- nota de la 08) en vez de "public".
-- ================================================================

CREATE TABLE IF NOT EXISTS attendance.justification_attachments (
  id                SERIAL PRIMARY KEY,
  justification_id  INTEGER NOT NULL REFERENCES attendance.justifications(id),
  file_name         VARCHAR(255) NOT NULL,
  original_name     VARCHAR(255) NOT NULL,
  mime_type         VARCHAR(100) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_justification_attachments_justification
  ON attendance.justification_attachments(justification_id);
