-- ================================================================
-- Migration 09: adjuntos (evidencia) de justificaciones
-- Sigue el patrón de 08_user_courses_academic_year.sql: usa "public."
-- explícito en cada statement (la base real usa el schema "public",
-- no "attendance" — ver nota en 08).
-- ================================================================

CREATE TABLE IF NOT EXISTS public.justification_attachments (
  id                SERIAL PRIMARY KEY,
  justification_id  INTEGER NOT NULL REFERENCES public.justifications(id),
  file_name         VARCHAR(255) NOT NULL,
  original_name     VARCHAR(255) NOT NULL,
  mime_type         VARCHAR(100) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_justification_attachments_justification
  ON public.justification_attachments(justification_id);
