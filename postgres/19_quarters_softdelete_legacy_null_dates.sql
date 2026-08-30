-- Soft-delete every quarter that has null start_date or end_date; the dates are
-- unrecoverable (no inference), so these rows are removed from the active set.
-- See spec §R1/R2.
SET search_path TO attendance, public;

UPDATE quarters
SET deleted_at = NOW(), is_active = false
WHERE deleted_at IS NULL
  AND (start_date IS NULL OR end_date IS NULL);

-- R2 post-condition (run separately by the implementer as the verification step):
-- SELECT count(*) FROM quarters WHERE deleted_at IS NULL AND (start_date IS NULL OR end_date IS NULL);
-- expected: 0
