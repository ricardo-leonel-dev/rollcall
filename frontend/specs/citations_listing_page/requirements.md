# Requirements — Citations listing page (roster + pills + actions column)

Scope: **frontend-only** (`attendance_frontend`). Files affected: `src/app/core/models/index.ts`,
`src/app/app.routes.ts`, `src/app/core/nav-items.ts`, a new
`src/app/features/citations/citations.component.ts`, and a new
`src/app/features/citations/citation-history-dialog.component.ts`.

## Scope note (backend contract NOT YET APPROVED — read before reviewing)

This feature consumes `GET /api/citations` (roster mode) and `DELETE /api/citations/:id`, whose
contracts are drafted in the sibling `attendance_backend` project at
`specs/citations_crud_and_attachments/requirements.md` (feature 10, `citations_crud_and_attachments`),
requirements R1–R4 and R21–R22 there. That feature in turn depends on feature 9
(`citation_reasons_management`, which creates the underlying `citations` table/entity). **As of this
spec's drafting, backend feature 10's status is `spec_drafting` (not yet reviewed/approved by a
human) and backend feature 9's status is `spec_ready` (drafted, also not yet human-approved).**
The request/response shapes cited below (R1–R2 of this document) are taken directly from backend
feature 10's draft file, but they could still change before backend implementation. **A human
reviewing this frontend spec must confirm backend feature 9 has reached `approved` and backend
feature 10 has reached at least `spec_ready` — ideally `approved` — before approving this frontend
spec for implementation.** If either backend contract changes in the meantime, this spec's R1, R2,
R7, R28, and R29 must be amended to match before an `implementer` picks this feature up.

## Scope note (Citation model shape reconciliation — read before reviewing)

The harness feature card (`state/features/020-citations_listing_page.md`) describes a single flat
`Citation` interface with fields `(id, enrollmentId, dateFrom, dateTo, time, status, observations,
reasons, attachmentsCount, closedAt, studentName, rosterNumber, course, academicYear, guardianPhone,
whatsappLink)`. The backend's actual `GET /api/citations` roster-mode response (backend R1, R2) does
**not** return that shape: it returns one row per enrollment (`enrollmentId`, `rosterNumber`,
`studentName`, `guardianId`, `guardianName`, `guardianPhone`, `whatsappLink`), each carrying a nested
`citations` array whose items only have `(id, dateFrom, dateTo, time, status, observations, closedAt,
closedByUserId, createdByUserId, createdAt, reasonIds)` — no `attachmentsCount`, no per-citation
`course`/`academicYear` (those are roster-scope, not per-citation), and `reasonIds` (raw ids) rather
than resolved `reasons`. This spec models two interfaces instead of one — `Citation` (a single
citation item) and `CitationRosterRow` (an enrollment row wrapping a `Citation[]`) — matching the
real nested shape (R1, R2 below). Resolving `reasonIds` into reason names (via `GET
/api/citation-reasons`, backend feature 9 / frontend feature `citations_admin_reasons`) and
`attachmentsCount` are explicitly **out of scope** for this feature (see `design.md`'s discarded
alternatives) — pills and the history dialog show only the fields the roster-mode response actually
provides.

## Scope note (create/edit dialog deferred to feature #21)

