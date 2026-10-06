-- Citation reasons (motivos) schema + CRUD
-- See feature citation_reasons_management (R1–R5) and seeds role_permissions
-- for admin / rector / superadmin full CRUD on resource 'citation-reasons'
-- (R18). Other roles get no row by design (R19).

SET search_path TO attendance, public;

CREATE TABLE IF NOT EXISTS citation_reasons (
    id              SERIAL PRIMARY KEY,
    institution_id  INTEGER NOT NULL REFERENCES institutions(id),
    name            VARCHAR(150) NOT NULL,
    severity        VARCHAR(10) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (institution_id, name)
);

CREATE INDEX IF NOT EXISTS idx_citation_reasons_institution ON citation_reasons(institution_id);

CREATE TABLE IF NOT EXISTS citations (
    id                  SERIAL PRIMARY KEY,
    institution_id      INTEGER NOT NULL REFERENCES institutions(id),
    enrollment_id       INTEGER NOT NULL REFERENCES enrollments(id),
    date_from           DATE NOT NULL,
    date_to             DATE NOT NULL,
    time                TIME,
    status              VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'closed')),
    observations        TEXT,
    closed_at           TIMESTAMPTZ,
    closed_by_user_id   INTEGER REFERENCES users(id),
    created_by_user_id  INTEGER REFERENCES users(id),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citations_institution ON citations(institution_id);
CREATE INDEX IF NOT EXISTS idx_citations_enrollment   ON citations(enrollment_id);

CREATE TABLE IF NOT EXISTS citation_citation_reasons (
    id                  SERIAL PRIMARY KEY,
    citation_id         INTEGER NOT NULL REFERENCES citations(id),
    citation_reason_id  INTEGER NOT NULL REFERENCES citation_reasons(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (citation_id, citation_reason_id)
);

CREATE INDEX IF NOT EXISTS idx_citation_citation_reasons_citation ON citation_citation_reasons(citation_id);
CREATE INDEX IF NOT EXISTS idx_citation_citation_reasons_reason   ON citation_citation_reasons(citation_reason_id);

CREATE TABLE IF NOT EXISTS citation_attachments (
    id             SERIAL PRIMARY KEY,
    citation_id    INTEGER NOT NULL REFERENCES citations(id),
    file_name      VARCHAR(255) NOT NULL,
    original_name  VARCHAR(255) NOT NULL,
    mime_type      VARCHAR(100) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citation_attachments_citation ON citation_attachments(citation_id);

INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
SELECT id, 'citation-reasons', TRUE, TRUE, TRUE, TRUE
FROM roles
WHERE name IN ('admin', 'rector', 'superadmin')
ON CONFLICT (role_id, resource) DO NOTHING;
