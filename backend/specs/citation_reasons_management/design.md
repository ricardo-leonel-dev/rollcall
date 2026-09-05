# Design — Citation reasons (motivos) schema + CRUD

## Files to touch

### New
- `postgres/21_citation_reasons.sql` — migration: creates all four tables (R1–R5) and seeds
  `role_permissions` for the new `citation-reasons` resource (R18, R19). See "Migration numbering"
  below for why this is `21_...`, not `20_...`.
- `src/entities/CitationReason.ts`, `src/entities/Citation.ts`,
  `src/entities/CitationCitationReason.ts`, `src/entities/CitationAttachment.ts` — new TypeORM
  entities (R6).
- `src/services/citation-reason.service.ts` — `findAll`, `create`, `update`, `remove` (+ private
  validation helpers), mirroring `quarter.service.ts`'s shape for an institution-scoped lookup
  resource.
- `src/controllers/citation-reason.controller.ts` — thin router mirroring
  `absence.controller.ts`'s exact shape (R7–R17, R20).

### Edited
- `src/data-source.ts` — import and register the four new entities in the `entities` array (R6).
- `src/routes/index.ts` — import and mount `citationReasonRouter` at `/citation-reasons` (R20).

No edits to `Citation`/`CitationCitationReason`/`CitationAttachment` beyond creating the entity
files — they have no service/controller in this feature (see feature #10,
`citations_crud_and_attachments`, which is `pending` and explicitly depends on this migration).

## Migration numbering

Feature #8 (`notification_templates_per_action`) is now `done`, and
`postgres/20_notification_templates_per_action.sql` exists on disk (a separate, unrelated table —
`user_message_templates` — with no dependency on this feature's tables). `postgres/` therefore
tops out at `20`, and this feature's migration is `21_citation_reasons.sql`. `docker-entrypoint-
initdb.d` (and `psql -f`, applied manually per `AGENTS.md`) run files in lexical/numeric filename
order; since the two migrations touch entirely different tables, ordering between them doesn't
matter. **At implementation time, re-verify there isn't already a `21_*.sql` file (i.e. some other
feature landed in the meantime and grabbed it first), and if so, take the next free number instead
and update every reference to `21_citation_reasons.sql` in this spec accordingly.**

## Migration (`21_citation_reasons.sql`)

Follows the single-file convention used since migration 16 (`SET search_path TO attendance,
public;` at the top, unqualified table names — see `docs/specs.md`'s referenced conventions and
`notification_templates_per_action/design.md`'s identical note; no `_supabase` variant needed).

```sql
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
```

Soft-delete columns (`is_active` + `deleted_at`) are applied to `citation_reasons` and `citations`
— both are rows a user actively manages and expects to "delete" without losing history, matching
`docs/architecture.md`'s "rows are never hard deleted" rule. They are deliberately **not** applied
to `citation_citation_reasons` or `citation_attachments`, mirroring the two closest existing
analogs exactly: `justification_absences` (pivot, `02_auth_schema.sql`) and
`justification_attachments` (`09_justification_attachments.sql`) — neither has `is_active`/
`deleted_at`. A pivot row's existence *is* the many-to-many link (no meaningful "soft-deleted
link" state); an attachment row is hard-deleted by `removeAttachment`-style logic in feature #10,
matching `justification.service.ts#removeAttachment`'s existing hard-delete-row +
`fs.unlink`-the-file pattern.

## Entities

`CitationReason.ts` (the only one with a service/controller in this feature):

```ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('citation_reasons')
@Unique(['institutionId', 'name'])
export class CitationReason {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'institution_id', type: 'integer' })
  institutionId!: number;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  severity!: 'low' | 'medium' | 'high';

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
```

`Citation.ts`, `CitationCitationReason.ts`, `CitationAttachment.ts` follow the same column-mapping
convention (camelCase property / `@Column({ name: 'snake_case' })`), 1:1 with the DDL above — see
R3–R5 for the exact column lists. `Citation` gets `@CreateDateColumn`/`@UpdateDateColumn`;
`CitationCitationReason`/`CitationAttachment` get only `@CreateDateColumn`, matching
`JustificationAbsence`/`JustificationAttachment`'s existing shape (no `updated_at` column on either
pivot/attachment table).

## Service (`citation-reason.service.ts`)

Mirrors `quarter.service.ts`'s validation-helper style (not `absence.service.ts`'s, since this
resource has no date-range/enrollment business logic — just name/severity/description validation
and standard institution-scoped soft-delete CRUD):

