# Tasks — Citation schedule/edit dialog ("Agendar citación")

Work top-to-bottom. Feature `citations_listing_page` (#20) is already merged to `staging` —
`CitationsComponent`, `CitationHistoryDialogComponent`, `Citation`, and `CitationRosterRow` are
prerequisites this feature builds on and are already present in the working tree (see `design.md`'s
"Dependency on feature #20").

## `core/services/notification-template.service.ts`

- [x] T1 (R38) Add a `citations` entry to `DEFAULT_TEMPLATES`, using the exact string feature #20
      hardcoded in `CITATION_WHATSAPP_TEMPLATE` (see `design.md`).

## `shared/components/profile-dialog/profile-dialog.component.ts`

- [x] T2 (R39) Add a `citations` entry to `NOTIFICATION_TEMPLATE_SECTIONS`, after the existing
      `absences` entry, per `design.md`'s exact object literal.

## `features/citations/citation-dialog.component.ts` — new file

- [x] T3 (R6) Create `CitationDialogComponent` + `CitationDialogData`/result-`boolean` skeleton:
      standalone, `OnPush`, dialog title switching on `isEdit = !!data.citation`.
- [x] T4 (R7, R8) Template: `matDatepicker` "Desde"/"Hasta" pair (mirroring
      `AbsenceRangeDialogComponent`) and a time input, both seeded from `data.citation` in edit mode
      and defaulting to today (dates) / blank (time) in create mode.
- [x] T5 (R9, R10) `ngOnInit`: fetch `GET /api/citation-reasons` into a `reasons` signal
      (`NotificationService.error` on failure, per `design.md`'s exceptions section); render a
      `mat-select multiple` bound to `reasonIds`, each option showing the reason's name plus a
      `citationReasonSeverityBadgeClass(r.severity)` badge, pre-selected from `data.citation.reasonIds`
      in edit mode.
- [x] T6 (R11) Observations textarea bound to `observations`, seeded from `data.citation.observations`
      in edit mode.
- [x] T7 (R3, R4, R5) Pending-citations warning banner: `@if (!isEdit && data.pendingCitations.length)`,
      one row per pending citation showing its date range and time, styled per `design.md`'s "Visual
      direction" (pending-pill palette).
- [x] T8 (R12, R13, R14, R15, R16) Evidence staging: file input + `evidence-zone`/`evidence-row`/
      `evidence-tile` markup and `onFilesSelected`/`removeFile`/`rotationFor`/`previewUrl` methods
      copied from `JustificationCreateDialogComponent`, operating on a flat `pendingFiles: File[]`
      (no per-step grouping — this dialog has exactly one citation, not one per week).
- [x] T9 (R17, R18) Implement the `canSave` getter (`reasonIds.length > 0 && dateFrom <= dateTo`) and
      bind it to the "Guardar" button's `[disabled]` (combined with `saving()`).
- [x] T10 (R19, R20, R21, R22, R23, R24, R25) Implement `save()` per `design.md`'s method body:
      `POST`/`PUT` per mode, attachment upload with `retry({ count: 2, delay: 2000 })` when files are
      staged, success/failure notifications, `saving` signal guarding both buttons, `dialogRef.close(true)`
      on success (including the R23 partial-evidence-failure case).
- [x] T11 (R25, R26, R27, R28, R29, R30, R31, R32, R33) Implement the "Cerrar citación" button (`@if
      (isEdit && data.citation!.status === 'pending')`, `[disabled]="saving()"`) and `closeCitation()`
      per `design.md`'s "Cerrar citación confirmation": open `ConfirmDialogComponent` first (R29);
      only on its `afterClosed()` resolving `true` send `PUT /api/citations/:id/close` (R30) — a
      `false`/dismissed result is a no-op, dialog stays open (R31); success closes
      `CitationDialogComponent` `true` (R32); failure notifies and stays open (R33).

## `features/citations/citations.component.ts`

- [x] T12 (R34) Import `CitationDialogComponent`/`CitationDialogData`; replace the stubbed
      `openCitationEditor` body with the `dialog.open(...)` call from `design.md`, passing
      `pendingCitations: citation ? [] : row.citations.filter(c => c.status === 'pending')`.
- [x] T13 (R35, R36) Subscribe to `afterClosed()`; reload via `this.loadRoster()` only when the
      emitted value is truthy.
- [x] T14 (R37) Remove the `CITATION_WHATSAPP_TEMPLATE` field entirely; update `notifyGuardian`'s
      message construction to `this.templateService.getTemplate('citations')`.

## Build & verification

- [x] T15 (R40) Run `pnpm run build` and confirm it exits `0` with zero new errors.
- [x] T16 (R1, R2, R3, R4, R5, R9, R10, R17, R18, R19, R20, R21, R26, R27, R29, R30, R31, R32, R37,
      R41) Manual smoke against `docker compose up -d --build frontend` (or an already-running
      stack), documented in `progress/impl_citations_schedule_dialog.md`:
      1. Log in with a role that has the `citations` module key; navigate to
         `/inspectors/citations`, pick a course with at least one enrollment.
      2. Click "Agregar citación" for a student with no existing citations; confirm no warning
         banner appears; pick a date range, a time, at least one reason (confirm severity coloring
         matches the admin tab), write observations, attach 1-2 evidence files, save; confirm a
         success toast, the dialog closes, and a new pending pill appears in the roster row.
      3. Click "Agregar citación" again for the same student; confirm the warning banner now lists
         the just-created pending citation.
      4. Click that pending pill; confirm the dialog opens in edit mode pre-filled with the same
         values, and the "Cerrar citación" button is visible; change the reasons/date range, save;
         confirm the pill's label updates in the roster.
      5. Re-open the same citation and click "Cerrar citación"; confirm a confirmation prompt
         appears; cancel it and confirm the citation dialog is still open, unchanged, and no request
         was sent (Network tab); click "Cerrar citación" again and confirm the prompt this time;
         confirm a success toast, the dialog closes, the pill switches to the closed style, and
         re-opening it via the pill no longer shows a "Cerrar citación" button.
      6. Attempt to save with no reason selected, and with `dateFrom` after `dateTo`; confirm
         "Guardar" stays disabled in both cases (Network tab shows no request).
      7. Open the profile dialog, confirm a "Citaciones (WhatsApp)" template section is present and
         editable; customize it, save, then trigger "Notificar por WhatsApp" from the roster and
         confirm the opened message uses the customized text.
