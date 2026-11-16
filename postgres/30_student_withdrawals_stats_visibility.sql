-- ================================================================
-- Migración 30 — Visibilidad de estadísticas en retiros de matrícula
-- ================================================================
SET search_path TO attendance, public;

BEGIN;

-- Cada retiro decide hasta qué fecha sus registros siguen contando:
--   until_withdrawal    — hasta el día del retiro (inclusive)
--   until_quarter_start — hasta el día anterior al trimestre del retiro
--   whole_year          — nada del año lectivo
-- La columna lleva el valor por defecto, así que los retiros existentes
-- quedan en 'until_withdrawal' sin necesidad de un UPDATE aparte.
ALTER TABLE student_withdrawals
    ADD COLUMN IF NOT EXISTS stats_visibility VARCHAR(20) NOT NULL DEFAULT 'until_withdrawal';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_student_withdrawals_stats_visibility') THEN
    ALTER TABLE student_withdrawals
      ADD CONSTRAINT chk_student_withdrawals_stats_visibility
      CHECK (stats_visibility IN ('until_withdrawal', 'until_quarter_start', 'whole_year'));
  END IF;
END $$;

COMMIT;
