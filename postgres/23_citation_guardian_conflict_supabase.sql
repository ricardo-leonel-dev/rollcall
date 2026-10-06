-- ================================================================
-- Migración 23 (variante Supabase) — guardian-scoped 10-minute conflict
-- validation. Misma lógica que 23_citation_guardian_conflict.sql,
-- calificada con el schema "attendance" (el real en Supabase, ver
-- nota de la 08) en vez de "public".
-- ================================================================

-- 1. Add the new columns nullable so existing rows survive the ALTER.
ALTER TABLE attendance.citations ADD COLUMN IF NOT EXISTS guardian_id INTEGER;
ALTER TABLE attendance.citations ADD COLUMN IF NOT EXISTS date        DATE;

-- 2. Backfill guardian_id from the enrollment snapshot.
UPDATE attendance.citations c
SET    guardian_id = e.guardian_id
FROM   attendance.enrollments e
WHERE  e.id = c.enrollment_id
  AND  c.guardian_id IS NULL;

-- 3. Backfill the single date from the legacy date_from.
UPDATE attendance.citations SET date = date_from WHERE date IS NULL;

-- 4. Backfill null times BEFORE tightening NOT NULL (order matters, R3).
UPDATE attendance.citations SET time = '07:55' WHERE time IS NULL;

-- 5. Now safe to set NOT NULL.
ALTER TABLE attendance.citations ALTER COLUMN time  SET NOT NULL;
ALTER TABLE attendance.citations ALTER COLUMN date  SET NOT NULL;

-- 6. Drop the legacy range columns.
ALTER TABLE attendance.citations DROP COLUMN date_from;
ALTER TABLE attendance.citations DROP COLUMN date_to;

-- 7. Add the FK on guardian_id (added after the column so the backfill can run
--    without it blocking historically-orphan rows).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_citations_guardian') THEN
    ALTER TABLE attendance.citations
      ADD CONSTRAINT fk_citations_guardian
      FOREIGN KEY (guardian_id) REFERENCES attendance.guardians(id);
  END IF;
END $$;

-- 8. Partial index backing R12/R13.
CREATE INDEX IF NOT EXISTS idx_citations_guardian_date
  ON attendance.citations(guardian_id, date)
  WHERE status = 'pending' AND deleted_at IS NULL;