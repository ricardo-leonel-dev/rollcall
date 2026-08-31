# Review — feature 12 `warn_conflicting_absence_type_same_day`

**Verdict:** APPROVED

## Checkpoints

- C1: [x]
- C2: [x] (session 21 open, only one in_progress feature, session log reflects current work)
- C3: [x] (component is standalone, OnPush, inject()-only; no NgModule; signals used; inline template/styles; new dialog sits next to the feature per docs/architecture.md)
- C4: [x] (project has no automated test suite per docs/verification.md; build is green — `./node_modules/.bin/ng build --configuration production` exits 0; only WARN-level budget overages, no errors)
- C5: [x] (no stray untracked/temporary files left behind)
- C6: [x] — sdd=1, spec approved by Ricardo Aguilar
  - All three spec files exist on disk.
  - `requirements.md` uses EARS-style requirements R1–R16, each with stable id.
  - `tasks.md` has T1–T12 all checked `[x]`; R→T mapping is consistent.
  - R1–R16 verified one-by-one below; code matches the spec text.

## R1–R16 traceability

- R1 [x] — `AbsenceSaveResponse` interface widens to `{ created; skipped; skippedDetails[] }` (lines 45–49). `http.post<AbsenceSaveResponse>(...)` generic applied at all three flow call-sites (line 914, 1005, 1177).
- R2 [x] — Zero-conflict branch in `saveAbsenceRange` (lines 1012–1021) uses the exact same toast format and WhatsApp options as before.
- R3 [x] — `partitionSkipped(response)` helper at lines 1249–1257 filters by `conflict === true / === false`; preserves backend's ascending order without re-sorting.
- R4 [x] — `dateLabel` and WhatsApp `notifyGuardian(...)` call signature unchanged (line 1010, 1020, 1038). Dialog WhatsApp closure uses the same args.
- R5 [x] — All-created branch in `saveAbsenceRange` (lines 1012–1021) shows today's success toast only — no dialog.
- R6 [x] — All-conflict branch opens `AbsenceSaveResultDialogComponent` (lines 1022–1044, 937–975, 1190–1210).
- R7 [x] — Explanatory line at line 110 of `absence-save-result-dialog.component.ts` is verbatim: "Elimina primero la inasistencia existente en esa fecha para poder registrar la otra."
- R8 [x] — Conflict list at line 107 uses `formatDate(c.date)` (which calls `dateToDateString(new Date(d + 'T00:00:00'))` per line 140) + `typeLabel(c.existingType)`. Created dates in Section 1 also use `formatDate`.
- R9 [x] — When `conflicts.length === 0`, no dialog is opened (zero-conflict branch goes straight to toast).
- R10 [x] — Dialog has three labelled sections in the prescribed order (Section 1 line 84, Section 2 line 99, Section 3 line 114). Section 3 is count-only: `{{ data.idempotents }} ya estaban registradas con el mismo tipo`.
- R11 [x] — Header WhatsApp button at line 74 renders only when `data.created > 0 && data.whatsappLink`. On click, dialog's `onWhatsapp()` (line 143) calls `data.onWhatsapp()` then closes itself — no double-close.
- R12 [x] — All three flows (`saveAbsenceRange`, `confirmPhotoAbsences`, `confirmVoiceAbsence`) call the same `partitionSkipped` + branch logic.
- R13 [x] — Build is green (`./node_modules/.bin/ng build --configuration production` exits 0). Manual smoke not exercised against a running stack (12 scenarios enumerated in `progress/impl_*.md`); per `docs/verification.md` this is acceptable for the current "no automated test suite" state.
- R14 [x] — Photo flow uses photo enrollment context (line 938–948); photo preview UI (lines 202–292) is unchanged.
- R15 [x] — Voice flow uses voice enrollment context (lines 1190–1210); voice transcript UI (lines 414–470) is unchanged.
- R16 [x] — `_pendingHighlight` signal (line 715) + `applyHighlight()` (lines 1274–1294) switch to Listado tab (index 3), await `loadAbsences()`, query rows by `data-enrollment-id` / `data-absence-date` (set at line 555), `scrollIntoView` and apply `flash-conflict` class for ~2 s.

## T1–T12 spot-check

- T1 [x] — `http.post<AbsenceSaveResponse>` generic widened at all three sites.
- T2 [x] — `partitionSkipped()` defined and used.
- T3 [x] — Dialog is standalone, OnPush, inject-only; reads from `MAT_DIALOG_DATA`; Section 2 renders only when conflicts > 0; R7 line exact; `Cerrar` footer via `[mat-dialog-close]="true"` on `mat-stroked-button` (line 127).
- T4 [x] — Header WhatsApp action gated by `data.created > 0 && data.whatsappLink` (line 74); uses `WhatsappIconComponent`; `onWhatsapp()` invokes `data.onWhatsapp()` then closes.
- T5 [x] — Sections 1 and 3 added with proper gating; Section 3 count-only.
- T6 [x] — No-conflict branch in `saveAbsenceRange` is byte-for-byte equivalent to today's toast (same message format, same options).
- T7 [x] — Conflict branch in `saveAbsenceRange` opens dialog with payload matching the spec's example; `pendingHighlight` set; `afterClosed` subscription calls `applyHighlight`.
- T8 [x] — `created` / `dateLabel` / `whatsappLink` / `fullName` / `type` / `course` references are unchanged; `await Promise.all([loadTodayAbsences(), loadAbsences()])` runs in both branches.
- T9 [x] — `confirmPhotoAbsences` uses the same branch; aggregates per-item POSTs into one dialog; `whatsappLink: null` per the implementer's note.
- T10 [x] — `confirmVoiceAbsence` uses the same branch; voice enrollment context; `whatsappLink: null`.
- T11 [x] — `_pendingHighlight` signal + `applyHighlight()` implemented as specified; `flash-conflict` CSS class defined in the component's `styles:` block with yellow border + 2-second pulse animation.
- T12 [x] (build only) — Build is green; manual smoke 12 scenarios enumerated but not run.

