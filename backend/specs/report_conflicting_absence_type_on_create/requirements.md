# Requirements — Reportar conflicto de tipo al crear ausencias en un rango

Scope: backend-only (`attendance_backend`). `createRange` (`src/services/absence.service.ts`),
exposed as `POST /api/absences` (`src/controllers/absence.controller.ts`), currently returns
`{ created: number; skipped: number }`. It lumps two very different situations into the same
`skipped` count: (a) the date already has an active absence of the **same** `type` the caller just
requested (idempotent no-op), and (b) the date already has an active absence of a **different**
`type` (a real conflict — the `UNIQUE(enrollment_id, date)` constraint on `absences` means the
caller cannot create the second type without first deleting the first). Today's caller (the
frontend) has no way to tell these apart from the response alone, so it cannot warn the user that
they must delete the existing record before registering a different type on that date.

This spec adds a per-date detail array to the response so callers can distinguish the two cases,
without changing the existing `created`/`skipped` top-level semantics (no regression for existing
consumers that only read those two fields).

Acceptance-criterion mapping (every bullet from the feature description is satisfied by at least
one `R<n>` below; every `R<n>` below cites the acceptance bullet it satisfies):

- "`created`/`skipped` keep their current semantics" → **R1, R2, R7**
- "add per-date detail with the existing `type` for each skipped date" → **R3, R4, R5, R6**
- "tests cover same-type vs different-type cases" → **R8** (manual smoke test, documented in
  `progress/impl_report_conflicting_absence_type_on_create.md` — this project has no automated
  test framework yet; see `docs/verification.md`, and the same convention already used by
  `specs/backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados/`)
- (implicit, from "the response of `POST /api/absences` needs to be extended") → **R9** build check

## R1
The system SHALL continue to compute the `created` field of `createRange`'s return value exactly
as today: the count of business days in `[dateFrom, dateTo]` for which an `absences` row was
either newly inserted or restored from a prior soft-delete.

## R2
The system SHALL continue to compute the `skipped` field of `createRange`'s return value exactly
as today: the count of business days in `[dateFrom, dateTo]` for which an active (non-soft-deleted)
`absences` row already existed for the requested `enrollmentId`, regardless of whether that row's
`type` matches the requested `type`.

## R3
WHEN `createRange` skips a business day because an active `absences` row already exists for that
`enrollmentId`/date with `type` equal to the requested `type`, the system SHALL include one entry
for that date in the return value's `skippedDetails` array with `date` set to that date (ISO
`YYYY-MM-DD` string), `existingType` set to the existing row's `type`, and `conflict` set to
`false`.

## R4
WHEN `createRange` skips a business day because an active `absences` row already exists for that
`enrollmentId`/date with `type` different from the requested `type`, the system SHALL include one
entry for that date in the return value's `skippedDetails` array with `date` set to that date
(ISO `YYYY-MM-DD` string), `existingType` set to the existing row's `type`, and `conflict` set to
`true`.

## R5
The system SHALL ensure `skippedDetails.length` is always exactly equal to the `skipped` field's
value, and every date present in `skippedDetails` SHALL be one of the dates counted by `skipped`
(no more, no fewer) — i.e. `skippedDetails` is the itemized breakdown of exactly the same set of
dates `skipped` counts, never a superset or subset.

## R6
The system SHALL order `skippedDetails` entries by ascending `date` (matching the existing
chronological order `businessDaysInRange` already produces for the day list).

## R7
IF no business day in `[dateFrom, dateTo]` is skipped THEN the system SHALL return `skippedDetails`
as an empty array (`[]`), not `null`/`undefined`, and `skipped` SHALL be `0` — matching today's
already-existing behavior for the `skipped` count, now made explicit for `skippedDetails` too.

## R8
WHEN the implementation of R3/R4 is complete, the system SHALL be verified by a manual smoke test
documented in `progress/impl_report_conflicting_absence_type_on_create.md`, covering at minimum:
(i) a date already marked with the SAME `type` as requested → that date appears in
`skippedDetails` with `conflict: false` and the correct `existingType`; (ii) a date already marked
with a DIFFERENT `type` than requested (F vs AT or AT vs F) → that date appears in
`skippedDetails` with `conflict: true` and the correct `existingType`; (iii) a date range mixing
new dates, a same-type-skip date, and a different-type-skip date in one call → `created`,
`skipped`, and `skippedDetails` are all mutually consistent per R1–R6; (iv) a date that was
previously soft-deleted for the same `enrollmentId` and is now being re-created (the existing
restore path) → that date SHALL NOT appear in `skippedDetails` and SHALL count toward `created`,
not `skipped` (no regression to the restore path). Each case's actual request/response SHALL be
captured verbatim in that file's Traceability section.

## R9
WHEN the implementation is complete, the system SHALL compile under `pnpm run build` with exit
code 0 and SHALL introduce no new TypeScript errors attributable to `src/services/absence.service.ts`
or `src/controllers/absence.controller.ts`.
