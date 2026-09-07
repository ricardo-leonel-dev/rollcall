# Requirements — Load and display existing evidence when editing a citation

Context: `citation-dialog.component.ts` (feature `citations_schedule_dialog`, #21, already `done`) lets
a user stage and upload evidence files (`pendingFiles: File[]`) when creating or editing a citation, but
it never fetches or renders evidence that was **already uploaded** in a previous session — that
feature's own `design.md` explicitly deferred this ("Discarded alternatives" #2) because, at the time,
none of `GET /api/citations`'s response shapes included an `attachments` field, so the dialog had no way
to know what evidence already existed. Backend feature `citation_attachments_retrieval` (#13 in
`attendance_backend`, already `done` and `approved`) closed that gap: both `GET
/api/citations?enrollment_id=<id>` and `GET /api/citations?course_id=<id>&academic_year_id=<id>` now
include, on every citation object, an `attachments` array (`id`, `fileName`, `originalName`, `mimeType`,
`createdAt`, `url`, always `[]` rather than `null`/omitted when empty). The `Citation`
interface in `core/models/index.ts` has not been updated to reflect this yet, and
`CitationDialogComponent` still only ever renders `pendingFiles` — so today, reopening a citation that
already has evidence shows an empty evidence area, making the previously uploaded files appear to have
disappeared. This feature closes that gap: it adds the `attachments` field to the frontend model, loads
and displays a citation's existing evidence when the edit dialog opens, and lets the user remove an
existing attachment via the already-existing `DELETE /api/citations/:id/attachments/:attachmentId`
endpoint (introduced by `citations_crud_and_attachments`, #10 in `attendance_backend`, already `done`).

No backend change is in scope — `citation_attachments_retrieval` already ships the exact response shape
this feature consumes (verified directly against `attendance_backend`'s
`specs/citation_attachments_retrieval/{requirements,design}.md` and `src/services/citation.service.ts`
in the sibling worktree).

Two related surfaces are explicitly **out of scope** for this feature — see "Open Questions" below and
`design.md`'s "Discarded alternatives":
- `CitationHistoryDialogComponent` (the read-only "Ver historial" dialog) does not render attachments
  either, but a user can already reach any citation's evidence — pending or closed — by clicking its
  pill in `CitationsComponent`, which opens `CitationDialogComponent` in edit mode regardless of
  `status` (confirmed: `onPillClick` does not filter by `status`, and the "Cerrar citación" button is
  the only element in that dialog gated on `status === 'pending'`).
- Staging, uploading, and removing not-yet-saved evidence (`pendingFiles`) is unchanged — this feature
  only adds handling for evidence that is already persisted on the server.

## Model

## R1
The system SHALL declare a `CitationAttachment` interface in `core/models/index.ts` with fields `id`
(`number`), `fileName` (`string`), `originalName` (`string`), `mimeType` (`string`), `url` (`string`),
and `createdAt` (`string`), matching the shape `GET /api/citations` already returns for each citation's
`attachments` entries.

## R2
The system SHALL add an `attachments: CitationAttachment[]` field to the `Citation` interface.

## R3
The system SHALL NOT alter the existing behavior of staging, uploading, or removing not-yet-saved
evidence files (`pendingFiles`) in `CitationDialogComponent` — this feature only adds handling for
already-persisted attachments alongside it.

## Loading and displaying existing evidence

## R4
WHEN `CitationDialogComponent` opens in edit mode (`data.citation` is set), the system SHALL initialize
its existing-evidence list from `data.citation.attachments`, without sending any additional HTTP
request.

## R5
WHERE `CitationDialogComponent` is in create mode (`data.citation` is absent), the system SHALL NOT
render any existing-evidence tile.

## R6
WHILE `CitationDialogComponent`'s existing-evidence list is non-empty, the system SHALL render one tile
per entry: an image preview for entries whose `mimeType` starts with `image/`, and a document icon plus
`originalName` for every other entry — mirroring `justifications.component.ts`'s existing
`j.attachments` rendering.

## R7
WHILE `CitationDialogComponent`'s existing-evidence list is non-empty, the system SHALL render each
tile as a link to that attachment's `url`, opening in a new tab, so the user can actually view the file
(mirroring `justifications.component.ts`'s `<a [href]="a.url" target="_blank">` tiles) — a plain
non-interactive tile would show that evidence exists without letting the user open it.

## R8
The system SHALL render a distinct remove control on each existing-evidence tile, visually and
behaviorally separate from the remove control already used for `pendingFiles` tiles (R3).

## Removing an existing attachment

## R9
WHEN the user activates an existing-evidence tile's remove control, the system SHALL open
`ConfirmDialogComponent` asking the user to confirm the deletion, and SHALL NOT send any HTTP request
until that confirmation is accepted — mirroring this same file's `closeCitation()` confirmation pattern
for its other irreversible, already-persisted action.

## R10
WHEN the confirmation opened by R9 is accepted, the system SHALL send `DELETE
/api/citations/:id/attachments/:attachmentId` for the citation being edited and the tapped attachment's
`id`.

## R11
WHILE R10's request is in flight for a given attachment, the system SHALL disable that attachment's
remove control, to prevent duplicate delete requests for the same attachment.

## R12
WHEN R10's request succeeds, the system SHALL remove that attachment from the existing-evidence list
(its tile disappears) and SHALL notify the user via `NotificationService.success`, without closing
`CitationDialogComponent`.

## R13
IF R10's request fails THEN the system SHALL notify the user via `NotificationService.error` and SHALL
leave the existing-evidence list unchanged (the tile stays visible and its remove control re-enabled).

## R14
IF the confirmation opened by R9 is cancelled or dismissed THEN the system SHALL NOT send any HTTP
request, and the existing-evidence list SHALL remain unchanged.

## Build & verification

## R15
The system SHALL compile with zero new TypeScript errors introduced by this feature (`pnpm run build`
exits `0`).

## R16
The system SHALL be manually smoke-tested per `docs/verification.md`'s Level 3, covering: opening the
edit dialog for a citation that already has evidence and confirming the previously uploaded files are
visible and openable; removing an existing attachment and confirming it disappears after confirming the
prompt, and stays after cancelling the prompt; and confirming a citation with no evidence still opens
its edit dialog without a console error or an empty-tile placeholder. The steps and outcome SHALL be
recorded in `progress/impl_citation_evidence_reload.md`.

## Decisions (confirmed by Ricardo 2026-09-06)

1. Confirmation before deleting an existing attachment (R9): **confirmed as assumed** — yes, reuse
   `ConfirmDialogComponent`.
2. `CitationHistoryDialogComponent` staying untouched: **confirmed** — should not be included in this
   feature's scope.

## Open Questions (resolved, kept for context)

These were the default assumptions this spec's `R9`/design already committed to, flagged because the
acceptance criteria given for this feature didn't settle them and no existing precedent in this
codebase fully disambiguated either — both are now confirmed above:

1. **Confirmation before deleting an existing attachment (R9).** The acceptance criteria says only
   "User can remove an existing attachment reusing the existing DELETE endpoint" — it does not say
   whether that removal needs a confirmation step. This spec assumes **yes** (mirroring
   `closeCitation()` in this same file and `justifications.component.ts`'s equivalent
   `removeAttachment`, both of which confirm before an irreversible, already-persisted deletion). If a
   one-click removal (matching how `pendingFiles` tiles are removed today, no confirmation) is actually
   wanted instead, R9/R14 and their corresponding tasks would need to change.
2. **`CitationHistoryDialogComponent` stays untouched.** This spec deliberately does not add evidence
   rendering to the read-only "Ver historial" dialog, reasoning that any citation's evidence — pending
   or closed — is already reachable by clicking its pill (which opens the edit dialog regardless of
   `status`). If the history dialog is meant to show evidence too (e.g. for a workflow where users
   browse history without wanting to open a full edit form per citation), that is a small addition on
   top of this feature's `CitationAttachment` model change, but it is not included here — please
   confirm this is acceptable scope, or ask for it to be folded in.
