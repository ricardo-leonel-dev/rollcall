# Requirements — Citations: single date + required time in schedule dialog and listing

Context: backend feature `citation_guardian_conflict_validation` (#15, already merged to `staging`,
already present in this monorepo's `backend/` worktree) collapsed `citations.date_from`/`date_to` into
a single `citations.date` column, made `citations.time` `NOT NULL`, and added `citations.guardian_id`
(a snapshot of the enrollment's guardian at the time the citation was created/edited, never re-resolved
on update — see `backend/specs/citation_guardian_conflict_validation/design.md`). The live backend
service (`backend/src/services/citation.service.ts`, confirmed by direct read) now:

- Returns every citation with `date` (not `dateFrom`/`dateTo`) and `guardianId` fields — see
  `CITATION_FIELDS_SQL` in that file.
- Rejects `POST /api/citations` with `400` when `date`, `time`, or the target enrollment's
  `guardian_id` is missing/null.
- Rejects `PUT /api/citations/:id` with `400` when `time` is explicitly cleared, or when the target
  citation's own stored `guardianId` is `null` (a historical row that predates this rule).
- Accepts `{ enrollmentId, date, time, observations?, reasonIds }` on create and
  `{ date?, time?, observations?, reasonIds? }` on update — there is no `dateFrom`/`dateTo` key
  anywhere in the contract anymore.

The frontend has not been updated to match. Today `core/models/index.ts`'s `Citation` interface still
declares `dateFrom`/`dateTo` and a nullable `time`; `CitationDialogComponent` renders two date-pickers
("Desde"/"Hasta") and an optional time field, and its `save()` posts a `dateFrom`/`dateTo` payload that
no longer matches the live backend's accepted body shape at all (the backend would respond `400` for
missing `date` on every save attempt today). `CitationsComponent` and `CitationHistoryDialogComponent`
also read `c.dateFrom`/`c.dateTo` directly, and `shared/utils/citation-date.util.ts` (from
`citation_date_format_and_label`, #27, already merged) formats a `(dateFrom, dateTo, time)` triple with
an explicit multi-day-range branch that can never be exercised anymore.

This feature updates the frontend model, the schedule dialog (create/edit), the roster listing, and the
history dialog to the collapsed single-`date` + mandatory-`time` model, and simplifies
`citation-date.util.ts` accordingly (see "Design decision" below and the open question in
"Out of scope / open questions").

## Model

## R1
The system SHALL replace the `Citation` interface's `dateFrom: string` and `dateTo: string` fields in
`core/models/index.ts` with a single `date: string` field.

## R2
The system SHALL change the `Citation` interface's `time` field in `core/models/index.ts` from
`string | null` to `string` (non-nullable), matching the backend's `NOT NULL` constraint.

## R3
The system SHALL add a `guardianId: number | null` field to the `Citation` interface in
`core/models/index.ts`, matching the `guardianId` key the backend now includes on every citation row
(the historical-guardian snapshot; `null` on rows that predate this backend rule).

## `citation-date.util.ts` — single-date formatting

## R4
The system SHALL change `formatCitationDateLabel`'s signature in `shared/utils/citation-date.util.ts`
from `(dateFrom: string, dateTo: string, time: string | null)` to `(date: string, time: string)`, and
SHALL remove the function's multi-day-range branch (the `dateFrom !== dateTo` case), since the
collapsed backend model has no date range to express.

## R5
The system SHALL change `formatCitationDateLabelShort`'s signature in the same file from
`(dateFrom: string, dateTo: string, time: string | null)` to `(date: string, time: string)`, and SHALL
remove its multi-day-range branch, for the same reason as R4.

## R6
WHEN `formatCitationDateLabel` is called with a `date`, the system SHALL return
`"Agendado el {weekday} {day} de {month} del {year}"` followed by `" a las {hh}:{mm} {AM|PM}"` (the
12-hour, zero-padded, uppercase-suffix time conversion already established by `citation_date_format_and_label`'s R3), where `{weekday}`/`{month}` are the full lowercase Spanish names and
`{day}`/`{year}` are computed from `date`. The time suffix SHALL always be appended (no null-time
branch), since the model's `time` is always present.

## R7
WHEN `formatCitationDateLabelShort` is called with a `date`, the system SHALL return
`"{weekday} {day} de {month} del {year}"` followed by the same `" a las {hh}:{mm} {AM|PM}"` suffix as
R6, always appended.

## Schedule dialog — single date field

## R8
WHEN `CitationDialogComponent` is opened (create or edit), the system SHALL render exactly one
date-picker field labeled `"Fecha"`, replacing the existing "Desde"/"Hasta" two-picker row and its
"Agendar entre" section heading.

## R9
WHEN `CitationDialogComponent` is opened, the system SHALL render the time input's `mat-label` as
`"Hora"` (removing the previous `"(opcional)"` suffix), reflecting that a citation can no longer be
saved without a time.

## R10
The system SHALL compute `CitationDialogComponent.canSave` as `true` only when: at least one reason is
selected, the date field is non-null, and the time field is a non-empty string — removing the previous
`dateToDateString(dateFrom) <= dateToDateString(dateTo)` range comparison, which no longer applies to a
single date.

## R11
WHEN the user clicks "Guardar" while `canSave` is `true`, the system SHALL send a request body
containing `date` (the single date field, formatted via the existing `dateToDateString` utility) and
`time` (the raw non-empty `HH:MM` string) to `POST /api/citations` (create) or
`PUT /api/citations/:id` (edit), and that body SHALL NOT contain a `dateFrom` or `dateTo` key.

## R12
WHEN `CitationDialogComponent`'s pending-citations warning banner renders a citation's date/time, the
system SHALL call `formatCitationDateLabel(c.date, c.time)` (R4's single-date signature) in place of
the previous 3-argument call.

## Guardianless citations (backend R9/R11 alignment)

## R13
WHEN `CitationDialogComponent` is opened in edit mode for a citation whose `guardianId` is `null`, the
system SHALL render a visible warning explaining that the citation has no representative on file and
cannot be saved, and SHALL keep the "Guardar" button disabled regardless of the reason/date/time field
values (the backend rejects this case with `400` unconditionally — see backend R11).

## Listing and history — single-date rendering

## R14
The system SHALL update `CitationsComponent.scopedCitations()`'s quarter-range filter to compare
`c.date` against the selected quarter's `startDate`/`endDate`, in place of the previous `c.dateFrom`
comparison.

## R15
The system SHALL update `CitationsComponent.pillLabel()` to call
`formatCitationDateLabelShort(c.date, c.time)` (R5's single-date signature) in place of the previous
3-argument call.

## R16
The system SHALL update `CitationsComponent.notifyGuardian()`'s `{{fecha}}` replacement text to be
built via `formatCitationDateLabelShort(target.date, target.time)`, in place of the previous
`formatCitationDateLabelShort(target.dateFrom, target.dateFrom, target.time)` call.

## R17
The system SHALL update `CitationHistoryDialogComponent`'s history-row date label to call
`formatCitationDateLabel(c.date, c.time)` (R4's single-date signature) in place of the previous
3-argument call.

## Build & verification

## R18
The system SHALL compile with zero new TypeScript errors introduced by this feature (`pnpm run build`
exits `0`).

## R19
The system SHALL be manually smoke-tested (per `docs/verification.md`'s Level 3) covering at minimum:
creating a new citation with a date and a time (inspecting the Network tab request body for `date`/
`time` keys and the absence of `dateFrom`/`dateTo`); confirming "Guardar" stays disabled while the time
field is empty; editing an existing citation's date; the disabled "Guardar" button (with warning) when
editing a historical citation whose own `guardianId` is `null`; **triggering a backend `409` by
scheduling two citations for the same enrollment with overlapping dates/times (e.g. the same date and
times within 10 minutes apart)** and confirming the existing generic-error toast surfaces the backend's
plain error message (`"Ya existe una citación pendiente para este representante en un horario cercano"`)
readably, without any inline rendering of the redacted `conflict` object's fields (that richer
treatment is owned by `citation_overlap_conflict_ui` #25). The steps and outcomes SHALL be recorded in
`progress/impl_citations_single_date_and_required_time_in_schedule_dialog_and_listing.md`.

## R20
The system SHALL be visually smoke-tested (per `docs/verification.md`'s Level 4,
`VISUAL_FEATURE=citations_single_date_and_required_time_in_schedule_dialog_and_listing node
scripts/visual-smoke.mjs`), after updating `scripts/visual-smoke.mjs`'s `/api/citations` fixture
citations to the new `date`/`guardianId`-bearing shape (dropping `dateFrom`/`dateTo`), and the resulting
screenshot SHALL show the roster pills rendering the short-form single-date label with no console
errors.

## Decisions (confirmed by Ricardo 2026-09-06)

1. **Boundary with `citation_overlap_conflict_ui` (#25) — option (b) adopted.** This feature (#28)
   leaves the existing generic `409` catch/toast untouched (`NotificationService.error(err?.error?.error)`),
   AND R19 adds an explicit smoke step that triggers a `409` by scheduling two citations for the same
   enrollment with overlapping dates/times within 10 minutes, confirming the toast surfaces the
   backend's plain error message (`"Ya existe una citación pendiente para este representante en un
   horario cercano"`) readably, without any inline rendering of the redacted `conflict` object's
   fields — that richer treatment is owned by #25 (pending, unclaimed).
2. **Proactive guardianless-row/citation disabling — option (c) adopted.** Keep R13 (edit-mode warning
   banner + permanently disabled "Guardar" when the citation's own `guardianId === null`), and drop
   R14 (the roster-row "Agregar citación" disabled button with tooltip). The dialog-side warning is
   the higher-value intervention (user has already invested in filling the dialog); the roster-side
   button can be added later if/when needed. The original R14 text and T14 are removed from this spec;
   the rest of the file's R/T numbering is contiguous as a result.

## Out of scope / notes for future specs

3. **`citations_listing_group_by_student` (#26, pending, unclaimed, no spec yet).** This spec renames
   the fields `CitationsComponent.scopedCitations()`/`pillLabel()`/`notifyGuardian()` read from
   `Citation`. Whoever specs/implements #26 later will need to build against this feature's renamed
   `date`/`guardianId` fields, not the old `dateFrom`/`dateTo` — noting this so #26's eventual spec
   author doesn't draft against stale field names.
