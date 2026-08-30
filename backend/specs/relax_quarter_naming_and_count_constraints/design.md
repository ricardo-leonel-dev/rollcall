# Design — Relax quarter naming and count constraints

See `docs/architecture.md` (layers, error-handling convention, "never hard delete") and
`docs/conventions.md` (naming, file structure) for the baseline this design builds on. This feature
modifies files feature 1 (`api_configure_academic_quarters_trimestres_per_academic_year`) created —
see `specs/api_configure_academic_quarters_trimestres_per_academic_year/design.md` for the original
rationale behind the table shape, `institution_id` denormalization, and `sequence_number` column;
only the *deltas* are explained below.

## Files to touch

| File | Change |
|---|---|
| `../postgres/18_quarters_relax_constraints.sql` (monorepo-root `postgres/`, sibling to `backend/` — same directory as `17_quarters.sql`; next available number after `17_quarters.sql`) | **New.** Drops the two `CHECK` constraints, widens `name` to `VARCHAR(60)`. Keeps both `UNIQUE` constraints untouched. |
| `src/entities/Quarter.ts` | Widen the `name` column's TS-side comment/type is unaffected (still `string`); no structural change needed — `varchar` length isn't enforced by TypeORM at runtime, only by Postgres. |
| `src/services/quarter.service.ts` | Remove `QUARTER_NAMES`/`QuarterName` as validation source. Replace the name check in `create` with generic non-empty/max-length validation (R6, R7). Add `sequenceNumber` handling (auto-assign or explicit, R9–R12) to `create`. Extend `update` to accept `name`/`sequenceNumber` (R15–R19). Add `remove` (R20–R23). `seedQuarters` keeps using the same 3 fixed names/sequence numbers as literal values (R24) — it's a convenience default, not a naming rule enforced elsewhere anymore. |
| `src/controllers/quarter.controller.ts` | Add `DELETE /:id`, permission-checked against `academic_years`/`delete`, mirroring the existing `GET`/`POST`/`PUT` shape. |
| `src/routes/index.ts` | **No change** — `/api/quarters` is already mounted by feature 1. |

## Schema (`../postgres/18_quarters_relax_constraints.sql`)

```sql
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
```

No `_supabase` variant is needed, following the same reasoning `17_quarters.sql` already
established: `DROP CONSTRAINT IF EXISTS` / `ALTER COLUMN ... TYPE` are both standard DDL supported
identically on self-hosted Postgres and Supabase, and the `SET search_path` convention (fixed in
`16_course_grade_shift.sql`) is schema-portable already.

## Service (`src/services/quarter.service.ts`)

```ts
// QUARTER_NAMES / QuarterName removed — no longer a validation source. seedQuarters
// keeps its own local literal array of the 3 default names (see below).

const MAX_NAME_LENGTH = 60;

function assertValidName(name: string): string { // R6, R7
  const trimmed = name.trim();
  if (!trimmed) throw Object.assign(new Error('El nombre del período no puede estar vacío'), { status: 400 });
  if (trimmed.length > MAX_NAME_LENGTH) throw Object.assign(new Error(`El nombre del período no puede superar ${MAX_NAME_LENGTH} caracteres`), { status: 400 });
  return trimmed;
}

function assertValidSequenceNumber(n: unknown): number { // R11
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    throw Object.assign(new Error('sequenceNumber debe ser un entero positivo'), { status: 400 });
  }
  return n;
}

async function nextSequenceNumber(em: EntityManager, academicYearId: number): Promise<number> { // R9
  const siblings = await em.find(Quarter, { where: { academicYearId, deletedAt: IsNull() } });
  return siblings.reduce((max, s) => Math.max(max, s.sequenceNumber), 0) + 1;
}

export async function create(institutionId: number, data: {
  name: string; sequenceNumber?: number;
  startDate?: string | null; endDate?: string | null; description?: string | null;
}): Promise<Quarter> // R5, R8-R14

export async function update(institutionId: number, id: number, data: Partial<{
  name: string; sequenceNumber: number;
  startDate: string | null; endDate: string | null; description: string | null;
}>): Promise<Quarter> // R15-R19

export async function remove(institutionId: number, id: number): Promise<void> // R20, R22, R23
```

