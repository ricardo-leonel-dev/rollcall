# Requirements — Backend rechaza trimestres sin fecha de inicio o fin + migración de datos legados

Scope: backend-only (`attendance_backend`), plus a SQL migration applied to the shared Postgres
schema. The frontend dialog `frontend/src/app/features/admin/quarters-dialog.component.ts` already
client-side rejects an "open-ended" period (sibling feature `require_full_dates_on_quarters` —
see `/home/rileo/ai-personal/frontend/specs/require_full_dates_on_quarters/`). This feature is the
server-side mirror: any direct API caller (curl, future internal consumer, the legacy import script
that still ships nullable dates) cannot bypass the dialog's invariant.

Two prerequisites, in order: **A0** — resolve every pre-existing row whose `start_date` or
`end_date` is null (otherwise the new validation in A1/A2 would refuse to save those rows and lock
the institution out of editing them); then **A1–A6** — enforce the invariant on `POST /api/quarters`
and `PUT /api/quarters/:id` and keep reads unchanged.

Acceptance-criterion mapping (every bullet from the feature description is satisfied by at least
one `R<n>` below; every `R<n>` below cites the acceptance bullet it satisfies):

- A0 (prerequisite migration) → **R1, R2**
- A1 (POST rejects null dates) → **R3**
- A2 (PUT rejects null dates, including clearing an existing one) → **R4**
- A3 (reads continue to work) → **R6, R7**
- A4 (validation order matches the dialog) → **R5**
- A5 (manual smoke tests cover all branches and existing create/update tests do not regress) →
  **R8**
- A6 (`pnpm build` passes green) → **R9**

## A0 — Prerequisites: data migration

## R1 [A0]
The system SHALL provide a new SQL migration named `19_quarters_softdelete_legacy_null_dates.sql`
under the monorepo-root `postgres/` directory (sibling to `17_quarters.sql` and
`18_quarters_relax_constraints.sql`), which, when applied against a database containing
non-deleted `quarters` rows with `start_date IS NULL OR end_date IS NULL`, soft-deletes every such
row by setting `deleted_at = NOW()` and `is_active = false`, leaving the rest of the row (name,
`sequence_number`, `academic_year_id`) untouched. The migration SHALL be idempotent (a second
`psql` application against an already-migrated database must produce zero row changes).

## R2 [A0]
WHEN the migration from R1 has been applied, the system SHALL satisfy
`SELECT count(*) FROM quarters WHERE deleted_at IS NULL AND (start_date IS NULL OR end_date IS
NULL);` returning the value `0`.

## A1/A2 — Server-side validation (defense-in-depth: controller + service)

## R3 [A1]
WHEN `POST /api/quarters` is called by a user whose role has `create` permission on the
`academic_years` resource, with a request body whose `startDate` is `null` or `undefined`, OR
whose `endDate` is `null` or `undefined`, THEN the system SHALL respond with HTTP 400 and an
error body containing the message `El período debe tener fecha de inicio y fecha de fin.` and
SHALL NOT create a `quarters` row. The check SHALL run both in `src/controllers/quarter.controller.ts`
(against the raw request body, so an explicit `null` is rejected before any service call) and in
`src/services/quarter.service.ts`'s `create()` (defense-in-depth, so a future non-HTTP caller that
bypasses the controller cannot reintroduce null dates either).

## R4 [A2]
WHEN `PUT /api/quarters/:id` is called by a user whose role has `update` permission on the
`academic_years` resource, targeting an existing non-deleted quarter of the requesting
institution's currently active academic year, IF the post-merge persisted state of the quarter
would have `startDate` equal to `null` (either because `data.startDate === null` was sent
explicitly, or because `data.startDate` was not sent and the existing row's `startDate` is
already `null`) OR `endDate` equal to `null` (same two cases for `endDate`), THEN the system SHALL
respond with HTTP 400 and an error body containing the message `El período debe tener fecha de
inicio y fecha de fin.` and SHALL NOT modify the `quarters` row. The check SHALL run in
`src/services/quarter.service.ts`'s `update()` against the post-merge `range`; the controller
SHALL additionally reject any request body that explicitly sends `startDate: null` or
`endDate: null` (the "client tries to clear an existing date" case), so that case never reaches
the service.

## A4 — Validation order

## R5 [A4]
The validation order for `POST /api/quarters` and `PUT /api/quarters/:id` SHALL be:
name checks (`assertValidName`) → date-presence check (R3 in `create` / R4 in `update`) →
within-academic-year range check (`assertWithinAcademicYear`) → overlap check
(`assertNoOverlap`), mirroring the order already used by the frontend dialog
`frontend/src/app/features/admin/quarters-dialog.component.ts`'s `validationErrors()` computed
(name → date-presence → start-before-end → range → pairwise overlap). The controller-level
presence check (R3/R4) runs first, before permission/auth have even completed their per-route
position — no: it runs immediately after `requirePermission` and before `svc.create`/`svc.update`,
so it sits *outside* the service's chain but *inside* the per-request auth gate.

## A3 — Reads stay working

## R6 [A3]
WHEN `GET /api/quarters` is called, the system SHALL continue to respond with HTTP 200 and the
same JSON shape it returns today, including the `startDate` and `endDate` fields of every
returned quarter, and SHALL NOT reject the call on the basis of any quarter having null dates —
reads must keep working unchanged through the migration phase.

## R7 [A3]
WHEN `GET /api/export/excel` is called, the system SHALL continue to invoke `excel-service` with
the same per-quarter data shape it consumes today, without introducing any new validation that
could reject a quarter whose `start_date`/`end_date` happen to be null.

## A5/A6 — Verification

## R8 [A5]
WHEN the implementation of R3 and R4 is complete, the system SHALL be verified by a manual smoke
test documented in
`progress/impl_backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados.md`
covering at minimum the following cases, each captured in the traceability section with the
actual request/response observed against a running stack (`docker compose up --build` per
`docs/verification.md` Level 2/3): (i) `POST /api/quarters` with no `startDate` → 400 (R3);
(ii) `POST /api/quarters` with no `endDate` → 400 (R3); (iii) `POST /api/quarters` with neither
`startDate` nor `endDate` → 400 (R3); (iv) `PUT /api/quarters/:id` with `{"startDate": null}`
against a quarter that previously had both dates set → 400 and the quarter's `startDate` is
unchanged on disk (R4); (v) `PUT /api/quarters/:id` with neither date sent against a legacy
quarter whose persisted `startDate`/`endDate` is still null → 400 (R4); (vi) the existing
`POST /api/quarters` and `PUT /api/quarters/:id` smoke tests from
`progress/impl_relax_quarter_naming_and_count_constraints.md` (R5/R6/R14/R15/R16 of that feature)
SHALL still pass unchanged. The migration in R1/R2 SHALL be verified by (vii) applying
`postgres/19_quarters_softdelete_legacy_null_dates.sql` against a database seeded with a mix of
dated and null-dated quarters, confirming the post-condition query in R2 returns 0, and
confirming that every soft-deleted quarter's `name`, `sequence_number`, and `academic_year_id`
are preserved (only `deleted_at` and `is_active` changed).

## R9 [A6]
WHEN the implementation is complete, the system SHALL compile under `pnpm run build` with exit
code 0 and SHALL introduce no new TypeScript errors attributable to the modified files.
