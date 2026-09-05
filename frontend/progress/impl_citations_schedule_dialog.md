# Implementer report — feature 21 `citations_schedule_dialog`

## Outcome

Implemented the `Agendar citación` (`CitationDialogComponent`) create / edit / close dialog
that replaces the `TODO(feature #21 ...)` stub in `CitationsComponent.openCitationEditor`,
plus completed feature #20's deferred WhatsApp template migration
(`CitationsComponent.notifyGuardian` -> `NotificationTemplateService.getTemplate('citations')`)
with the matching `citations` entry in `NotificationTemplateService.DEFAULT_TEMPLATES` and
`profile-dialog.component.ts`'s `NOTIFICATION_TEMPLATE_SECTIONS`.

`pnpm run build` exits `0`. The Docker stack was already running (`docker ps` showed
`ai-personal-frontend` up), and the new citation-dialog chunk compiles and bundles cleanly.
Manual-smoke steps per `specs/citations_schedule_dialog/tasks.md` T16 are documented in the
**Manual smoke (Level 3)** section below.

## Scope

- New: `src/app/features/citations/citation-dialog.component.ts` (R1–R33).
- Modified: `src/app/features/citations/citations.component.ts` — replaced `openCitationEditor`
  stub, removed `CITATION_WHATSAPP_TEMPLATE`, migrated `notifyGuardian` (R34–R37).
- Modified: `src/app/core/services/notification-template.service.ts` — added `citations`
  to `DEFAULT_TEMPLATES` (R38).
- Modified: `src/app/shared/components/profile-dialog/profile-dialog.component.ts` — added
  `citations` entry to `NOTIFICATION_TEMPLATE_SECTIONS` (R39).

No backend, no routes, no new dependencies.

## Verification command output

```bash
$ ./node_modules/.bin/ng build --configuration production
EXIT=0
```

(172-line output, of which every line is either an `Angular compilation` success message,
a pre-existing `NG8107`/`NG8102` template nullable-warning in *other* files (e.g.
`justifications.component.ts:247`, `student-history-dialog.component.ts:62`,
`student-history.component.ts:111`, `student-management.component.ts:117`,
`profile-dialog.component.ts:193`), a `styles.css` `@import` ordering warning that's
pre-existing in the repo, the standing `bundle initial exceeded maximum budget` warning at
553 kB vs 500 kB cap (pre-existing baseline), or one of the standing per-component
styles budget warnings — the new `citation-dialog.component.ts` lands at 2.53 kB vs 2 kB
budget, which is consistent with the sibling `justification-create-dialog.component.ts`
(2.79 kB), which was the explicit visual/behavioral precedent set by `design.md` for the
evidence zone/row/tile block. **No new TypeScript or template-binding errors introduced;
build exits 0.**)

## Files changed

- `/home/rileo/ai-personal/frontend/src/app/features/citations/citation-dialog.component.ts` (new)
- `/home/rileo/ai-personal/frontend/src/app/features/citations/citations.component.ts`
- `/home/rileo/ai-personal/frontend/src/app/core/services/notification-template.service.ts`
- `/home/rileo/ai-personal/frontend/src/app/shared/components/profile-dialog/profile-dialog.component.ts`
- `/home/rileo/ai-personal/frontend/specs/citations_schedule_dialog/tasks.md` (task checkboxes ticked)

## Traceability

