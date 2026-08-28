# Design — API: Configure academic quarters (trimestres) per academic year

See `docs/architecture.md` (layers, error-handling convention, "never hard delete") and
`docs/conventions.md` (naming, file structure) for the baseline this design builds on — only choices
specific to this feature are explained below.

## Files to touch

| File | Change |
|---|---|
| `../postgres/17_quarters.sql` (monorepo-root `postgres/`, sibling to `backend/` — **not** `backend/postgres/`, which doesn't exist; same directory that already holds `16_course_grade_shift.sql`) | **New.** Creates `quarters`, backfills existing academic years. |
| `src/entities/Quarter.ts` | **New.** TypeORM entity. |
| `src/services/quarter.service.ts` | **New.** `findAllForActiveYear`, `create`, `update`, plus the shared date-range validator and the `seedQuarters`/`cascadeSoftDeleteQuarters` helpers `academic-year.service.ts` calls into. |
| `src/controllers/quarter.controller.ts` | **New.** `GET /`, `POST /`, `PUT /:id`, permission-checked against resource `academic_years`. |
| `src/routes/index.ts` | Import + `router.use('/quarters', quarterRouter)`, alongside the other resource mounts. |
| `src/services/academic-year.service.ts` | `create()` seeds the 3 quarters in the same transaction; `update()` runs the re-validation guard (R17/R18) before persisting new dates; `remove()` cascades a soft-delete of the academic year's quarters. |

## Schema (`../postgres/17_quarters.sql`)

Follows the `SET search_path TO attendance, public;` + unqualified-identifiers convention fixed in
`16_course_grade_shift.sql` (schema-portable across the self-hosted `attendance` schema and
Supabase's `public` schema — see that migration's commit message), rather than the older
schema-qualified-per-statement style used in migrations 08/09. No `_supabase` variant is needed
because of that.

```sql
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
```

**`institution_id`** is denormalized from the parent academic year (copied once, at insert time),
matching the existing `course_academic_years` precedent — the other "direct child of
`academic_years`" table in this schema. It's immutable in practice (an academic year's institution
never changes after creation), so there's no realistic risk of it drifting out of sync with
`academic_years.institution_id`, and it lets every quarter query filter/index directly on
`institution_id` instead of joining through `academic_years` first, consistent with how
`course_academic_years` is already queried.

**`is_active`** follows the dominant convention `docs/architecture.md` documents across 12 existing
services: `deleted_at` + `is_active` are set together on delete (`R3`), and reads still filter only
on `deleted_at IS NULL` (matching `course.service.ts#findAll`, `academic-year.service.ts#findAll`,
etc. — none of them additionally filter on `is_active` in `WHERE`, so `quarters` doesn't either).
There's still no standalone delete endpoint for a single quarter (a quarter only ever becomes
inactive/deleted via the R3 cascade when its academic year is removed), so `is_active` and
`deleted_at` always change together here — but keeping both is what the rest of the codebase does
even where the same is true (e.g. `course_academic_years`), so this now matches that instead of
being a one-off exception.

**`sequence_number`** is an explicit `SMALLINT` (1/2/3, one `UNIQUE` pair with `academic_year_id`
alongside the `name` one) rather than relying on insertion/`id` order or a `CASE name WHEN ...`
expression wherever quarters are listed — see "Discarded alternatives" for why the
implicit-ordering approaches were rejected in favor of this explicit column.

