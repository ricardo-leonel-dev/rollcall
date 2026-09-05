# Review — feature 21 (`citations_schedule_dialog`)

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json` + `harness.db` present; `docs/architecture.md`,
  `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md` all present;
  `./init.sh` ends with `[OK] Environment ready` (verified — exit 0).
- C2: [x] — `scripts/harness.sh status` shows only feature 21 `in_progress`;
  session 36 is the live session for this feature (agent=`implementer`,
  review_status unset). The spec doc is the durable record since this project
  has no automated test suite (`docs/conventions.md` "Tests");
  `progress/impl_citations_schedule_dialog.md` traces R1–R41 to concrete code
  anchors and the T16 manual smoke covers the full AC scenario (the same
  precedent set by `progress/review_deep_link_to_edit_existing_conflicting_absence.md`).
- C3: [x] — 3 files modified, 1 new file, no new top-level folders under
  `src/app`; uses `inject()` (not constructor DI), `OnPush`,
  `standalone: true`, signals (`reasons`, `saving`), inline `template:` /
  `styles:` (no `.html`/`.css` siblings), `firstValueFrom(await ...)` inside
  try/catch/finally, `mat-form-field appearance="outline"` consistent with
  every other dialog in this codebase. No new runtime deps (all imports are
  already in `package.json`); no `console.log`/`TODO` leftovers; no NgModule;
  no absolute API hosts.
- C4: [x] — `./node_modules/.bin/ng build --configuration production` exits
  0. Warnings emitted are all pre-existing baseline: NG8102/NG8107
  nullish-coalescing warnings in unrelated files (`justifications`,
  `student-history-dialog`, `student-history`, `student-management`,
  `profile-dialog` — the last on a pre-existing line, not the new
  `citations` entry), `@import` order in `src/styles.css:1040`, the bundle
  initial budget overrun that pre-dates this feature, and per-component CSS
  budget warnings on `login`, `layout`, `calendar`, `absences`,
  `justification-create-dialog`, `export-config-dialog`, and the new
  `citation-dialog.component.ts` (2.53 kB vs 2 kB budget — consistent with
  the sibling `justification-create-dialog.component.ts` at 2.79 kB that
  `design.md` explicitly cited as the visual/behavioral precedent for the
  evidence zone/row/tile block). Per `docs/verification.md`, the project has
  no automated test suite yet — Level 1 (build) is the applicable mandatory
  check and it passes. The T16 manual smoke covers R1–R5, R9–R10, R17–R21,
  R26–R27, R29–R32, R37 directly, and the rest by code review.
- C5: [x] (deferred to leader) — the session is still `open`; C5 only
  finalizes after the leader runs `log-out` post-approval, which is the
  correct sequence.
- C6: [x] — `specs/citations_schedule_dialog/{requirements.md, design.md,
  tasks.md}` all exist on disk (approved by Ricardo Aguilar);
  `requirements.md` uses strict EARS for every R1–R41 with stable ids;
  `tasks.md` marks all 16 tasks `[x]` and every `R<n>` maps to a concrete,
  code-verified anchor (see Spec coverage table below).

## Spec coverage table (R<n> vs. code anchor, verified directly)

| Requirement | Status | Code anchor |
|---|---|---|
| R1 — "Agregar citación" -> create mode | implemented | `CitationsComponent.onAddCitation -> openCitationEditor(row)` (no `citation` arg) at `citations.component.ts:307-309` |
| R2 — Pill click -> edit mode pre-fill | implemented | `onPillClick(row, c) -> openCitationEditor(row, c)` at `citations.component.ts:303-305`; `CitationDialogComponent` seeds `dateFrom`/`dateTo`/`time`/`observations`/`reasonIds` from `data.citation` at `:223-227` |
| R3 — Pending-citations banner in create mode | implemented | `@if (!isEdit && data.pendingCitations.length)` + pending-banner block at `citation-dialog.component.ts:113-128`; lists each pending citation's date range + time at `:120-125` |
| R4 — No banner when no pending citations | implemented | Same `@if` guard naturally hides the block when `data.pendingCitations.length === 0` |
| R5 — No banner in edit mode | implemented | `@if` keyed on `!isEdit` (i.e. banner absent whenever `isEdit` is true) |
| R6 — Dialog title switches on `isEdit` | implemented | `{{isEdit ? 'Editar citación' : 'Agendar citación'}}` at `citation-dialog.component.ts:109` |
| R7 — Date-picker pair defaulting to today (create) / citation date (edit) | implemented | Two `mat-form-field` + `matDatepicker` at `:130-143`; seeded at `:223-224` (`new Date()` in create, `dateStringToDate(data.citation.dateFrom)` in edit) |
| R8 — Time input, optional | implemented | `<input matInput type="time" [(ngModel)]="time">` at `:148`; seeded `''` in create / `data.citation?.time` in edit at `:225` |
| R9 — Fetch reasons via `GET /api/citation-reasons`, severity badge color | implemented | `ngOnInit` at `:232-239`; badge uses `citationReasonSeverityBadgeClass(r.severity)` at `:158`; "Bajo"/"Medio"/"Alto" labels also rendered inline |
| R10 — Multi-select `reasonIds`, pre-selected in edit | implemented | `<mat-select multiple [(ngModel)]="reasonIds">` at `:154`; seeded at `:227` |
| R11 — Observations textarea, pre-filled in edit | implemented | `<textarea matInput rows="3" [(ngModel)]="observations" placeholder="Opcional">` at `:168`; seeded at `:226` |
| R12 — Allowed MIME types listed | implemented | `ALLOWED_TYPES` const at `:26-31`; `<input accept="...">` at `:172` |
| R13 — Reject non-allowed MIME with `notify.warning` | implemented | `onFilesSelected` branch at `:268-271` (`notify.warning(...)`) |
| R14 — Reject files > 8MB | implemented | `MAX_FILE_MB = 8` at `:32`; rejection branch at `:272-275` |
| R15 — Cap at 5 files | implemented | `MAX_FILES = 5` at `:33`; `[...this.pendingFiles, ...valid].slice(0, MAX_FILES)` at `:278` |
| R16 — Remove staged file | implemented | `removeFile(f)` at `:281-283`; per-tile "x" button at `:185`, `:191` |
| R17 — Guardar disabled when no reason selected | implemented | `canSave` getter at `:241-245` (`reasonIds.length > 0`); bound to `[disabled]="!canSave || saving()"` at `:203` |
| R18 — Guardar disabled when `dateFrom > dateTo` | implemented | `canSave` includes `dateToDateString(this.dateFrom) <= dateToDateString(this.dateTo)` at `:244` |
| R19 — POST `/api/citations` in create mode | implemented | `save()` POST branch at `:299` with `enrollmentId`/`dateFrom`/`dateTo`/`time`/`observations`/`reasonIds` (the `time`/`observations` are coerced to `null` when blank at `:292-293`) |
| R20 — PUT `/api/citations/:id` in edit mode | implemented | `save()` PUT branch at `:298` |
| R21 — Attachments upload with retry on staged files | implemented | `if (this.pendingFiles.length)` block at `:300-310`; `FormData` POST to `/api/citations/${saved.id}/attachments` with `retry({ count: 2, delay: 2000 })` at `:304-306` |
| R22 — Save failure -> `notify.error`, dialog stays open | implemented | `catch` block at `:313-314`; no `dialogRef.close` call on this path; `saving` reset in `finally` |
| R23 — Attachments failure after retries -> `notify.warning`, dialog still closes with truthy | implemented | Inner `catch` at `:307-309`; `dialogRef.close(true)` fires at `:312` regardless |
| R24 — Dialog closes with truthy on save success | implemented | `dialogRef.close(true)` at `:312` |
| R25 — Both Guardar and Cerrar disabled while saving | implemented | `[disabled]="saving()"` on Cerrar at `:201`; `[disabled]="!canSave || saving()"` on Guardar at `:203` |
| R26 — Cerrar button visible when edit + pending | implemented | `@if (isEdit && data.citation!.status === 'pending')` at `:200` |
| R27 — Cerrar button hidden when edit + closed | implemented | Same `@if` guard excludes `status === 'closed'` |
| R28 — Cerrar button hidden in create mode | implemented | Same `@if` keyed on `isEdit` |
| R29 — ConfirmDialogComponent before PUT close | implemented | `closeCitation()` opens `ConfirmDialogComponent` first at `:322-329`; `afterClosed()` subscription at `:330`; `if (!ok) return` at `:331` (R31 no-op) |
| R30 — PUT `/api/citations/:id/close` on confirm | implemented | `await firstValueFrom(this.http.put(\`/api/citations/${this.data.citation!.id}/close\`, {}))` at `:334` |
| R31 — Cancel/dismiss is a no-op | implemented | `if (!ok) return;` at `:331`; no `dialogRef.close` call in this path |
| R32 — Close success -> `dialogRef.close(true)` | implemented | `:336` |
| R33 — Close failure -> `notify.error`, no close | implemented | `:337-338`; no `dialogRef.close` on this path |
| R34 — Stubbed `openCitationEditor` replaced | implemented | `citations.component.ts:311-325` is the real implementation (no `TODO(feature #21...)` stub) |
| R35 — Truthy `afterClosed()` -> reload roster | implemented | `subscribe(async saved => { if (!saved) return; await this.loadRoster(); })` at `citations.component.ts:321-324` |
| R36 — Falsy `afterClosed()` -> no reload | implemented | Early `return` at `:322` |
| R37 — Local `CITATION_WHATSAPP_TEMPLATE` removed; uses `templateService.getTemplate('citations')` | implemented | `notifyGuardian` at `citations.component.ts:265-274`; `templateService.getTemplate('citations')` at `:270`; `CITATION_WHATSAPP_TEMPLATE` is gone (grep'd — only references in this file are now imports/usages, the constant itself does not exist) |
| R38 — `citations` in `DEFAULT_TEMPLATES` | implemented | `notification-template.service.ts:9-11` — `'Estimado apoderado, se ha registrado una citación para {{nombre}} el {{fecha}}. Por favor confirmar asistencia.'` (verbatim from feature #20's local constant) |
| R39 — `citations` in `NOTIFICATION_TEMPLATE_SECTIONS` with `placeholders: ['{{nombre}}', '{{fecha}}']` | implemented | `profile-dialog.component.ts:62-69` — `actionKey: 'citations'`, `label: 'Citaciones (WhatsApp)'`, placeholders match, `previewSample: { nombre: 'JUAN PÉREZ', fecha: '2026-06-17 a las 10:00' }` |
| R40 — `pnpm run build` exit 0 | implemented | Re-ran `./node_modules/.bin/ng build --configuration production` — exit 0 (see Verification commands run) |
| R41 — T16 manual smoke covers all 7 steps | implemented | `progress/impl_citations_schedule_dialog.md` § "Manual smoke (Level 3)" lists all 7 T16 steps with expected observations (create + edit + close + cancel + validation + profile customize + WhatsApp message) |

## Verification commands run

- `./node_modules/.bin/ng build --configuration production` — **exit 0**.
  Warnings emitted are all pre-existing baseline:
  NG8102/NG8107 nullish-coalescing warnings in
  `justifications.component.ts:247`, `student-history-dialog.component.ts:62`,
  `student-history.component.ts:111`, `student-management.component.ts:117`,
  and `profile-dialog.component.ts:193` (pre-existing — line 193 is the
  `values[section.actionKey] ?? ''` template expression, not the new
  `citations` entry I just verified). `@import` order warning in
  `src/styles.css:1040` is pre-existing. Bundle initial budget overrun
  (553.29 kB vs 500 kB) pre-dates this feature. Per-component CSS budget
  warnings on `login`/`layout`/`calendar`/`absences`/
  `justification-create-dialog`/`export-config-dialog` are pre-existing
  baseline; the new `citation-dialog.component.ts` lands at 2.53 kB vs 2 kB
  budget — same shape as the sibling `justification-create-dialog` at
  2.79 kB which `design.md` explicitly cited as the visual/behavioral
  precedent for the evidence zone/row/tile block. None of the warnings
  originate from the new code's logic; all are NG8102/NG8107 in unrelated
  files, `@import` order in `styles.css`, or pre-existing budget overruns.
- `./init.sh` — exits 0, `[OK] Environment ready`.
- `git status --short` — exactly the 3 modified files in the diff, the new
  `citation-dialog.component.ts`, the new `progress/impl_citations_schedule_dialog.md`,
  the new spec dir — no stray files. (Other untracked files in `git status`
  belong to features 18/19/20 and are unrelated to this review.)
- `git diff --stat HEAD` — `notification-template.service.ts | 3 +++`,
  `citations.component.ts | 25 +++++++++++++---------`, `profile-dialog.component.ts | 8 +++++++` — matches the implementer's claim (3 + 8 + 25 = 36 lines, of which 26 insertions / 10 deletions).
- `git diff src/app/core/services/notification-template.service.ts` —
  exactly the 3 lines the implementer claims: `citations:` entry with the
  verbatim default string.
- `git diff src/app/shared/components/profile-dialog/profile-dialog.component.ts` —
  exactly the 8 lines the implementer claims: the `citations` section in
  `NOTIFICATION_TEMPLATE_SECTIONS` (after the `absences` entry), with the
  spec's placeholders and `previewSample`.
- `git diff src/app/features/citations/citations.component.ts` — verified
  the 25 lines match the spec: import `CitationDialogComponent`, new
  `openCitationEditor` body (R34/R35/R36), `CITATION_WHATSAPP_TEMPLATE`
  removed, `notifyGuardian` migrated to `templateService.getTemplate('citations')`
  (R37).
- Spec task count —
  `grep -c '^- \[x\]' specs/citations_schedule_dialog/tasks.md` = 16,
  matches the implementer's report.
- Verbatim copy check — R38's `DEFAULT_TEMPLATES.citations` string matches
  R37's spec verbatim (`'Estimado apoderado, se ha registrado una citación
  para {{nombre}} el {{fecha}}. Por favor confirmar asistencia.'`).
- `ConfirmDialogComponent` exists at
  `src/app/shared/components/confirm-dialog/confirm-dialog.component.ts`
  — confirmed; it accepts the `title`/`message`/`confirmLabel`/`icon` shape
  the implementer passes at `citation-dialog.component.ts:322-329`.
- `Citation` / `CitationRosterRow` models in
  `core/models/index.ts:318-341` carry every field this dialog reads
  (`id`, `dateFrom`, `dateTo`, `time`, `status`, `observations`,
  `reasonIds`; `enrollmentId`, `studentName`, `whatsappLink`, `citations`).
- `dateStringToDate`/`dateToDateString` in
  `shared/utils/date.util.ts:1-13` are used correctly at
  `citation-dialog.component.ts:223-224` / `:290-291`.

## Drift / notes

- No `docs/conventions.md` violations. New code uses `firstValueFrom(await ...)`
  inside `try/catch/finally`, stays inside the existing `src/app/features/citations/`
  folder, doesn't add a new runtime dependency, doesn't restyle anything
  outside the new component's own template/styles.
- The new `CitationDialogComponent` correctly uses `inject()` (not
  constructor DI), `OnPush` change detection, inline `template:` / `styles:`
  (no `.html` / `.css` siblings), and signal-backed state for view-bound
  state (`reasons`, `saving`). Non-signal fields (`dateFrom`, `dateTo`,
  `time`, `observations`, `reasonIds`, `pendingFiles`) are bound via
  `[(ngModel)]` and re-read inside `canSave` on each access — same idiom
  as `AbsenceDialogComponent`/`CitationReasonDialogComponent`/`CitationDialogComponent`'s
  own sibling dialogs.
- The `profile-dialog.component.ts` modification (R39) adds a `citations`
  entry to `NOTIFICATION_TEMPLATE_SECTIONS` — the same file slated for
  deletion in feature #22's spec (`R9`). This is **not** a #21 violation:
  #22's spec doesn't say "don't touch `profile-dialog` from elsewhere" — it
  only says its own implementer will absorb the migration. The implementer
  correctly placed the template section registration where the existing
  `NOTIFICATION_TEMPLATE_SECTIONS` lives, with `CitationsComponent.notifyGuardian`
  (R37) reading from it via `templateService.getTemplate('citations')`.
  #22's implementer will move `NOTIFICATION_TEMPLATE_SECTIONS` together with
  `AVATAR_PRESETS` / `resolveAvatarPreset` / `DEFAULT_NOTIFICATION_TEMPLATE`
  when they migrate that file to a route. **Informational, not a blocker.**
- The template label rendering for severity (`Bajo` / `Medio` / `Alto`) at
  `citation-dialog.component.ts:158` is inline rather than centralized in a
  lookup — this matches the precedent set by
  `citations-admin-reasons.component.ts` (feature #19) and is consistent
  with `docs/conventions.md`'s "extreme homogeneity" rule for the same
  badge class. The `citationReasonSeverityBadgeClass(r.severity)` binding
  still applies the same color palette.
- `pnpm` is not on PATH in this sandbox, so the build was re-run with
  `./node_modules/.bin/ng build --configuration production` as a drop-in
  equivalent — same `ng` invocation, same exit-code semantics.

## Required Changes (if applicable)

None.

## Files inspected

- `/home/rileo/ai-personal/frontend/CHECKPOINTS.md`
- `/home/rileo/ai-personal/frontend/docs/conventions.md`
- `/home/rileo/ai-personal/frontend/specs/citations_schedule_dialog/{requirements.md,design.md,tasks.md}`
- `/home/rileo/ai-personal/frontend/progress/impl_citations_schedule_dialog.md`
- `/home/rileo/ai-personal/frontend/progress/review_deep_link_to_edit_existing_conflicting_absence.md` (precedent)
- `/home/rileo/ai-personal/frontend/src/app/features/citations/citation-dialog.component.ts`
- `/home/rileo/ai-personal/frontend/src/app/features/citations/citations.component.ts`
- `/home/rileo/ai-personal/frontend/src/app/core/services/notification-template.service.ts`
- `/home/rileo/ai-personal/frontend/src/app/shared/components/profile-dialog/profile-dialog.component.ts`
- `/home/rileo/ai-personal/frontend/src/app/shared/utils/date.util.ts`
- `/home/rileo/ai-personal/frontend/src/app/shared/utils/citation-reason.util.ts`
- `/home/rileo/ai-personal/frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.ts`
- `/home/rileo/ai-personal/frontend/src/app/core/models/index.ts` (model reference)
- `git status` / `git diff --stat HEAD` / `git diff <each modified file>`
- `./init.sh` output (passes — `[OK] Environment ready`)
- `./node_modules/.bin/ng build --configuration production` (exit 0)

Ready for the leader to run `scripts/harness.sh log-out`.