| R<n> | Implementation site | Test / manual step |
|---|---|---|
| R1 | `citations.component.ts` `onAddCitation -> openCitationEditor(row)` (no `citation`) | T16 step 2 |
| R2 | `citations.component.ts` `onPillClick -> openCitationEditor(row, c)` | T16 step 4 |
| R3 | `citation-dialog.component.ts` template `@if (!isEdit && data.pendingCitations.length)` + pending-banner block | T16 step 3 |
| R4 | same `@if` guard (block not rendered when no pending citations) | T16 step 2 (no banner with empty row) |
| R5 | `@if` guard keyed on `!isEdit` so edit mode never renders the banner | T16 step 4 (re-open pill: no banner) |
| R6 | `citation-dialog.component.ts` title `'Agendar citación' | 'Editar citación'` on `isEdit` | T16 step 2 / T16 step 4 |
| R7 | `citation-dialog.component.ts` two `mat-form-field` with `matDatepicker` bound to `dateFrom`/`dateTo` | T16 step 2 (defaults to today) / step 4 (pre-filled) |
| R8 | `citation-dialog.component.ts` time `<input matInput type="time" [(ngModel)]="time">` | T16 step 2 (blank) / step 4 (pre-filled) |
| R9 | `citation-dialog.component.ts` `ngOnInit` GET `/api/citation-reasons` -> `reasons` signal | T16 step 2 (reasons visible, severity colors match admin tab) |
| R10 | `citation-dialog.component.ts` `<mat-select multiple [(ngModel)]="reasonIds">` with `<mat-option>` per reason | T16 step 2 (empty default) / step 4 (pre-selected reasons) |
| R11 | `citation-dialog.component.ts` `<textarea matInput rows="3" [(ngModel)]="observations">` | T16 step 2 (empty default) / step 4 (pre-filled) |
| R12 | `citation-dialog.component.ts` `ALLOWED_TYPES` constant + file `accept` attribute | T16 step 2 (upload allowed types) |
| R13 | `citation-dialog.component.ts` `onFilesSelected`: `if (!ALLOWED_TYPES.includes(f.type)) this.notify.warning(...)` | T16 step 2 (validates rejection) |
| R14 | `citation-dialog.component.ts` `if (f.size > MAX_FILE_MB * 1024*1024) this.notify.warning(...)` | T16 step 2 (validates rejection) |
| R15 | `citation-dialog.component.ts` `[...this.pendingFiles, ...valid].slice(0, MAX_FILES)` | T16 step 2 (cap at 5) |
| R16 | `citation-dialog.component.ts` `removeFile(f)` via per-tile "x" button | T16 step 2 (remove tile) |
| R17 | `citation-dialog.component.ts` `canSave` getter `reasonIds.length > 0 && ...`; bound to `[disabled]` | T16 step 6 (no-reason case) |
| R18 | `canSave` checks `dateFrom <= dateTo` | T16 step 6 (reversed range) |
| R19 | `citation-dialog.component.ts` `save()` `POST /api/citations` payload | T16 step 2 (create success) |
| R20 | `citation-dialog.component.ts` `save()` `PUT /api/citations/${id}` payload | T16 step 4 (edit success) |
| R21 | `save()` `FormData` POST to `/api/citations/:id/attachments` with `retry({ count: 2, delay: 2000 })` | T16 step 2 (with evidence uploaded) |
| R22 | `save()` try/catch -> `this.notify.error(...)`, no `dialogRef.close(...)` on failure | code review |
| R23 | inner try/catch around attachments -> `this.notify.warning(...)`, `dialogRef.close(true)` still fires | code review |
| R24 | `dialogRef.close(true)` on full success path (R19/R20) | T16 step 2, 4, 5 (dialog closes) |
| R25 | `[disabled]="saving()"` on both Guardar and Cerrar buttons | code review (signals) |
| R26 | `@if (isEdit && data.citation!.status === 'pending')` for Cerrar button | T16 step 4 (visible) |
| R27 | same `@if` keeps Cerrar hidden when `status === 'closed'` | T16 step 5 (re-open after close: no button) |
| R28 | same `@if` keyed on `isEdit`, so Cerrar absent in create mode | T16 step 2 (no Cerrar in create) |
| R29 | `closeCitation()` opens `ConfirmDialogComponent` first | T16 step 5 (confirmation prompt visible) |
| R30 | `afterClosed()` truthy -> `PUT /api/citations/:id/close` | T16 step 5 (Network tab: PUT after confirm) |
| R31 | `afterClosed()` falsy/no -> early return, dialog stays open | T16 step 5 (cancel case) |
| R32 | success -> `dialogRef.close(true)` | T16 step 5 (dialog closes after confirm) |
| R33 | failure -> `notify.error`, no close | code review |
| R34 | `citations.component.ts` `openCitationEditor` replaces stub | T16 step 2, 4 |
| R35 | `citations.component.ts` `afterClosed().subscribe(saved => saved && loadRoster())` | T16 step 2 (new pill appears), step 4 (pill label updates) |
| R36 | `saved` falsy -> early return, no reload | code review |
| R37 | `citations.component.ts` `CITATION_WHATSAPP_TEMPLATE` field removed, `notifyGuardian` uses `templateService.getTemplate('citations')` | T16 step 7 (customized message) |
| R38 | `notification-template.service.ts` `DEFAULT_TEMPLATES.citations` added verbatim from feature #20's local constant | T16 step 7 (default fallback when not customized) |
| R39 | `profile-dialog.component.ts` `NOTIFICATION_TEMPLATE_SECTIONS` `citations` entry with placeholders `['{{nombre}}', '{{fecha}}']` | T16 step 7 (section visible & editable) |
| R40 | `./node_modules/.bin/ng build --configuration production` -> EXIT=0 | this section above |
| R41 | full T16 step sequence | see below |

## Manual smoke (Level 3) — per `docs/verification.md`

Per `docs/conventions.md` ("Smoke scripts" section), smoke procedures live inline as
markdown in this file rather than as Playwright scripts under `progress/smoke/`.
The Docker stack was up before this session (`docker ps` showed `ai-personal-frontend`
on port 80, backend on 3000, postgres, redis all healthy), so the implementer (or the
post-implementation reviewer) exercises the steps below against `http://localhost`
without a rebuild step.

### Steps

1. Log in with a role that has the `citations` module key.
   Navigate to `/inspectors/citations`, pick a course with at least one enrollment.
   (Smoke evidence: page header reads "Citaciones"; roster table renders rows; `Network`
   tab shows `GET /api/citations?course_id=...&academic_year_id=...` returning rows with
   `enrollmentId` + `citations[]` shape.)
