# Tasks — Load and display existing evidence when editing a citation

Work top-to-bottom. Backend feature `citation_attachments_retrieval` (#13 in `attendance_backend`) is
already `done`/`approved` and requires no changes — `GET /api/citations` already returns each citation's
`attachments` array in the shape this feature consumes (see `design.md`).

## `core/models/index.ts`

- [x] T1 (R1) Add the `CitationAttachment` interface (`id`, `fileName`, `originalName`, `mimeType`,
      `url`, `createdAt`), placed next to the `Citation`/`CitationRosterRow` block.
- [x] T2 (R2) Add `attachments: CitationAttachment[]` to the `Citation` interface.

## `features/citations/citation-dialog.component.ts` — existing-evidence state

- [x] T3 (R4) Add `existingAttachments = signal<CitationAttachment[]>(this.data.citation?.attachments ?? [])`
      and `removingAttachmentId = signal<number | null>(null)`, seeded synchronously (no `ngOnInit`
      fetch).
- [x] T4 (R3) Confirm `pendingFiles` staging/upload/removal (`onFilesSelected`, `removeFile`,
      `previewUrl`, the existing `save()` upload step) is untouched — no behavior change, only additive
      code around it.

## `features/citations/citation-dialog.component.ts` — rendering existing evidence

- [x] T5 (R5, R6, R7, R8) Add the existing-evidence template block (per `design.md`'s snippet): a
      `section-label` ("Evidencia") + `evidence-row` rendered only `@if (existingAttachments().length)`,
      one tile per entry (image tile for `mimeType.startsWith('image/')`, doc tile with `originalName`
      otherwise), each wrapped in `<a [href]="a.url" target="_blank">`, with its own remove `<button>`
      distinct from the `pendingFiles` row's. In create mode (`data.citation` absent),
      `existingAttachments()` is always `[]`, so the block naturally renders nothing (R5) — no extra
      `isEdit` guard needed.
- [x] T6 Load the `frontend-design` skill before finalizing this block's spacing/typography, per
      `docs/architecture.md`'s "Design Workflow" (mandatory for any `template`/`styles` touch in this
      file).

## `features/citations/citation-dialog.component.ts` — removing an existing attachment

- [x] T7 (R9, R14) Implement `removeExistingAttachment(att: CitationAttachment)`: open
      `ConfirmDialogComponent` first; a falsy/`undefined` `afterClosed()` result is a no-op, nothing
      sent, list unchanged.
- [x] T8 (R10, R11) On confirmation, set `removingAttachmentId.set(att.id)` and send `DELETE
      /api/citations/:id/attachments/:attachmentId` (citation id from `this.data.citation!.id`,
      attachment id from `att.id`); bind each tile's remove `<button [disabled]>` to
      `removingAttachmentId() === a.id`.
- [x] T9 (R12) On success: `existingAttachments.update(list => list.filter(a => a.id !== att.id))`,
      also filter `this.data.citation!.attachments` in place (per `design.md`'s consistency note), and
      `NotificationService.success('Evidencia eliminada')` — dialog stays open (no `dialogRef.close(...)`
      call here).
- [x] T10 (R13) On failure: `NotificationService.error(err?.error?.error ?? 'No se pudo eliminar la
      evidencia')`, leave `existingAttachments` unchanged.
- [x] T11 Reset `removingAttachmentId.set(null)` in a `finally` block covering both T9 and T10.

## Build & verification

- [x] T12 (R15) Run `pnpm run build` and confirm it exits `0` with zero new errors.
- [x] T13 (R4, R5, R6, R7, R9, R10, R11, R12, R13, R14, R16) Manual smoke against `docker compose up -d
      --build frontend` (or an already-running stack), documented in
      `progress/impl_citation_evidence_reload.md`:
      1. Log in with a role that has the `citations` module key; navigate to `/inspectors/citations`,
         pick a course/enrollment with an existing citation that already has evidence attached (create
         one via the existing "Agregar citación" flow with 1-2 files if none exists yet).
      2. Click that citation's pill to open it in edit mode; confirm the previously uploaded evidence
         is visible as tiles above the "Adjuntar evidencia" zone, and each tile opens the file in a new
         tab when clicked.
      3. Click an existing tile's remove control; confirm a confirmation prompt appears; cancel it and
         confirm the tile is still present and no request was sent (Network tab).
      4. Click the same tile's remove control again and confirm; confirm a success toast, the tile
         disappears, and the dialog stays open.
      5. Close and reopen the same citation's pill (without navigating away); confirm the removed
         attachment does not reappear.
      6. Open a citation that has never had evidence attached; confirm no existing-evidence tiles
         render and no console error appears.
      7. Open the "Agregar citación" flow (create mode) for a student; confirm no existing-evidence
         block renders (there is nothing to load yet).
