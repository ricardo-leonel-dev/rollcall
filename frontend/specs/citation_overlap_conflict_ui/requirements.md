# Requirements — Readable conflict message in the citation dialog

Scope: **frontend-only** (`attendance_frontend`). Only
`src/app/features/citations/citation-dialog.component.ts` is affected. No backend or
`excel-service` change is in scope.

## Backend dependency reassessment (read before the rest of this file)

The harness feature description (`state/features/025-citation_overlap_conflict_ui.md`) names the
backend feature as `citation_date_overlap_validation`. That feature has since been **superseded**
by `citation_guardian_conflict_validation` (already shipped on this branch — see
`../backend/specs/citation_guardian_conflict_validation/`, commit `5cb1ca3`). The conflict this
feature must surface is no longer "overlapping date ranges for the same enrollment" — it is "the
same representative (`guardian_id`) already has another `pending` citation on the same `date`
within 10 minutes of the requested `time`" (see that spec's R11–R18). Concretely, `POST
/api/citations` and `PUT /api/citations/:id` respond `409` with body:

```json
{ "error": "Ya existe una citación pendiente para este representante en un horario cercano",
  "conflict": { "id": 9, "date": "2026-09-07", "time": "07:55",
                "studentName": "...", "guardianName": "...", "guardianPhone": "...", "courseName": "..." } }
