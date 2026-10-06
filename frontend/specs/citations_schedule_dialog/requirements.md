# Requirements — Citation schedule/edit dialog ("Agendar citación")

Context: frontend feature `citations_listing_page` (#20 in the harness) shipped `CitationsComponent`
with a stubbed `openCitationEditor(row, citation?)` — a `TODO(feature #21 citations_schedule_dialog)`
that shows an info toast and neither navigates nor mutates data — plus a local
`CITATION_WHATSAPP_TEMPLATE` constant in `notifyGuardian`, whose migration to
`NotificationTemplateService` was explicitly deferred to this feature (see that feature's `design.md`,
"Discarded alternatives" #1). Feature #20 is now merged to `staging` (PR #103,
`023d991`) — `CitationsComponent`, `CitationHistoryDialogComponent`, `Citation`, and
`CitationRosterRow` are present in the working tree and this feature builds directly on them, no merge
step needed first. This feature replaces the stub with a real create/edit dialog
(`CitationDialogComponent`) and completes the deferred WhatsApp-template migration. Backend features
`citation_reasons_management` (#9) and `citations_crud_and_attachments` (#10 in the backend harness)
are already implemented and merged — `GET/POST/PUT /api/citations`, `PUT /api/citations/:id/close`,
`POST /api/citations/:id/attachments`, and `GET /api/citation-reasons` all exist today with the
contracts referenced below (see those features' `src/controllers/citation*.controller.ts` /
`src/services/citation*.service.ts`). No backend change is needed for this feature's own scope — the
backend's `NOTIFICATION_ACTION_KEYS` already whitelists `'citations'` (`src/services/user.service.ts`).
A separate backend feature ("List existing attachments for a citation", Notion page
`3d2def9a-37cd-818a-8acc-e0695e9a6cc0`, predicted name `list_existing_attachments_for_a_citation` once
imported into the backend harness) has been requested to expose `GET /api/citations/:id/attachments`
so a future feature can let this dialog's edit mode show previously-uploaded evidence — it does not
block this feature (see `design.md`'s "Discarded alternatives" #2).

## Opening the dialog

## R1
WHEN the user clicks a roster row's "Agregar citación" button in `CitationsComponent`, the system
SHALL open `CitationDialogComponent` in create mode (no `citation` in its dialog data) for that row's
`enrollmentId`.

## R2
WHEN the user clicks an existing citation pill in `CitationsComponent`, the system SHALL open
`CitationDialogComponent` in edit mode, pre-filling the form's `dateFrom`, `dateTo`, `time`,
`observations`, and `reasonIds` from the clicked citation.

## R3
WHILE `CitationDialogComponent` is open in create mode AND the triggering row's `citations` array
(already loaded by `CitationsComponent`, no new HTTP request) contains at least one citation with
`status` `pending`, the system SHALL display a warning banner listing each such pending citation's
date range and time before the form fields.

## R4
WHILE `CitationDialogComponent` is open in create mode AND the triggering row's `citations` array
contains no citation with `status` `pending`, the system SHALL NOT display the warning banner.

## R5
WHILE `CitationDialogComponent` is open in edit mode, the system SHALL NOT display the pending-citations
warning banner, regardless of the row's other citations.

## R6
The system SHALL show the dialog title "Agendar citación" in create mode and "Editar citación" in edit
mode.

## Form fields

## R7
The system SHALL render a "Desde"/"Hasta" date-picker pair (mirroring
`AbsenceRangeDialogComponent`'s `matDatepicker` pattern) bound to the form's `dateFrom`/`dateTo`
fields, both defaulting to the current date in create mode and to the edited citation's `dateFrom`/
`dateTo` in edit mode.

## R8
The system SHALL render a time input bound to the form's `time` field, optional (may be left blank),
defaulting to the edited citation's `time` in edit mode.

## R9
WHEN `CitationDialogComponent` opens, the system SHALL fetch citation reasons via `GET
/api/citation-reasons` and render them as multi-select options, each visually colored per its
`severity` using `CITATION_REASON_SEVERITY_OPTIONS`/`citationReasonSeverityBadgeClass` from
`shared/utils/citation-reason.util.ts` (the same lookup feature `citations_admin_reasons` (#19)
introduced — no parallel severity system).

## R10
The system SHALL render a multi-select control bound to the form's `reasonIds`, pre-selected with the
edited citation's `reasonIds` in edit mode and empty in create mode.

## R11
The system SHALL render an observations textarea bound to the form's `observations` field, empty in
create mode and pre-filled with the edited citation's `observations` in edit mode.

## Evidence upload

## R12
The system SHALL allow staging evidence files for upload via a file input, reusing
`JustificationCreateDialogComponent`'s allowed-MIME-type list (`image/jpeg`, `image/png`,
`image/webp`, `application/pdf`, `application/msword`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`).

## R13
IF a selected file's MIME type is not in R12's allowed list THEN the system SHALL reject it with a
`NotificationService.warning` and SHALL NOT add it to the staged list.

## R14
IF a selected file exceeds 8MB THEN the system SHALL reject it with a `NotificationService.warning`
and SHALL NOT add it to the staged list.

## R15
IF adding newly selected files would bring the staged list above 5 files total THEN the system SHALL
cap the staged list at 5 files, discarding the excess beyond the cap.

## R16
The system SHALL allow removing a staged evidence file, before save, via a remove control on that
file's tile.

## Save — validation and submission

## R17
IF the form's `reasonIds` selection is empty THEN the system SHALL disable the "Guardar" button and
SHALL NOT send any HTTP request when it would otherwise be clicked.

## R18
IF the form's `dateFrom` is after `dateTo` THEN the system SHALL disable the "Guardar" button and
SHALL NOT send any HTTP request when it would otherwise be clicked.

## R19
WHEN the user clicks an enabled "Guardar" button in create mode, the system SHALL send `POST
/api/citations` with `enrollmentId`, `dateFrom`, `dateTo`, `time` (`null` when blank), `observations`
(`null` when blank), and `reasonIds`.

## R20
WHEN the user clicks an enabled "Guardar" button in edit mode, the system SHALL send `PUT
/api/citations/:id` (the edited citation's `id`) with the same fields as R19.

## R21
WHEN R19's or R20's request succeeds AND at least one evidence file is staged, the system SHALL
upload the staged files as a single multipart `POST /api/citations/:id/attachments` request (using
the newly created citation's `id` in create mode, or the edited citation's `id` in edit mode),
retrying up to 2 additional times on failure (mirroring `JustificationCreateDialogComponent`'s
`retry({ count: 2, delay: 2000 })`).

## R22
IF R19's or R20's request fails THEN the system SHALL notify the user via `NotificationService.error`
and SHALL NOT close the dialog.

## R23
IF R21's attachment upload fails after exhausting retries THEN the system SHALL notify the user via
`NotificationService.warning` that the citation was saved but the evidence upload failed, and SHALL
still close the dialog with a truthy result.

## R24
WHEN R19's or R20's request succeeds AND (no file is staged OR R21 completes, whether it succeeds or
exhausts retries per R23), the system SHALL close the dialog with a truthy result.

## R25
WHILE a save (R19/R20) or close (R29/R30) request is in flight, the system SHALL disable the dialog's
"Guardar" and "Cerrar citación" buttons to prevent duplicate submissions.

## Close citation

## R26
WHERE `CitationDialogComponent` is in edit mode AND the edited citation's `status` is `pending`, the
system SHALL render a "Cerrar citación" button.

## R27
WHERE `CitationDialogComponent` is in edit mode AND the edited citation's `status` is `closed`, the
system SHALL NOT render the "Cerrar citación" button.

## R28
WHERE `CitationDialogComponent` is in create mode, the system SHALL NOT render the "Cerrar citación"
button.

## R29
WHEN the user clicks an enabled "Cerrar citación" button, the system SHALL open
`ConfirmDialogComponent` (the same shared component `CitationsComponent`'s own delete action uses)
asking the user to confirm closing the citation, and SHALL NOT send any HTTP request until that
confirmation is accepted.

## R30
WHEN the confirmation dialog opened by R29 is confirmed, the system SHALL send `PUT
/api/citations/:id/close` for the edited citation.

## R31
IF the confirmation dialog opened by R29 is cancelled or dismissed THEN the system SHALL NOT send any
HTTP request, and `CitationDialogComponent` SHALL remain open, unchanged.

## R32
WHEN R30's request succeeds, the system SHALL close `CitationDialogComponent` with a truthy result.

## R33
IF R30's request fails THEN the system SHALL notify the user via `NotificationService.error` and
SHALL NOT close `CitationDialogComponent`.

## Wiring into `CitationsComponent`

## R34
The system SHALL replace `CitationsComponent`'s stubbed `openCitationEditor` method (the
`TODO(feature #21...)` body) with logic that opens `CitationDialogComponent` per R1/R2, passing the
triggering row's pending citations (R3/R4) and the clicked citation (R2), if any.

## R35
WHEN `CitationDialogComponent`'s `afterClosed()` emits a truthy value, `CitationsComponent` SHALL
reload the roster via its existing `loadRoster()` method.

## R36
WHEN `CitationDialogComponent`'s `afterClosed()` emits a falsy value, `CitationsComponent` SHALL NOT
reload the roster.

## WhatsApp template migration (completing feature #20's deferral)

## R37
The system SHALL remove `CitationsComponent`'s local `CITATION_WHATSAPP_TEMPLATE` constant and its
use in `notifyGuardian`, replacing the message text with
`this.templateService.getTemplate('citations')`, substituting the same `{{nombre}}`/`{{fecha}}`
placeholders as before.

## R38
The system SHALL add a `citations` entry to `NotificationTemplateService`'s `DEFAULT_TEMPLATES` map
(using the same `{{nombre}}`/`{{fecha}}` placeholder pair R37 substitutes), so `getTemplate('citations')`
never returns an empty string for a user who has not customized it.

## R39
The system SHALL add a `citations` entry to `profile-dialog.component.ts`'s
`NOTIFICATION_TEMPLATE_SECTIONS`, with `placeholders: ['{{nombre}}', '{{fecha}}']`, so users can
customize their own citation WhatsApp template from the profile dialog, mirroring the existing
`absences` entry's shape.

## Build & verification

## R40
The system SHALL compile with zero new TypeScript errors introduced by this feature (`pnpm run build`
exits `0`).

## R41
The system SHALL be manually smoke-tested (per `docs/verification.md`'s Level 3) against `docker
compose up -d --build frontend` (or an already-running stack), covering: creating a citation with and
without evidence and with the pending-citations banner visible; editing an existing pending citation's
fields and reasons; closing a pending citation via the dialog, confirming the confirmation prompt
appears and cancelling it leaves the citation open, then confirming it and checking the "Cerrar
citación" button disappears once closed; and confirming a WhatsApp notification uses the
profile-configured `citations` template. The steps and outcome SHALL be recorded in
`progress/impl_citations_schedule_dialog.md`.