```ts
import { AppDataSource } from '../data-source';
import { IsNull } from 'typeorm';
import { CitationReason } from '../entities/CitationReason';

const repo = () => AppDataSource.getRepository(CitationReason);

const MAX_NAME_LENGTH = 150;
const SEVERITIES = ['low', 'medium', 'high'] as const;
type Severity = typeof SEVERITIES[number];

function assertValidName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) {
    throw Object.assign(new Error('El nombre del motivo no puede estar vacío'), { status: 400 });
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw Object.assign(new Error(`El nombre no puede superar ${MAX_NAME_LENGTH} caracteres`), { status: 400 });
  }
  return trimmed;
}

function assertValidSeverity(severity: unknown): Severity {
  if (typeof severity !== 'string' || !SEVERITIES.includes(severity as Severity)) {
    throw Object.assign(new Error(`severity debe ser uno de: ${SEVERITIES.join(', ')}`), { status: 400 });
  }
  return severity as Severity;
}

async function findOwned(institutionId: number, id: number): Promise<CitationReason> {
  const r = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!r) throw Object.assign(new Error('Motivo de citación no encontrado'), { status: 404 });
  return r;
}

// courseIds is accepted (not used) purely for controller/service signature parity with
// absence.service.ts — citation_reasons is an institution-level lookup, not enrollment/course
// scoped. See "Discarded alternatives" for why this parameter is kept rather than dropped.
export async function findAll(institutionId: number, _courseIds: number[] | null) {
  return repo().find({ where: { institutionId, deletedAt: IsNull() }, order: { name: 'ASC' } });
}

export async function create(institutionId: number, _courseIds: number[] | null, data: {
  name: string; severity: string; description?: string | null;
}) {
  const name = assertValidName(data.name);
  const severity = assertValidSeverity(data.severity);
  const r = repo().create({
    institutionId,
    name,
    severity,
    description: data.description?.trim() || null,
    isActive: true,
  });
  return repo().save(r);
}

export async function update(institutionId: number, _courseIds: number[] | null, id: number, data: Partial<{
  name: string; severity: string; description: string | null;
}>) {
  const r = await findOwned(institutionId, id);
  if (data.name !== undefined) r.name = assertValidName(data.name);
  if (data.severity !== undefined) r.severity = assertValidSeverity(data.severity);
  if (data.description !== undefined) r.description = data.description?.trim() || null;
  return repo().save(r);
}

export async function remove(institutionId: number, _courseIds: number[] | null, id: number): Promise<void> {
  await findOwned(institutionId, id);
  await repo().update({ id }, { deletedAt: new Date(), isActive: false });
}
```

Duplicate-name detection (R11) is **not** hand-rolled as a pre-check query — it relies on the
`UNIQUE(institution_id, name)` DB constraint plus `errorMiddleware`'s existing `duplicate
key`/`unique` → `409` auto-mapping (`docs/architecture.md` §3), exactly as
`docs/conventions.md`'s error-handling section instructs ("don't catch and re-wrap those yourself,
let them propagate").

## Controller (`citation-reason.controller.ts`)

Exact structural mirror of `absence.controller.ts` (route table shape, permission-per-line,
`requireInstitution` applied via `router.use`):

```ts
import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/citation-reason.service';

const router = Router();
const R = 'citation-reasons';

router.use(requireInstitution);

router.get('/',       requirePermission(R,'read'),   async (req, res) => res.json(await svc.findAll(req.institutionId!, req.courseIds ?? null)));
router.post('/',      requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.institutionId!, req.courseIds ?? null, req.body)));
router.put('/:id',    requirePermission(R,'update'), async (req, res) => res.json(await svc.update(req.institutionId!, req.courseIds ?? null, +req.params.id, req.body)));
router.delete('/:id', requirePermission(R,'delete'), async (req, res) => { await svc.remove(req.institutionId!, req.courseIds ?? null, +req.params.id); res.status(204).send(); });

export default router;
```

`authMiddleware`/`institutionMiddleware` (R16, and `req.institutionId` for every handler) are
applied once, upstream, in `routes/index.ts`'s standard block — not re-applied here, matching every
other resource controller.

## Mount point

`src/routes/index.ts`, standard authenticated block, alongside `quarterRouter`/`absenceRouter`:

```ts
import citationReasonRouter from '../controllers/citation-reason.controller';
// ...
router.use('/citation-reasons', citationReasonRouter);
```

## Discarded alternatives

1. **Split the migration**: create only `citation_reasons` now, defer `citations`/
   `citation_citation_reasons`/`citation_attachments` to feature #10's own migration. Rejected —
   the acceptance criteria explicitly asks for one migration, and it's structurally necessary
   anyway: `citation_citation_reasons` has `NOT NULL` FKs to *both* `citations` and
   `citation_reasons`, so it can't be created before `citations` exists. Splitting would just move
   the `citations` `CREATE TABLE` into a differently-numbered file for no benefit, while doubling
   the number of migrations a fresh install must apply for the same end state.

2. **Native Postgres `ENUM` type for `severity`/`status`** instead of `VARCHAR` + `CHECK`.
   Rejected: no table in this schema uses a Postgres `ENUM` type today — every comparable
   controlled-value column (`quarters.name`, `courses.shift`, this migration's own `citations.status`)
   uses `VARCHAR` + `CHECK`, and `docs/conventions.md` explicitly favors matching the surrounding
   codebase's shape over introducing a new pattern.

3. **Drop the `courseIds` parameter entirely** from `citation-reason.service.ts`'s functions,
   following `quarter.service.ts`/`academic-year.service.ts`'s simpler institution-only shape
   (no `courseIds` at all) instead of `absence.service.ts`'s institution+course shape. This is
   arguably the more honest signature for a resource with no course dimension. Rejected in favor of
   literal fidelity to the acceptance criteria, which explicitly names "institutionId/courseIds
   threading" mirroring `absence.controller.ts`/`absence.service.ts`. **Flagged for the human
   reviewer**: this produces an unused `_courseIds` parameter on every service function purely for
   signature parity — functionally inert, but confirm this reading of the acceptance criteria is
   the intended one before implementation, since the alternative (drop it, follow
   `quarter.service.ts` instead) is one line simpler per function and arguably clearer.

4. **Seed `role_permissions` by copying `13_reports_permission.sql`'s technique**
   (`SELECT role_id, 'citation-reasons', ... FROM role_permissions WHERE resource = '<existing
   resource>'`) instead of a direct `roles.name IN (...)` lookup. Rejected: that technique only
   works when some *existing* resource already has exactly the target role set, and none does here
   — `users`/`roles` (the closest "admin-only" analogs) still grant `inspector` read access (see
   `02_auth_schema.sql`'s `DO $$` block), which would leak unintended read access to `inspector` if
   copied (violates R19). A direct `roles.name IN ('admin', 'rector', 'superadmin')` lookup is
   correct by construction and doesn't depend on any other resource's current shape.