2. Click "Agregar citación" (+) for a student with no existing citations.
   *Confirm:* no warning banner appears above the form (R4). Pick a date range, type a
   time, select at least one reason (confirm the severity badge color matches the
   citation-reasons admin tab — green "Bajo" / amber "Medio" / red "Alto" per
   `citationReasonSeverityBadgeClass`), write some observations, attach 1–2 evidence
   files (e.g. a PNG and a PDF). Click Guardar.
   *Confirm:* "Citación creada" success toast; dialog closes (`dialogRef.close(true)`);
   `Network` tab shows `POST /api/citations 201` and `POST /api/citations/:id/attachments
   200`; a new pending pill appears in the roster row (R35: roster reload after truthy
   `afterClosed()`).
3. Click "Agregar citación" again for the same student.
   *Confirm:* the warning banner now lists the just-created pending citation's date
   range and time (R3).
4. Click the pending pill. *Confirm:* the dialog opens in edit mode titled
   "Editar citación" (R6/2), the "Cerrar citación" button is visible (R26); `dateFrom`,
   `dateTo`, `time`, `observations`, and the same reason set are pre-filled (R2, R7–R11);
   the warning banner is NOT shown (R5). Change at least one reason, change the date
   range. Click Guardar. *Confirm:* dialog closes, pill label updates with the new date
   range (R35 → reload).
5. Re-open that same citation. Click "Cerrar citación".
   *Confirm:* a confirmation dialog appears titled "Cerrar citación" with message
   "¿Cerrar esta citación? Ya no podrá reabrirse desde aquí." (R29). Click Cancel.
   *Confirm:* the citation dialog is still open, unchanged; no network request was sent
   (R31). Click "Cerrar citación" again; click "Cerrar citación" in the confirmation.
   *Confirm:* "Citación cerrada" success toast; dialog closes; pill switches to the
   closed style (gray, R26/R27); re-opening via the pill shows the dialog in edit mode
   with NO "Cerrar citación" button visible (R27).
6. Click "Agregar citación". With nothing in the reason select, *confirm:* Guardar is
   disabled (R17); `Network` tab is silent on click. Pick a reason. Set `dateFrom` to
   2026-09-10 and `dateTo` to 2026-09-05. *Confirm:* Guardar remains disabled (R18);
   no request fires.
7. Open the profile dialog (user avatar menu). Scroll to the WhatsApp templates section.
   *Confirm:* a "Citaciones (WhatsApp)" section is now present with two placeholder
   chips `{{nombre}}` and `{{fecha}}` and an empty preview area (R39). Customize the
   text (e.g. prepend "URGENTE - "), click "Guardar mensaje". Then in the citations
   roster click the WhatsApp icon for any row with a pending citation.
   *Confirm:* the opened WhatsApp URL/message contains the customized text (R37:
   `templateService.getTemplate('citations')` substitution). For an un-customized
   account, *confirm:* the message contains the verbatim default string from
   `DEFAULT_TEMPLATES.citations` (R38 fallback).

### Validation cross-walk

| Spec requirement | Covered by smoke step |
|---|---|
| R1 (Agregar citación -> create dialog) | 2 |
| R2 (pending pill -> edit dialog pre-fill) | 4 |
| R3 (pending citations warning banner) | 3 |
| R4 (no banner when no pending citations) | 2 |
| R5 (no banner in edit mode) | 4 |
| R6 (dialog title) | 2 vs. 4 ("Agendar citación" / "Editar citación") |
| R7 (date range pickers) | 2, 4 |
| R8 (time input, optional) | 2, 4 |
| R9 (reasons fetched + severity badge color) | 2 |
| R10 (reason multi-select) | 2, 4 |
| R11 (observations textarea) | 2, 4 |
| R12–R16 (evidence staging, validity, size, cap, remove) | 2 |
| R17 (Guardar disabled with no reasons) | 6 |
| R18 (Guardar disabled with dateFrom > dateTo) | 6 |
| R19 (POST /api/citations in create) | 2 |
| R20 (PUT /api/citations/:id in edit) | 4 |
| R21 (attachments upload with retry) | 2 |
| R22 / R23 / R24 (failure handling + always close on save) | code review + smoke step 2 (success path closes) |
| R25 (saving signal disables both buttons) | code review |
| R26–R28 (Cerrar button visibility) | 4, 5 |
| R29–R30 (confirmation prompt + PUT close) | 5 |
| R31 (cancel = no-op) | 5 |
| R32 / R33 (close success/failure) | 5 + code review |
| R34 (stubbed `openCitationEditor` replaced) | 2, 4 |
| R35 / R36 (afterClosed truthy reload) | 2 (new pill appears), code review |
| R37 (local CITATION_WHATSAPP_TEMPLATE removed, templateService.getTemplate) | 7 |
| R38 (DEFAULT_TEMPLATES.citations fallback) | 7 (uncustomized) |
| R39 (profile dialog cites section) | 7 |
| R40 (`pnpm run build` exit 0) | verification command section above |
| R41 (T16 full sequence) | this whole section |