## Independent photo + voice preview/transcript regression check

- Photo preview UI (template lines 202–292): drag-zone, "matched" list with selectable checkboxes, "OCR: ..." sub-line, type badge, confidence bar, "not found" warning card, "Confirmar/Cancelar" buttons — all unchanged from the pre-PR baseline.
- Voice transcript UI (template lines 414–470): italic transcription quote, result card with student name / type / date range / confidence bar / "warning_amber" icon — all unchanged from the pre-PR baseline.
- The only mutations to these two flows are in their post-confirm branches (`confirmPhotoAbsences` lines 902–982, `confirmVoiceAbsence` lines 1172–1223). Preview/transcript markup is byte-identical to the pre-PR state.

## WhatsApp button visibility per flow

- Manual (`saveAbsenceRange`): `whatsappLink: link` (line 1032). Button renders when `created > 0 && whatsappLink` is truthy. **Renders for Manual** — correct per AC4.
- Photo (`confirmPhotoAbsences`): `whatsappLink: null` (line 939). `PhotoAbsenceItem` does not carry a `whatsappLink` field per `core/models/index.ts`. Button never renders. **Does NOT render for Photo** — correct.
- Voice (`confirmVoiceAbsence`): `whatsappLink: null` (line 1201). `VoiceAbsenceResult` does not carry a `whatsappLink` field. Button never renders. **Does NOT render for Voice** — correct.

## CSS budget / `::ng-deep` assessment

- Pre-existing CSS budget on `absences.component.ts`: at HEAD, no budget warning. After this PR: 2.37 kB total, 366 B over the 2 kB cap (warning level only — does not fail the build). The implementer's note claiming "pre-existing 366 B over" was slightly inaccurate — the actual pre-existing state was under budget, and this PR's `@keyframes flash-conflict-pulse` plus `::ng-deep` rules add the 366 B of CSS that tips it over. WARN, not ERROR. The build exits 0 and other components in the codebase already exceed the cap without incident (layout.component.ts, calendar.component.ts, etc.).
- `::ng-deep` on the `flash-conflict` selector (lines 123–134 of `absences.component.ts`) is deprecated by Angular but still works under Angular 22's emulated encapsulation. The MatTable rows are not in the component's view, so `::ng-deep` is the right tool here. No new component is needed for the highlight; this matches T11's spec.

## Backend dependency status

- Frontend compiles cleanly against the new `{ created; skipped; skippedDetails[] }` contract — verified by `./node_modules/.bin/ng build --configuration production` exiting 0.
- Backend feature `report_conflicting_absence_type_on_create` is `done` in the backend harness DB (`scripts/harness.sh status` on the backend project confirms it).
- However: the backend repo is currently on `feature/12-warn-conflicting-absence-type-same-day`, which does NOT contain commit `ae9a7e5` ("feat(absences): report per-date skip type"). That commit lives on the still-unmerged `feature/report-conflicting-absence-type-on-create` branch. So at runtime on the current backend branch, `POST /api/absences` still returns the legacy `{ created; skipped }` shape, and the frontend's defensive handling (`(response.skippedDetails ?? [])` at line 1252) means no conflicts are detected — the feature gracefully degrades to today's toast behavior.
- This means the dialog/mixed/conflict branches will not surface until the backend feature 7 commit is merged. Implementer correctly flagged this for the leader. No code change needed on the frontend side — it's the backend merge that's the gating event, and the spec already documents this dependency.
- Action item for leader (non-blocking): merge backend `feature/report-conflicting-absence-type-on-create` first (or merge both atomically) before deploying this frontend change; otherwise the user will not see the new dialog.

## Blocking concerns

None. Ready for leader to log-out.

## Notes / nits (not blocking)

- The implementer's claim about "pre-existing 366 B over" in `progress/impl_*.md` is inaccurate — the actual pre-existing state was under budget. The current 366 B overage is entirely caused by this PR. Harmless WARN.
- Manual smoke (T12) was not exercised against a running stack — acceptable per `docs/verification.md`'s "Level 1 + Level 3" expectation for projects without an automated suite. The 12 scenarios are clearly enumerated in the implementer's progress note for the reviewer/user to run manually.
- Photo highlight groups by `enrollmentId` and flashes the first enrollment's rows only (lines 966–973). This is a known limitation called out by the implementer; not a regression because no spec requirement specified multi-enrollment highlight behavior.
- Photo flow's `onWhatsapp` closure (line 961–963) only calls `dialogRef.close()` (no `notifyGuardian` invocation). This is correct because photo passes `whatsappLink: null` so the button is never rendered anyway — but a future refactor that adds a `whatsappLink` to `PhotoAbsenceItem` will need to remember to wire the closure.
