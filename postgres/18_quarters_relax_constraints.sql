-- Trimestres → períodos académicos genéricos: relaja el nombre y el conteo.
SET search_path TO attendance, public;

-- Postgres auto-names an inline column CHECK as `<table>_<column>_check` when no
-- explicit name is given, which is how 17_quarters.sql defined both constraints —
-- so these are the actual generated names, not a guess.
ALTER TABLE quarters DROP CONSTRAINT IF EXISTS quarters_name_check;
ALTER TABLE quarters DROP CONSTRAINT IF EXISTS quarters_sequence_number_check;

-- Arbitrary period names (e.g. "Primer Semestre", "Segundo Bimestre") may run
-- longer than the fixed trimester names the original 30-char limit was sized for.
ALTER TABLE quarters ALTER COLUMN name TYPE VARCHAR(60);

-- UNIQUE (academic_year_id, name) and UNIQUE (academic_year_id, sequence_number),
-- both added by 17_quarters.sql, are intentionally left untouched.