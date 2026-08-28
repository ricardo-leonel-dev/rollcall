-- Trimestres (quarters): exactly three fixed quarters per academic year, with
-- configurable date ranges validated against their parent academic year.
SET search_path TO attendance, public;

CREATE TABLE IF NOT EXISTS quarters (
    id                SERIAL PRIMARY KEY,
    academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id),
    institution_id    INTEGER NOT NULL REFERENCES institutions(id),
    name              VARCHAR(30) NOT NULL
                        CHECK (name IN ('Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre')),
    sequence_number   SMALLINT NOT NULL CHECK (sequence_number BETWEEN 1 AND 3),
    start_date        DATE,
    end_date          DATE,
    description       TEXT,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,
    UNIQUE (academic_year_id, name),
    UNIQUE (academic_year_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_quarters_academic_year ON quarters(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_quarters_institution    ON quarters(institution_id);

-- Backfill: every pre-existing academic year (soft-deleted or not — cheap and harmless either
-- way, and avoids a second, more fragile query that tries to distinguish them) gets its 3 fixed
-- quarters, without disturbing any that already exist for it. institution_id/sequence_number are
-- copied from the parent academic year and the fixed name->sequence mapping, respectively.
INSERT INTO quarters (academic_year_id, institution_id, name, sequence_number)
SELECT ay.id, ay.institution_id, q.name, q.sequence_number
FROM academic_years ay
CROSS JOIN (VALUES ('Primer Trimestre', 1), ('Segundo Trimestre', 2), ('Tercer Trimestre', 3))
  AS q(name, sequence_number)
ON CONFLICT (academic_year_id, name) DO NOTHING;
