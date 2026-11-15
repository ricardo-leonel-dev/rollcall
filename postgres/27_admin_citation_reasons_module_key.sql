-- ================================================================
-- Migración 27 — Renombrar módulo `citation-reasons` a `admin:citation-reasons`
-- The frontend sends `admin:citation-reasons` like every other admin
-- sub-module; rows stored with the bare key are converted.
--
-- Idempotency: a user that already has both keys loses the old row
-- first (UNIQUE(user_id, module_key) would reject the UPDATE), then the
-- remaining old rows are renamed. A second run matches zero rows.
-- ================================================================

SET search_path TO attendance, public;

BEGIN;

DELETE FROM user_modules old
WHERE old.module_key = 'citation-reasons'
  AND EXISTS (
    SELECT 1 FROM user_modules cur
    WHERE cur.user_id = old.user_id
      AND cur.module_key = 'admin:citation-reasons'
  );

UPDATE user_modules
SET module_key = 'admin:citation-reasons'
WHERE module_key = 'citation-reasons';

COMMIT;