```

`studentName`/`guardianName`/`guardianPhone`/`courseName` are present only when the caller's
`req.courseIds === null` (institution-wide scope: rector, admin, general inspector); a
course-scoped caller (teacher, block inspector) receives only `id`/`date`/`time` in `conflict`
(privacy redaction, per that spec's R18). This spec's requirements below are written against that
shipped contract, not the superseded date-range one.

## Acceptance-criterion mapping

Every bullet from `state/features/025-citation_overlap_conflict_ui.md` is satisfied by at least
one `R<n>` below:

- "A 409/conflict response renders as a readable message identifying the conflicting citation
  (date, time, student, representative)" → **R1, R3, R4, R5, R6**
- "Form data already entered is preserved when the conflict message appears" → **R2**

## Why this differs from the `absences` conflict precedent (read before design.md)

`AbsenceSaveResultDialogComponent` (features 12/14/16) shows conflicts **after** a save request
has already partially succeeded (some rows created, some skipped) — it is a post-save summary
dialog, and its "Editar inasistencia" deep-link works because the conflicting absence is always
the *same enrollment*, *same day*, just a different `type`. Here the 409 is thrown **before**
anything is persisted — `create()`/`update()` reject the whole request, nothing is saved, and the
conflicting citation may belong to a **different student** (a guardian can have several children)
and a **different course/academic year** than the one currently open. There is no post-save
"summary" to show, and no single existing screen the conflicting citation could always be safely
opened in. Consequently this feature keeps the citation dialog open and shows an inline message
inside it, rather than opening a second dialog or navigating away — see requirements below and
design.md's discarded alternatives for the full reasoning.

## Conflict detection (AC1)

## R1
WHEN `save()`'s `POST /api/citations` or `PUT /api/citations/:id` request fails with an HTTP `409`
response whose body has a `conflict` property, the system SHALL treat it as a scheduling conflict,
distinct from every other error `save()` can receive (validation `400`s, `404`s, network errors,
`409`s without a `conflict` property such as a raw duplicate-key error).

## R2
WHEN a scheduling conflict is detected per R1, the system SHALL NOT call `dialogRef.close(...)`
and SHALL NOT reset, clear, or otherwise mutate the form's current `date`, `time`, `observations`,
`reasonIds`, `pendingFiles`, or `existingAttachments` values — the user's already-entered data
SHALL remain exactly as it was immediately before the failed save attempt.

## Rendering the conflict message (AC1)

## R3
WHEN a scheduling conflict is detected per R1, the system SHALL render, inside the citation
dialog's content (not as a separate `MatDialog` and not as a `NotificationService` toast), a
banner whose heading text is the response body's `error` string.

## R4
The conflict banner SHALL include a line identifying the conflicting citation's date and time,
formatted using the existing `formatCitationDateLabelShort` utility
(`shared/utils/citation-date.util.ts`) called with `conflict.date` and `conflict.time`.

## R5
WHERE the response body's `conflict` object includes `studentName`, `guardianName`,
`guardianPhone`, and/or `courseName` (the institution-wide-scope shape), the conflict banner SHALL
display each of those fields that is present.

## R6
WHERE the response body's `conflict` object does not include `studentName`, `guardianName`,
`guardianPhone`, or `courseName` (the course-scoped-caller redaction shape — only `id`, `date`,
`time` are present), the conflict banner SHALL display only the date/time line from R4 and SHALL
NOT render empty labels, placeholder text (e.g. "—", "Sin datos"), or `undefined`/`null` literals
for the missing fields.

## Non-conflict errors are unaffected (isolation)

## R7
IF `save()`'s request fails with any error that is not a scheduling conflict per R1 (a `400`, a
`404`, a `409` without a `conflict` property, or a network error) THEN the system SHALL show
today's existing generic toast (`NotificationService.error(err?.error?.error ?? 'No se pudo
guardar la citación')`) and SHALL NOT render the conflict banner described in R3–R6.

## R8
WHEN a scheduling conflict is detected per R1, the system SHALL NOT additionally show the generic
toast from R7 for that same failed attempt — the conflict banner is the only feedback surfaced for
that attempt.

## Applies uniformly to create and update (AC1)

## R9
R1–R8 SHALL apply identically regardless of whether `save()` is creating a new citation
(`POST /api/citations`, `this.isEdit === false`) or updating an existing one
(`PUT /api/citations/:id`, `this.isEdit === true`) — both branches share the same catch-block
handling, with no behavioral difference between them.

## Conflict banner lifecycle (supports AC1's "readable" + re-attempt flow)

## R10
WHEN the user invokes `save()` again after a scheduling conflict was shown, the system SHALL clear
the previously-shown conflict banner before issuing the new request, so a stale conflict from a
prior attempt is never displayed alongside or instead of the outcome of the new attempt.

## R11
WHEN the user edits the dialog's date or time input while a conflict banner is visible, the system
SHALL clear the conflict banner immediately (without waiting for a new `save()` attempt) — editing
the very fields the conflict is about is a signal the user is trying to resolve it, and the stale
message would otherwise misleadingly imply the just-edited date/time still conflicts.

## No new navigation surface (explicit non-goal)

## R12
The system SHALL NOT navigate away from the citation dialog, open any other route, or open any
other `MatDialog` as a result of a scheduling conflict — R2 already keeps the current dialog open,
and no deep-link to view or edit the conflicting citation is introduced by this feature (see
design.md's discarded alternatives for why).

## Build & verification (AC1, AC2)

## R13
The implementer SHALL run `pnpm run build` (or `./node_modules/.bin/tsc` if `pnpm` is not on
`PATH`) and confirm it exits `0`, since `tsconfig.json` is `strict: true`. Per
`docs/conventions.md` "Tests", this project has no automated test suite — verification SHALL be
manual against the running stack (`docker compose up -d --build frontend`), covering at minimum:
(i) as an institution-wide-scope user (rector/admin/general inspector), create a citation, then
attempt to create a second citation for the same representative on the same date within 10 minutes
→ conflict banner shows date/time/student/representative/course, dialog stays open, entered
fields are unchanged, no toast appears; (ii) same scenario but the second attempt uses a date/time
10+ minutes apart → the citation saves successfully; (iii) as a course-scoped user (teacher/block
inspector), trigger the same conflict → banner shows only date/time, no student/representative/
course fields, no empty placeholders; (iv) after a conflict is shown, edit the time field →
banner disappears; (v) after a conflict is shown, click Save again without changing anything →
banner is cleared and re-shown consistently (not duplicated); (vi) a non-conflict failure (e.g.
disconnect the network or trigger a `400`) still shows the pre-existing generic toast, no banner.