The `CHECK` constraint and `UNIQUE (academic_year_id, name)` are defense-in-depth, not the primary
error path — `quarter.service.ts` validates `name` in JS first (R9) so the client gets a clean `400`
`{ error: '...' }` instead of a raw constraint-violation message `errorMiddleware` doesn't
special-case (it only recognizes `duplicate key`/`unique` → 409 and `violates foreign key` → 409;
a `CHECK` violation isn't pattern-matched and would otherwise fall through to a raw 500). The
`UNIQUE` constraint's own violation *is* one of the two recognized patterns, so R12's "second row
for the same name" case is left to surface naturally as the existing generic 409 — no need to
pre-check for it in the service, mirroring how `course-academic-year.service.ts` also leans on the
DB's own `UNIQUE(course_id, academic_year_id)` for its duplicate-assignment case.

## Entity (`src/entities/Quarter.ts`)

Same shape as `AcademicYear.ts`/`CourseAcademicYear.ts`, now including both:

```ts
@Entity('quarters')
@Unique(['academicYearId', 'name'])
@Unique(['academicYearId', 'sequenceNumber'])
export class Quarter {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'academic_year_id', type: 'integer' }) academicYearId!: number;
  @Column({ name: 'institution_id', type: 'integer' }) institutionId!: number;
  @Column({ name: 'name', type: 'varchar' }) name!: string;
  @Column({ name: 'sequence_number', type: 'smallint' }) sequenceNumber!: number;
  @Column({ name: 'start_date', type: 'date', nullable: true }) startDate!: string | null;
  @Column({ name: 'end_date', type: 'date', nullable: true }) endDate!: string | null;
  @Column({ name: 'description', type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
}
```

## Service (`src/services/quarter.service.ts`)

```ts
export const QUARTER_NAMES = ['Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre'] as const;
export type QuarterName = typeof QUARTER_NAMES[number];

async function findActiveAcademicYear(institutionId: number): Promise<AcademicYear> // throws 404 R5/R8
export async function findAllForActiveYear(institutionId: number): Promise<Quarter[]>   // R4, R5, R19 — ordered by sequence_number ASC
export async function create(institutionId: number, data: { name: string; startDate?: string | null; endDate?: string | null; description?: string | null }): Promise<Quarter> // R6-R12 — sequenceNumber/institutionId are derived server-side, never read from `data`
export async function update(institutionId: number, id: number, data: Partial<{ startDate: string | null; endDate: string | null; description: string | null }>): Promise<Quarter> // R13-R16

// Called by academic-year.service.ts, not exposed over HTTP:
export async function seedQuarters(em: EntityManager, academicYearId: number): Promise<void>   // R2
export async function cascadeSoftDeleteQuarters(em: EntityManager, academicYearId: number): Promise<void> // R3
export async function assertQuartersFitAcademicYearRange(em: EntityManager, academicYearId: number, startDate: string | null, endDate: string | null): Promise<void> // R17/R18
```

- **`findActiveAcademicYear`** mirrors the exact pattern `institution.middleware.ts`'s
  `resolveCourseIds` already uses to find "the" academic year for an institution:
  `AppDataSource.getRepository(AcademicYear).findOne({ where: { institutionId, isActive: true,
  deletedAt: IsNull() } })`. Reusing this instead of inventing a new resolution rule keeps "what
  counts as the active academic year" defined in exactly one place in spirit (same query shape,
  independently evaluated — see "Discarded alternatives" for why it isn't literally the same
  function call). Throws the existing `Object.assign(new Error('No hay año lectivo activo'),
  { status: 404 })` shape (R5, R8) when none is found.
- **`update`** whitelists `startDate`/`endDate`/`description` explicitly (destructures them off
  `data` rather than `Object.assign`-ing the whole body onto the entity, unlike
  `academic-year.service.ts#update`) — `name`, `academicYearId`, `institutionId`, and
  `sequenceNumber` are all immutable via this endpoint, and blind `Object.assign` would let a client
  silently overwrite them since `req.body` is untyped at runtime. This is a narrow, deliberate
  deviation from the `Object.assign(entity, data)` shape used elsewhere; noted here so it doesn't
  look like an oversight.
- **`create`** derives `institutionId` from the resolved active academic year (never from the
  request body) and `sequenceNumber` from `QUARTER_NAMES.indexOf(data.name) + 1` once `name` has
  already passed the R9 check — the client only ever supplies `name`, `startDate`, `endDate`,
  `description`. See "Discarded alternatives" for why these two aren't accepted as request fields.
- **Overlap check (R11, R16):** given a candidate `[start, end]` and the academic year's other
  non-deleted, fully-dated quarters, two ranges overlap unless `candidate.end < sibling.start OR
  candidate.start > sibling.end`. Only quarters where both dates are already set participate —
  a quarter with `NULL` dates has nothing to overlap by definition.
- **Containment check (R10, R15):** `candidate.start >= academicYear.startDate AND candidate.end <=
  academicYear.endDate`, only enforced when the academic year itself has both dates set (an
  academic year created without dates yet has nothing to validate its quarters against).