- **`create`** now runs inside `AppDataSource.transaction` (it wasn't before, because the old
  version never needed to read-then-write for sequence assignment): resolves the active academic
  year, validates `name` (R6/R7), resolves `sequenceNumber` via `data.sequenceNumber ??
  nextSequenceNumber(em, ay.id)` (R9/R10) validating it with `assertValidSequenceNumber` when
  explicit (R11), runs the existing `assertWithinAcademicYear`/`assertNoOverlap` checks unchanged
  (R14), then saves. R8/R12 (duplicate `name`/`sequenceNumber`) are left to the DB's own `UNIQUE`
  constraints + `errorMiddleware`'s existing `duplicate key`/`unique` → 409 mapping, exactly like
  feature 1's R12 did for name collisions — no new pre-check needed now that `sequenceNumber` is
  also DB-unique per academic year.
- **`update`** whitelists `name`/`sequenceNumber` in addition to the existing
  `startDate`/`endDate`/`description` (still not `Object.assign(entity, data)` — same reasoning
  feature 1's design gave for keeping this an explicit whitelist). `name`, when present, goes
  through `assertValidName` (R15/R17 relies on the DB `UNIQUE` for the actual conflict, same
  409-via-`errorMiddleware` pattern as `create`). `sequenceNumber`, when present, goes through
  `assertValidSequenceNumber` (R16/R18, same DB-unique reliance). R19 falls out for free: `update`
  has never special-cased *how* a row was created, so seeded default quarters go through the exact
  same code path as any other quarter — there is nothing to special-case, which is the point.
- **`remove`** mirrors `student.service.ts#remove`'s shape (`findById`-equivalent lookup, then
  `deletedAt`/`isActive` pair) rather than `academic-year.service.ts#remove`'s (which cascades to
  children) — a quarter has no child rows of its own to cascade to, so the simpler one-table version
  applies: look up the quarter scoped to `institutionId` + the active academic year + `deletedAt IS
  NULL` (404 if missing, R22), then `repo().update({ id }, { deletedAt: new Date(), isActive: false
  })` (R20, R23).
- **`seedQuarters`** keeps its own literal `['Primer Trimestre', 'Segundo Trimestre', 'Tercer
  Trimestre']` array inline (R24) instead of importing a shared `QUARTER_NAMES` constant — there is
  no other remaining consumer of that list once `create`'s validation against it is removed, so
  keeping it as a shared exported constant would misleadingly suggest it's still a validation rule
  rather than just this one function's default data.

## Controller (`src/controllers/quarter.controller.ts`)

```ts
router.delete('/:id', requirePermission(R, 'delete'), async (req, res) => {
  await svc.remove(req.institutionId!, +req.params.id);
  res.status(204).send();
});
```

Added after the existing `PUT /:id` line, same `R = 'academic_years'` permission resource as the
other three routes (R20, R21) — matches `student.controller.ts`'s `DELETE /:id` → `204` shape.

## Discarded alternatives

1. **Keep a fixed `QUARTER_NAMES` list but make it configurable per-institution (e.g. a new
   `institution_period_templates` table) instead of accepting free-form `name` on `POST
   /api/quarters`.** Rejected: the acceptance criteria explicitly asks for arbitrary
   creating/renaming/deleting of periods, not a second layer of institution-level configuration:
   that would be a second `sdd=1` feature's worth of new schema and doesn't have a corresponding
   Notion card. Free-form `name` validated only for non-emptiness/length is the smallest change that
   satisfies the requirement.
2. **Auto-renumber sibling `sequence_number`s when a quarter is deleted or resequenced, to keep them
   contiguous (1..N with no gaps).** Rejected for the same reason feature 1's design rejected
   auto-clamping dates on academic-year update: no existing cascade in this codebase rewrites a
   sibling/dependent row's field values as a side effect of another row's delete or update — the two
   `cascadeSoftDelete*` helpers only ever touch the row(s) directly named by the operation. Gaps in
   `sequence_number` (e.g. 1, 2, 4 after deleting the row that was 3) are harmless: it's an `ORDER
   BY` key, not a positional index, and nothing else in this codebase assumes contiguity.
3. **Reject `sequenceNumber` as a client-supplied field entirely, keep it always server-derived (as
   feature 1 did via `QUARTER_NAMES.indexOf`).** Rejected: once `name` is free-form there is no
   longer a name→order mapping to derive it from, and the acceptance criteria requires
   `sequence_number` to be editable, not just `name`. Auto-assigning only when omitted (R9) keeps
   the ergonomic "just POST a name" path working for simple cases while still allowing explicit
   control when needed (e.g. inserting a period between two existing ones).
4. **Enforce a new application-level maximum period count (e.g. cap at 12) now that the DB-level cap
   of 3 is gone, to guard against runaway input.** Rejected: the acceptance criteria has no such
   number, and inventing an arbitrary cap not requested anywhere would just be a different hardcoded
   limit in place of the one being removed. If a real limit is ever needed, it should come from its
   own requirement, not be smuggled into this feature's implementation.
