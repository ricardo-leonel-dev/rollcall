# Implementation report — feature 5: Backend rechaza trimestres sin fecha de inicio o fin + migración de datos legados

Feature: `backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados`
(sdd=1, spec approved by Ricardo Aguilar) · Session 9 · Implementer (MiniMax-M3)
Scope: backend-only + one SQL migration at the monorepo root (`../postgres/`).

## Outcome

All 8 tasks in `specs/.../tasks.md` are implemented and checked off `[x]`. Three files changed:
the new migration `../postgres/19_quarters_softdelete_legacy_null_dates.sql` (T1), two
presence guards in `src/controllers/quarter.controller.ts` (T2), and a new private
`assertValidDates(range)` helper plus its two call sites in `src/services/quarter.service.ts`
(T3–T4). The design in `specs/.../design.md` was followed verbatim — no deviations.

**Verification was run live, not simulated.** A full stack was already up
(`backend`/`postgres`/`excel-service`/`frontend`/`redis` containers); the backend image was
rebuilt (`docker compose build backend` → `up -d --no-deps backend`) with these changes before
smoke-testing. The migration was applied twice against the dev Postgres via
`docker exec -i postgres psql -U attendance -d attendance` (there is no host `psql`/`pnpm`
binary on this machine — `./node_modules/.bin/tsc` is what `pnpm run build` invokes, same
substitution feature 3's report documented). Every request/response in the Traceability table
below is an actual observed response, copied verbatim from the run.

Per `docs/verification.md`, this project has **no automated test suite** — this change is
**build-checked (`tsc` exit 0) and manually smoke-tested against the real API + Postgres, not
unit-tested.**

## Scope

### New files

| File | Content |
|---|---|
| `../postgres/19_quarters_softdelete_legacy_null_dates.sql` | `SET search_path TO attendance, public;` + a single `UPDATE quarters SET deleted_at = NOW(), is_active = false WHERE deleted_at IS NULL AND (start_date IS NULL OR end_date IS NULL);` plus the R2 post-condition query as a comment. No `BEGIN`/`COMMIT` (matches 17/18's style; a single `UPDATE` is atomic). Verbatim from `design.md`'s "Migration shape". |

### Modified files (exactly the hunks below — nothing else)

| File | Change |
|---|---|
| `src/controllers/quarter.controller.ts` | `POST /` handler: gained a `next` parameter and a 3-line guard `if (req.body.startDate == null \|\| req.body.endDate == null) return next(Object.assign(new Error('El período debe tener fecha de inicio y fecha de fin.'), { status: 400 }));` placed after `requirePermission(R,'create')` and before `svc.create`. `PUT /:id` handler: same shape with the strict `=== null` comparison (so an *omitted* key is not rejected here — that case belongs to the service's post-merge check). Both handlers changed from one-line arrow bodies to block bodies solely to fit the guard; no other handler touched. |
| `src/services/quarter.service.ts` | New private helper `assertValidDates(range: DateRange): void` inserted immediately after `assertNoOverlap` and before `assertValidName`, throwing `Object.assign(new Error('El período debe tener fecha de inicio y fecha de fin.'), { status: 400 })` when `range.startDate === null \|\| range.endDate === null`. One `assertValidDates(range);` call added in `create` (after the `range` literal built from `data.startDate ?? null`, i.e. after `assertValidName`, before `assertWithinAcademicYear`) and one in `update` (on the existing post-merge `range`, before `assertWithinAcademicYear`). No public signature changed; no helper reordered. |

### Note on `git diff` noise (not scope drift)

The working tree still carries **uncommitted changes from features 2, 3 and 4** (export quarter
selection, quarter CRUD relaxation, the `academic_year_id` GET filter). So
`git diff src/controllers/quarter.controller.ts` also shows the `GET /` `academic_year_id`
filter and the `DELETE /:id` route, and `git diff src/services/quarter.service.ts` shows
~140 changed lines. **Only the hunks listed in the table above belong to this feature**; the
reviewer can isolate them by searching for `assertValidDates` (3 hits: declaration + 2 call
sites) and for `El período debe tener fecha de inicio y fecha de fin.` (3 hits: the service
helper + the 2 controller guards).

### Conventions followed

- Controller stays thin: the guard is a presence check on the wire format, not business logic;
  every query still lives in the service (`docs/architecture.md` §1).
- Both layers `throw`/`next(...)` an `Object.assign(new Error(...), { status: 400 })` and let
  `middleware/error.middleware.ts` render the response — nothing touches `res` in the service
  (`docs/conventions.md` "Error Handling").
- No comments added: the guards and the helper are self-describing, and
  `docs/conventions.md` only allows comments that explain a non-obvious *why*. The migration
  file does carry a header comment (a *why*: the dates are unrecoverable, hence soft-delete
  rather than inference) matching the style of `17_quarters.sql`/`18_quarters_relax_constraints.sql`.
- No hard deletes: the migration sets `deleted_at` **and** `is_active = false` together, the
  project-wide pair (`docs/architecture.md` §4).
- Same Spanish message string in all three places, so a log/audit grep matches every layer and
  the API message is identical to the frontend dialog's (sibling feature
  `frontend/specs/require_full_dates_on_quarters/`).

## Verification

### Level 1 — build

```
$ ./node_modules/.bin/tsc -p tsconfig.json     # = what `pnpm run build` invokes; no host pnpm binary
tsc (= pnpm run build) exit: 0
```

No diagnostics; no new TypeScript errors attributable to `quarter.controller.ts` or
`quarter.service.ts`.

### `./init.sh`

```
── 1. Checking prerequisites ───────────────────────────
[OK]    sqlite3 available
[OK]    jq available

── 2. Checking harness state ───────────────────────────
[OK]    .harness.json found
[OK]    harness.db found
[OK]    Found docs/architecture.md
[OK]    Found docs/conventions.md
[OK]    Found docs/verification.md
[OK]    Found CHECKPOINTS.md

── 3. Checking SDD spec files ───────────────────────────
[OK]    all sdd=1 features have their spec files on disk

── 4. Running verification command ─────────────────────
[WARN]  No verify_command configured in .harness.json — skipping

── 5. Regenerating markdown snapshot ───────────────────
[OK]    snapshot regenerated at state

── 6. Syncing Postgres/Supabase mirror (best-effort) ───
[WARN]  $SUPABASE_URL / $SUPABASE_ANON_KEY not set — skipping mirror sync

── 7. Summary ───────────────────────────────────────────
[OK]    Environment ready. You can start working.
init.sh exit: 0
```

Both `[WARN]`s are the pre-existing infra warnings `docs/verification.md` and feature 3's report
already document (empty `verify_command`, unset Supabase mirror env) — unchanged from baseline.

### Level 2/3 — migration run (T1)

Test fixture: institution 2, active academic year 1 (`2026-05-04 … 2027-03-05`). Control row
id=9 (`Primer Trimestre`, seq 4, both dates set, active). Legacy row seeded directly via `psql`
(bypassing the API, simulating a pre-migration row): id=96 `Legado Sin Fechas T1`, seq 60,
`start_date`/`end_date` NULL, `is_active = true`, `deleted_at` NULL.

```
 phase | id |         name         | sequence_number | academic_year_id | start_date |  end_date  | is_active | deleted_at
-------+----+----------------------+-----------------+------------------+------------+------------+-----------+------------
 PRE   |  9 | Primer Trimestre     |               4 |                1 | 2026-05-04 | 2026-08-07 | t         |
 PRE   | 96 | Legado Sin Fechas T1 |              60 |                1 |            |            | t         |

=== APPLY #1 ===
SET
UPDATE 1

=== R2 POST-CONDITION ===
 remaining_null_dated_active
-----------------------------
                           0

=== APPLY #2 (idempotence) ===
SET
UPDATE 0

=== POST STATE ===
 phase | id |         name         | sequence_number | academic_year_id | start_date |  end_date  | is_active |          deleted_at
-------+----+----------------------+-----------------+------------------+------------+------------+-----------+------------------------------
 POST  |  9 | Primer Trimestre     |               4 |                1 | 2026-05-04 | 2026-08-07 | t         |
 POST  | 96 | Legado Sin Fechas T1 |              60 |                1 |            |            | f         | 2026-08-29 20:59:33.95922+00
```

The dated control row is untouched; the legacy row is soft-deleted with `name`,
`sequence_number` and `academic_year_id` preserved; the R2 post-condition returns 0; the second
application affects zero rows (idempotent).

### Level 2/3 — API smoke tests (T5–T7)

Stack: `docker compose build backend` → `docker compose up -d --no-deps backend`
(`GET /api/health` → `{"status":"ok"}`). Auth: `superadmin` JWT
(`POST /api/auth/login`, seeded by `seedSuperAdmin()`) with `X-Institution-Id: 2` — superadmin
holds `create`/`update`/`read`/`delete` on `academic_years` and `read` on `export`. All calls to
`http://localhost:3000`. Individual results are in the Traceability table below.

## Traceability

Every `R<n>` maps to a live, observed check (no automated tests exist in this project — see
"Verification" above). All responses are copied verbatim from the run.

| Req | Check (request) | Observed result |
|---|---|---|
| **R1** | `docker exec -i postgres psql … < ../postgres/19_quarters_softdelete_legacy_null_dates.sql`, twice, against the fixture described above | 1st run `UPDATE 1` (legacy id=96 soft-deleted: `is_active=f`, `deleted_at=2026-08-29 20:59:33.95922+00`, `name`/`sequence_number`/`academic_year_id` unchanged; dated control id=9 untouched). 2nd run `UPDATE 0` → idempotent |
| **R2** | `SELECT count(*) FROM quarters WHERE deleted_at IS NULL AND (start_date IS NULL OR end_date IS NULL);` right after the migration, and again at the end of the whole smoke run | `0` both times |
| **R3** (i) | `POST /api/quarters` `{"name":"Período sin inicio","sequenceNumber":1}` | `HTTP 400` `{"error":"El período debe tener fecha de inicio y fecha de fin."}` |
| **R3** (ii) | `POST /api/quarters` `{"name":"Período sin fin","sequenceNumber":1,"startDate":"2026-06-01"}` | `HTTP 400`, same body |
| **R3** (ii-b) | `POST /api/quarters` `{"name":"Período sin inicio 2","sequenceNumber":1,"endDate":"2026-06-30"}` (endDate only — the mirror of ii) | `HTTP 400`, same body |
| **R3** (iii) | `POST /api/quarters` `{"name":"Período sin nada","sequenceNumber":1}` | `HTTP 400`, same body |
| **R3** (iii-b) | `POST /api/quarters` `{"name":"Período nulls","sequenceNumber":1,"startDate":null,"endDate":null}` (explicit nulls) | `HTTP 400`, same body |
| **R3** (no row created) | `SELECT count(*) FROM quarters WHERE name LIKE 'Período%';` after all five POSTs above | `0` — none of the rejected requests created a row |
| **R3** (service layer) | `create`'s `assertValidDates(range)` (`src/services/quarter.service.ts`, in `create`, immediately after the `range` literal) | Code-path-verified only: over HTTP the controller guard always fires first, so this line is unreachable from the API by construction. Its twin in `update` **is** exercised live (see R4 (v)/(v-b) below) — it is the same one-line helper call, so the helper's behavior is proven live; what is not separately observable is `create`'s call site being reached. It exists for non-HTTP callers per `design.md`'s discarded alternative #2 |
| **R4** (iv) | `PUT /api/quarters/9` `{"startDate":null}` (id=9 persisted `startDate=2026-05-04`) | `HTTP 400` `{"error":"El período debe tener fecha de inicio y fecha de fin."}`; follow-up `GET /api/quarters` shows id=9 still `startDate: '2026-05-04'`, `endDate: '2026-08-07'`, and `SELECT … WHERE id=9` shows `updated_at` unchanged (`2026-08-29 08:20:08.830041+00`, i.e. from before this session) |
| **R4** (iv-b) | `PUT /api/quarters/9` `{"endDate":null}` | `HTTP 400`, same body; row unchanged |
| **R4** (v) | `PUT /api/quarters/97` `{"name":"Nuevo nombre"}` against a legacy row seeded via `psql` (`Legado T6`, seq 61, both dates NULL, active) — body omits both dates, so the **controller** guard (`=== null`) deliberately lets it through and the **service** post-merge `assertValidDates` rejects it | `HTTP 400` `{"error":"El período debe tener fecha de inicio y fecha de fin."}`; DB row unchanged (`name='Legado T6'`, seq 61, both dates NULL, `is_active=t`, `deleted_at` NULL) |
| **R4** (v-b) | `PUT /api/quarters/97` `{"endDate":"2026-12-31"}` on the same legacy row (post-merge `startDate` still null) | `HTTP 400`, same body; row unchanged — confirms the check is on the **post-merge** state, not on the request body |
| **R4** (v-c, positive) | `PUT /api/quarters/97` `{"name":"Legado Reparado","startDate":"2027-02-25","endDate":"2027-03-05"}` (legacy row with **both** dates supplied) | `HTTP 200`, body `{"id":97,…,"name":"Legado Reparado","startDate":"2027-02-25","endDate":"2027-03-05"}` — a legacy row is still repairable in one call, i.e. the new rule does not lock an institution out (`design.md` discarded alternative #4) |
| **R5** (order, service) | `POST /api/quarters` `{"name":"   ","sequenceNumber":62,"startDate":"2027-01-05","endDate":"2027-01-06"}` (bad name, both dates present so the controller guard does not fire) | `HTTP 400` `{"error":"El nombre del período no puede estar vacío"}` — `assertValidName` still runs **before** `assertValidDates` inside the service, exactly as R5 specifies |
| **R5** (order, dates before range/overlap) | `PUT /api/quarters/97` `{"name":"Legado Reparado","startDate":"2026-12-01","endDate":"2026-12-20"}` (both dates present, overlapping `Tercer Trimestre`) | `HTTP 400` `{"error":"Las fechas se solapan con Tercer Trimestre (2026-11-09 a 2027-02-24)"}` — `assertValidDates` passed and `assertNoOverlap` fired next, i.e. the date-presence check sits **before** the range/overlap checks, not after |
| **R5** (order, controller first) | `POST /api/quarters` `{"name":"   ","sequenceNumber":62}` (bad name **and** no dates) | `HTTP 400` `{"error":"El período debe tener fecha de inicio y fecha de fin."}` — the controller guard runs before `svc.create`, so when both are invalid the date message wins. This matches R5's explicit statement that the controller check "runs immediately after `requirePermission` and before `svc.create`", i.e. outside the service chain. See "Behavior change worth flagging" below |
| **R6** | `GET /api/quarters` (with `Authorization` + `X-Institution-Id: 2`) | `HTTP 200`, 5 rows at the time of the check, keys exactly `['academicYearId','createdAt','deletedAt','description','endDate','id','institutionId','isActive','name','sequenceNumber','startDate','updatedAt']` — `startDate`/`endDate` present and unrenamed, no rejection on the basis of any quarter's dates. Sample: `(2,'Segundo Trimestre','2026-08-11','2026-11-06')`, `(9,'Primer Trimestre','2026-05-04','2026-08-07')` |
| **R7** | `GET /api/export/excel?course_ids=1&academic_year_id=1&date_from=2026-05-04&date_to=2026-08-07` | `HTTP 200 type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet size=142713`; `file /tmp/out.xlsx` → `Microsoft Excel 2007+` |
| **R7** (with quarter selection) | `GET /api/export/excel?course_ids=1&academic_year_id=1&date_from=2026-08-11&date_to=2026-11-06&quarter_id=2` | `HTTP 200 type=…spreadsheetml.sheet size=139802` — the feature-2 `quarter_id` path is unaffected too |
| **R8** (i)(ii)(iii) | see R3 rows (i), (ii), (ii-b), (iii), (iii-b) above | all `400`, no rows created |
| **R8** (iv) | see R4 rows (iv), (iv-b) above | `400`, `startDate` unchanged on disk |
| **R8** (v) | see R4 rows (v), (v-b) above | `400`, legacy row unchanged on disk |
| **R8** (vi) non-regression: successful create (feature 3's R5) | `POST /api/quarters` `{"name":"Periodo Puente","sequenceNumber":1,"startDate":"2026-08-08","endDate":"2026-08-10"}` | `HTTP 201` `{"id":98,…,"name":"Periodo Puente","sequenceNumber":1,"startDate":"2026-08-08","endDate":"2026-08-10","isActive":true}` |
| **R8** (vi) non-regression: empty name (feature 3's R6) | `POST /api/quarters` `{"name":"   ",…,"startDate":"2027-01-05","endDate":"2027-01-06"}` | `HTTP 400` `{"error":"El nombre del período no puede estar vacío"}` — unchanged (the original feature-3 case sent no dates; see "Behavior change worth flagging") |
| **R8** (vi) non-regression: overlap (feature 3's R14) | `POST /api/quarters` `{"name":"Solapado","sequenceNumber":63,"startDate":"2026-08-01","endDate":"2026-08-15"}` | `HTTP 400` `{"error":"Las fechas se solapan con Segundo Trimestre (2026-08-11 a 2026-11-06)"}` — identical to feature 3's recorded result |
| **R8** (vi) non-regression: rename + resequence + redate (feature 3's R15/R16) | `PUT /api/quarters/98` `{"name":"Periodo Puente Renombrado","sequenceNumber":64,"startDate":"2026-08-08","endDate":"2026-08-09"}` | `HTTP 200` with all four fields persisted in the response body |
| **R8** (vi) non-regression: PUT that omits both dates on a fully-dated row | `PUT /api/quarters/98` `{"description":"solo descripcion"}` | `HTTP 200` — the post-merge check does **not** break partial updates of already-valid rows |
| **R8** (vii) | see R1 / R2 rows above (mixed fixture: dated id=9 + null-dated id=96, migration applied twice) | post-condition `0`; `name`/`sequence_number`/`academic_year_id` preserved on the soft-deleted row; only `deleted_at` and `is_active` changed |
| **R9** | `./node_modules/.bin/tsc -p tsconfig.json` (= `pnpm run build`) | exit `0`, no diagnostics |

### Test data cleanup

Rows created during the smoke run were soft-deleted through the API at the end
(`DELETE /api/quarters/97` → `204`, `DELETE /api/quarters/98` → `204`). id=96 was soft-deleted by
the migration itself (that was the point of the fixture). Final state of institution 2 / AY 1:

```
 id |       name        | start_date |  end_date
----+-------------------+------------+------------
  2 | Segundo Trimestre | 2026-08-11 | 2026-11-06
  3 | Tercer Trimestre  | 2026-11-09 | 2027-02-24
  9 | Primer Trimestre  | 2026-05-04 | 2026-08-07
(3 rows)
```

`SELECT count(*) … WHERE deleted_at IS NULL AND (start_date IS NULL OR end_date IS NULL)` → `0`
after cleanup as well.

## Behavior change worth flagging

Feature 3's recorded R6 smoke test was `POST /api/quarters {"name":"   "}` — no dates — and it
returned `{"error":"El nombre del período no puede estar vacío"}`. With this feature, that exact
request now returns `{"error":"El período debe tener fecha de inicio y fecha de fin."}` (verified
live, see the R5 "controller first" row), because the controller guard runs before `svc.create`.
The name validation itself is unchanged and still fires first *within* the service (verified live
with the same bad name plus valid dates). This is a direct, unavoidable consequence of the
approved design (`design.md`'s "Controller" section places the guard before `svc.create`) and of
R5's own wording, not a deviation — but it is a user-visible message change for the
"everything is wrong at once" case, so it is called out here rather than buried.

## Deviations from `design.md`

None. The migration SQL, the helper, its two call sites and both controller guards match
`design.md`'s snippets verbatim (the only textual difference is that the controller guards are
written on one line each instead of wrapped over three, matching the surrounding controller's
column-aligned single-line style — same expression, same throw shape).

## Follow-ups (not in scope, no code written)

1. **`seedQuarters()` still creates null-dated rows.** `src/services/quarter.service.ts#seedQuarters`
   (called from `academic-year.service.ts#create`) inserts 3 quarters with
   `startDate: null, endDate: null` for every newly created academic year. So R2's invariant
   ("zero active quarters with a null date") holds at migration time but is re-broken by the next
   academic year created through the UI — and those seeded rows then cannot be renamed until both
   dates are supplied in the same `PUT` (which does work — see the R4 (v-c) positive case, so no
   one is locked out). No `R<n>` in the approved spec covers `seedQuarters`, and changing it
   (either seeding dates or seeding zero quarters) is a product decision with frontend
   consequences, so nothing was changed here. **This is the most likely next feature.**
2. **`../postgres/19_quarters_softdelete_legacy_null_dates.sql` is not mounted in
   `docker-compose.yml`'s `docker-entrypoint-initdb.d`** — the same drift features 1 and 3 already
   flagged for `17_`/`18_`. A fresh `docker volume rm` + `up` would not apply it. Out of scope.
3. **A bodyless `POST /api/quarters` (no `Content-Type`, no body) returns `500`
   `{"error":"Cannot read properties of undefined (reading 'startDate')"}`.** This is
   pre-existing, project-wide Express 5 behavior (`req.body` stays `undefined` when no body parser
   matches), not introduced here: the control check `POST /api/students` with no body — an
   untouched controller — returns `500 {"error":"Cannot read properties of undefined (reading
   'name')"}`. Before this change the same quarters request produced the identical 500 from
   `assertValidName(data.name)`; only the property named in the message moved. A project-wide
   `req.body ?? {}` normalization (or a body-required guard in middleware) would fix all
   controllers at once; doing it in this one controller only would be scope drift.
4. **No automated tests** — `docs/verification.md` and `docs/conventions.md` both state no
   framework is configured and `verify_command` is intentionally empty. The table above is manual
   evidence, and every `R<n>` except the `create`-side service call site (noted explicitly in the
   R3 "service layer" row) is backed by an observed live response.

## State of the repo

`git status` in `backend/` shows this feature's changes on top of features 2/3/4's still-uncommitted
work: modified `src/controllers/quarter.controller.ts`, `src/services/quarter.service.ts`,
new `../postgres/19_quarters_softdelete_legacy_null_dates.sql`,
new `progress/impl_backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados.md`,
and `specs/backend_rechaza…/tasks.md` with T1–T8 checked off. No debug statements, no TODOs, no
temporary files left behind; the two smoke-test rows were soft-deleted through the API.
