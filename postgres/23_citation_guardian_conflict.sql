-- ================================================================
-- Migración 23 — guardian-scoped 10-minute conflict validation
-- Feature: citation_guardian_conflict_validation (#15)
-- Replaces the superseded per-enrollment date-range check from #14.
-- Adds citations.guardian_id (snapshot from enrollments.guardian_id),
-- collapses date_from/date_to into a single citations.date, makes
-- citations.time NOT NULL (backfilling 07:55 first), and creates a
-- partial index backing the new conflict query.
-- ================================================================

SET search_path TO attendance, public;

-- 1. Add the new columns nullable so existing rows survive the ALTER.
ALTER TABLE citations ADD COLUMN IF NOT EXISTS guardian_id INTEGER;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS date        DATE;

-- 2. Backfill guardian_id from the enrollment snapshot.
UPDATE citations c
SET    guardian_id = e.guardian_id
FROM   enrollments e
WHERE  e.id = c.enrollment_id
  AND  c.guardian_id IS NULL;

-- 3. Backfill the single date from the legacy date_from.
UPDATE citations SET date = date_from WHERE date IS NULL;

-- 4. Backfill null times BEFORE tightening NOT NULL (order matters, R3).
UPDATE citations SET time = '07:55' WHERE time IS NULL;

-- 5. Now safe to set NOT NULL.
ALTER TABLE citations ALTER COLUMN time  SET NOT NULL;
ALTER TABLE citations ALTER COLUMN date  SET NOT NULL;

-- 6. Drop the legacy range columns.
ALTER TABLE citations DROP COLUMN date_from;
ALTER TABLE citations DROP COLUMN date_to;

-- 7. Add the FK on guardian_id (added after the column so the backfill can run
--    without it blocking historically-orphan rows).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_citations_guardian') THEN
    ALTER TABLE citations
      ADD CONSTRAINT fk_citations_guardian
      FOREIGN KEY (guardian_id) REFERENCES guardians(id);
  END IF;
END $$;

-- 8. Partial index backing R12/R13.
CREATE INDEX IF NOT EXISTS idx_citations_guardian_date
  ON citations(guardian_id, date)
  WHERE status = 'pending' AND deleted_at IS NULL;