Per the feature card, the full citation create/edit dialog belongs to a later feature,
`citations_schedule_dialog` (#21). This feature only wires the "add citation" icon-button and
individual-pill click to a stub handler (R20, R23) that does nothing destructive — no HTTP request,
no navigation, no data mutation — so that feature #21 can later replace the stub body without
touching this feature's row-rendering or other action wiring.

## Data model

## R1
The system SHALL declare a `Citation` interface in `core/models/index.ts` with fields `id: number`,
`dateFrom: string`, `dateTo: string`, `time: string | null`, `status: 'pending' | 'closed'`,
`observations: string | null`, `closedAt: string | null`, `closedByUserId: number | null`,
`createdByUserId: number`, `createdAt: string`, and `reasonIds: number[]`, matching the per-citation
item shape returned by `GET /api/citations` (backend R2).

## R2
The system SHALL declare a `CitationRosterRow` interface in `core/models/index.ts` with fields
`enrollmentId: number`, `rosterNumber: number | null`, `studentName: string`, `guardianId: number |
null`, `guardianName: string | null`, `guardianPhone: string | null`, `whatsappLink: string | null`,
and `citations: Citation[]`, matching the per-row shape returned by `GET /api/citations` in roster
mode (backend R1, R2).

## Routing / nav wiring

## R3
The system SHALL replace `app.routes.ts`'s `inspectors/citations` placeholder entry with
`loadComponent: () => import('./features/citations/citations.component').then(m =>
m.CitationsComponent)`, `canActivate: [moduleGuard]`, and `data: { module: 'citations' }`, mirroring
the sibling `inspectors/absences` route entry.

## R4
The system SHALL update `nav-items.ts`'s `inspectors` section's existing `/inspectors/citations`
subnav row to drop `placeholder: true` and add `moduleKey: 'citations'`.

## R5
The system SHALL add a top-level `citations` node (label `'Citaciones'`) to `nav-items.ts`'s
`MODULE_TREE` and a matching `{ key: 'citations', label: 'Citaciones' }` entry to `MODULE_KEYS`,
sibling to the existing `justifications`/`student-report` entries — without this, no admin could
grant a non-superadmin/rector-tier user access to the new module via
`UserPermissionsDialogComponent`, and `moduleGuard` would block every such user from `/inspectors/citations`.

## Data loading — courses / roster

## R6
WHEN `CitationsComponent` initializes, the system SHALL send `GET /api/courses` and store the result
for the course `mat-select`, mirroring `AbsencesComponent.ngOnInit`.

## R7
WHEN the user selects a course via the course `mat-select` while `AcademicYearContextService.selected()`
is non-null, the system SHALL send `GET /api/citations?course_id=<courseId>&academic_year_id=<academicYearId>`
and store the resulting `CitationRosterRow[]`.

## R8
WHILE no course is selected, the system SHALL render an empty-state prompting the user to select a
course (mirroring `AbsencesComponent`'s Manual-tab "Selecciona un curso" empty state) and SHALL NOT
send `GET /api/citations`.

## R9
WHILE the roster request (R7) is in flight, the system SHALL render a loading spinner and SHALL NOT
render the data-table.

## R10
IF the `GET /api/citations` request (R7) fails, the system SHALL notify the user via
`NotificationService.error` (using the backend's error message when present, falling back to a
generic message) and SHALL render an empty roster rather than leaving a perpetual spinner.

## Header — student count + search

## R11
WHILE a course's roster is loaded, the system SHALL render a header row showing `"<N> estudiantes"`
when the search term is blank, or `"<M> de <N>"` when it is not, mirroring
`AbsencesComponent`'s Manual-tab count header, together with a `.manual-search` input bound to a
local search term.

## R12
WHILE the `.manual-search` input holds a non-blank value, the system SHALL render only roster rows
whose `studentName` contains that value (case-insensitive), filtered client-side without a new API
call.

## Quarter-scoping of pills

## R13
WHEN `CitationsComponent` initializes and `QuarterContextService`'s default quarter has both
`startDate` and `endDate` set, the system SHALL apply that quarter's `[startDate, endDate]` range as
the initial pill-visibility scope, mirroring `AbsencesComponent.applyDefaultQuarter`.

## R14
WHERE the default quarter is unavailable, or is available but missing `startDate`/`endDate`, at
`CitationsComponent` initialization, the system SHALL leave the pill-visibility scope unset (showing
every citation regardless of date, per R16).

## R15
WHEN `app-quarter-selector` emits a quarter with both `startDate` and `endDate` set, the system SHALL
update the pill-visibility scope to that quarter's `[startDate, endDate]` range.

## R16
WHILE a pill-visibility scope `[start, end]` is active, the system SHALL, within a roster row's
"Citaciones el:" column, render only that row's citations whose `dateFrom` falls within `[start,
end]` inclusive; WHILE no scope is active, the system SHALL render every citation in that row.

## Data table & pills

## R17
The system SHALL render the loaded, filtered (R12) roster as a `.data-table` with exactly one row
per `CitationRosterRow`, with columns "Estudiante", "Citaciones el:", and "Acciones".

## R18
WHILE a roster row's scoped citations (R16) list is empty, the system SHALL render an em dash `—` in
that row's "Citaciones el:" cell instead of any pill.

## R19
For each of a roster row's scoped citations (R16), the system SHALL render one pill using
`class="badge"` with inline `style="background:#fef9c3;color:#92400e"` when that citation's `status`
is `'pending'`, or `style="background:#f1f5f9;color:#64748b"` when it is `'closed'` — mirroring
`AbsencesComponent`'s existing voice-log-history "Pendiente"/"Descartado" status badges — labeled
with the citation's `dateFrom` (and `" – " + dateTo` appended when `dateTo` differs from `dateFrom`).

## R20
WHEN the user clicks an individual citation pill, the system SHALL invoke a stub handler (a `TODO`
for feature #21's create/edit dialog) that sends no HTTP request and mutates no row's data, without
disabling or otherwise altering that row's other action buttons.

## Target-citation resolution (WhatsApp / delete)

## R21
The system SHALL resolve a roster row's target citation as: the first citation in that row's
(server-ordered, `dateFrom` descending per backend R2) `citations` array with `status === 'pending'`;
WHERE no citation in that row has `status === 'pending'`, the row's `citations[0]` (its most recent
citation).

## R22
WHERE a roster row's `citations` array is empty, the system SHALL treat that row as having no
resolvable target citation.

## Add-citation action

## R23
The system SHALL render an "add citation" icon-button in every roster row's "Acciones" column; WHEN
clicked, the system SHALL invoke a stub handler (a `TODO` for feature #21's create dialog) that sends
no HTTP request.

## WhatsApp action

## R24
The system SHALL render a WhatsApp icon-button in a roster row's "Acciones" column only WHEN that row
has both a non-null `whatsappLink` and a resolvable target citation (R21, R22); otherwise the button
SHALL NOT be rendered.

## R25
WHEN the WhatsApp button is clicked and the resolved target citation's `status` is `'pending'`, the
system SHALL open `${whatsappLink}?text=<encoded message>` in a new browser tab, where the message is
built from a citation-specific local template substituting the student's name and the target
citation's date (and `time`, when present) — mirroring
`AbsencesComponent.notifyGuardian`'s placeholder-substitution mechanics.

## R26
WHEN the WhatsApp button is clicked and the resolved target citation's `status` is `'closed'`, the
system SHALL open the row's `whatsappLink` directly, with no prefilled message text — mirroring
`AbsencesComponent.notifyGuardian`'s `isJustified` branch.

## Delete action

## R27
The system SHALL render a delete icon-button in a roster row's "Acciones" column only WHEN that row
has a resolvable target citation (R21, R22); otherwise the button SHALL NOT be rendered.

## R28
WHEN the delete button is clicked, the system SHALL open `ConfirmDialogComponent` and SHALL NOT send
any request until the user confirms.

## R29
WHEN the delete confirmation (R28) is accepted, the system SHALL send `DELETE
/api/citations/:id` for the resolved target citation's `id`, and on a successful response SHALL
reload that course's roster (R7).

## R30
IF the `DELETE` request (R29) fails, the system SHALL notify the user via `NotificationService.error`
and SHALL NOT assume the citation was removed — the roster/pill SHALL NOT be optimistically updated
before the request succeeds.

## "Ver historial completo"

## R31
The system SHALL render a `mat-menu` "more actions" trigger in every roster row's "Acciones" column
containing a single "Ver historial completo" menu item.

## R32
WHEN "Ver historial completo" is clicked, the system SHALL open a dialog listing every citation in
that row's full (unscoped by R13–R16) `citations` array — including closed citations — reusing the
already-loaded roster data, with no additional HTTP request.

## R33
WHILE a roster row's `citations` array is empty, the "Ver historial completo" dialog (R32) SHALL
render an empty-state message instead of an empty list/table.

## Build & verification

## R34
The system SHALL compile with zero new TypeScript/template errors introduced by this feature
(`pnpm run build` exits `0`).

## R35
Per `docs/verification.md`, this project has no automated test suite — verification SHALL be manual
against the running stack (`docker compose up -d --build frontend`), covering: navigating to
`/inspectors/citations` as a role with the `citations` module key and confirming access, and as a
role without it and confirming redirect to `/home`; selecting a course and confirming the roster
loads with correct pill counts/styling for a student with both pending and closed citations;
confirming the quarter selector changes which pills render; confirming the WhatsApp button is hidden
for a student with no guardian phone; confirming the delete button removes the resolved citation
after confirmation; and confirming "Ver historial completo" lists every citation for a student
regardless of the active quarter scope.