- **`create`/`update` respond `400`** for R9–R11/R15–R16 via the existing
  `Object.assign(new Error(...), { status: 400 })` convention (same as `course.service.ts`'s
  "Jornada inválida" check) — these are request-level validation failures the service itself
  detects, as opposed to R12/R17's `409`s, which signal a conflict with *other already-persisted*
  rows (the existing duplicate-name row, or the academic year's existing quarters) rather than
  malformed input in the current request. This mirrors how `errorMiddleware` already reserves 409
  for "conflicts with existing data" (duplicate key / FK violation) and leaves 400 for
  request-shape problems.

## `academic-year.service.ts` changes

- **`create`**: after `em.save(ay)`, call `await seedQuarters(em, ay.id)` inside the same
  transaction (R2) — mirrors the existing single-transaction shape already used for the
  active-year-flip logic in this same function.
- **`update`**: when `data.startDate` or `data.endDate` is present and differs from the current
  value, call `await assertQuartersFitAcademicYearRange(em, id, data.startDate ?? ay.startDate,
  data.endDate ?? ay.endDate)` inside a transaction *before* saving — throws
  `Object.assign(new Error('...'), { status: 409 })` naming the offending quarter(s) (R17). If it
  doesn't throw, proceed exactly as today (R18). If neither date is being changed, skip the check
  entirely (cheap, and R17/R18 don't apply).
- **`remove`**: alongside the existing enrollment cascade, add `await cascadeSoftDeleteQuarters(em,
  id)` (R3) — sets `deletedAt = new Date()` **and** `isActive = false` together, matching the
  `Course`/`Enrollment` cascade shape (`{ deletedAt: new Date(), isActive: false }`) instead of
  `deletedAt` alone.

## Controller (`src/controllers/quarter.controller.ts`)

Same shape as `academic-year.controller.ts`, reusing its permission resource per the feature's own
acceptance criteria ("cualquier rol con permiso sobre el recurso `academic_years`..."):

```ts
const router = Router();
const R = 'academic_years';
router.use(requireInstitution);
router.get('/',    requirePermission(R, 'read'),   async (req, res) => res.json(await svc.findAllForActiveYear(req.institutionId!)));
router.post('/',   requirePermission(R, 'create'), async (req, res) => res.status(201).json(await svc.create(req.institutionId!, req.body)));
router.put('/:id', requirePermission(R, 'update'), async (req, res) => res.json(await svc.update(req.institutionId!, +req.params.id, req.body)));
export default router;
```

Mounted as `router.use('/quarters', quarterRouter);` in `src/routes/index.ts`, next to the other
resource mounts (after `academic-years`, before `courses`, matching the order dependents are
already grouped near their parent resource in that file).

No `DELETE /api/quarters/:id` — out of scope per the acceptance criteria (create/update only); a
quarter only ever disappears via the R3 cascade.

## Discarded alternatives

1. **Order quarters implicitly (insertion/`id` order, or a `CASE name WHEN 'Primer Trimestre' THEN
   1 ...` expression in every query that lists them) instead of an explicit `sequence_number`
   column.** Rejected: an explicit column makes the fixed Primer/Segundo/Tercer ordering visible and
   inspectable directly in the table (and in any ad-hoc query or DB tool), instead of depending on
   insertion order being preserved everywhere `quarters` is read, or duplicating a `name`→order
   mapping inside every query. The one-time cost is a `SMALLINT` column and one extra `UNIQUE`
   pair (`academic_year_id, sequence_number`); the win is explicitness at read time.
2. **Auto-clamp (silently shrink) existing quarters' dates when an academic year's dates are
   narrowed, instead of rejecting the academic-year update (R17).** Rejected: no existing cascade in
   this codebase rewrites a *dependent's field values* as a side effect of updating its *parent*
   (the only precedents — `cascadeSoftDeleteEnrollment`/`cascadeSoftDeleteAbsence` — soft-delete
   dependents on parent *deletion*, they never silently rewrite dependent data on parent *update*).
   Clamping would also need its own extra validation to avoid producing a degenerate quarter (e.g.
   a clamped `start > end`), and would make quarter-date changes invisible to whoever is on the
   quarter-configuration screen, since they'd happen as an invisible side effect of an unrelated
   academic-year edit. Rejecting the academic-year update with a `409` naming the conflicting
   quarter(s) is simpler, keeps `quarters` and `academic_years` writes independent and explicit, and
   matches this codebase's existing "services throw, they don't silently reinterpret data"
   convention (`docs/conventions.md`).
3. **Resolve "the academic year a quarter belongs to" from a client-supplied `academic_year_id`
   query param/body field instead of always the active one.** Rejected: the acceptance criteria is
   explicit ("los trimestres siempre están asociados a un año académico, resuelto contra el
   actualmente activo"), and `institution.middleware.ts` already establishes the precedent of never
   trusting a client-supplied academic year for access-scoping decisions (see its
   `resolveCourseIds` comment) — extending that same distrust to quarters keeps the two consistent
   instead of introducing a second, looser resolution rule next to it.
4. **Accept `institution_id`/`sequence_number` as client-supplied fields on `POST /api/quarters`**
   (rather than always deriving them server-side, as decided above). Rejected for the same reason as
   #3: both values are fully determined by server-side state the client shouldn't be trusted to
   assert (`institution_id` from the resolved active academic year; `sequence_number` from the fixed
   `name`→order mapping) — accepting them as input would just reopen the same class of trust problem
   institution-scoping already avoids elsewhere, for no behavioral benefit since there's only ever
   one correct value for each.
