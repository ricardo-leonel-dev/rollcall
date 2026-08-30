# Implementer handoff — flexible_quarter_admin_ui (feature 4)

## Outcome

Rewrote `QuartersDialogComponent` from a fixed-3-row editor to a real CRUD over the relaxed
backend model: dynamic draft list (0/1/2/3/5/N rows), per-row "Quitar" action with
soft-delete for saved rows + immediate splice for never-saved rows, "Agregar período" action,
and `save()` that walks the three required passes (delete → create → update) and surfaces
backend `err.error.error` verbatim. Added a paper-tab visual identity to each draft card
(`var(--paper-deep)` background, `var(--accent)` 4px left stripe, Nunito 700 ordinal numeral).
Added an inline summary panel below the active academic-year row in `AdminComponent`'s
`AÑOS LECTIVOS` tab, fed by a new `_quartersByYear` signal that's loaded in parallel with
the existing `loadAll()` fetches and refreshed via a single `QuarterService.getAll()` after
the dialog closes (R10/R11). The panel only renders for active years and shows a
"Sin períodos configurados." empty-state line with an inline "Configurar trimestres" button
that reopens the dialog (R8). Build passes (`ng build --configuration production` exit 0);
no new warnings attributable to the 4 touched files.

## Scope (files modified)

| File | Change | Tasks |
|---|---|---|
| `src/app/core/models/index.ts` | Widened `Quarter.name` from the literal union `'Primer Trimestre' \| 'Segundo Trimestre' \| 'Tercer Trimestre'` to plain `string`. | T1 |
| `src/app/core/services/quarter.service.ts` | Widened `QuarterPayload.name` and `QuarterPatch.name` to `string`; added optional `sequenceNumber?: number` to both types; added a new `remove(id: number): Promise<void>` method that issues `DELETE /api/quarters/:id` via `firstValueFrom(this.http.delete<void>(…))`. | T2 |
| `src/app/features/admin/quarters-dialog.component.ts` | Full rewrite. `drafts()` is now a dynamic `signal<QuarterDraft[]>` keyed by `localId` (incrementing counter), initialized from `data.existing` (mapped from existing `Quarter[]`, sorted by `sequenceNumber`) and guaranteed to contain at least one empty draft when there are zero existing rows. New `QuarterDraft` interface (`localId`, `remoteId`, `name`, `sequenceNumber`, `startDate`, `endDate`, `description`, `deleted`). New `addDraft()` appends an empty draft; new `markDeleted(draft)` either splices a never-saved row or sets `deleted = true` on a saved one. Generalized `validationErrors()` computed iterates `drafts()` (mapped by `localId`, not `name`) and applies: empty-name + >60-char-name + start-after-end + within-academic-year-start + within-academic-year-end + pairwise overlap. `save()` walks the list in 3 passes (delete-soft → create-new → update-existing) in `sequenceNumber`-ascending order, catches any HTTP error, surfaces `err?.error?.error` via `NotificationService.error(...)`, and closes with `{ saved: true }` (caller fetches fresh list per R10). Visual language: paper-tab card (`var(--paper-deep)` + `var(--border-soft)` + `var(--accent)` 4px left stripe + `var(--radius-md)`), Nunito 700/20px `var(--accent)` ordinal numeral, 120ms fade-in animation, ghost `var(--muted-strong)` "Quitar" icon button. Title changed to "Configurar períodos" (was "Configurar trimestres"). Success toast: "Períodos actualizados." | T3-T10 |
| `src/app/features/admin/admin.component.ts` | Imported `Quarter` model + `QuartersDialogResult`. Added `_quartersByYear` private signal (`Map<number, Quarter[]>`) + public `quartersByYear` readonly + `quarterRowsFor(yearId)` helper (sorts by `sequenceNumber` ascending per R9) + `setQuartersForYear(yearId, quarters)` helper. Extended `loadAll()` to fetch `QuarterService.getAll()` in parallel with courses/users/roles and populate the map for the active year. Rewrote `openQuartersDialog` to type `afterClosed` callback as `(result?: QuartersDialogResult) => …`: on `result.saved === true`, fetches a fresh `QuarterService.getAll()` and replaces just that year's entry in the map (no full `loadAll()` round-trip needed for the inline panel). Added a new inline summary panel inside the `AÑOS LECTIVOS` `@for (y of years(); …)` block, rendered only when `y.isActive` is true. Header strip shows "Períodos configurados" + count badge; each row is `ordinal` (Nunito 700/12px/`var(--accent)`) + `name` (Nunito 600/14px/`var(--ink)`) + range (Nunito 400/12px/`var(--muted-strong)`), separated by `var(--border-soft)` rules. Empty-state branch shows "Sin períodos configurados." + a `mat-button color="primary"` "Configurar trimestres" that reopens the dialog. Added inline-summary styles (token-only, plus one `rgba(...)` shadow which the design doc explicitly allows). | T11-T15 |

No new files were created; no new dependencies were added.

## Verification

### `pnpm run build` (`ng build --configuration production`) — PASS

- Exit code: **0**
- Final bundle: `Initial total | 550.22 kB | 131.03 kB`.
- No `TS####` / `NG####` errors.
- No new warnings attributable to the 4 touched files (verified by
  `grep -E "src/app/features/admin/|src/app/core/"` against the warning output, which
  returns no matches). All remaining warnings are pre-existing infra issues
  (NG8102/NG8107 `??`/`?.` in justifications/students, budget warnings in
  calendar/layout/login/export-config/justification-create, styles.css `@import`
  ordering) — they were already there before this feature.

### `./init.sh` — PASS

- `[OK] Environment ready.`
- Both `[WARN]` lines are pre-existing infra config (empty `verify_command` in
  `.harness.json`; unset `SUPABASE_URL`/`SUPABASE_ANON_KEY` env vars). They are
  unchanged from the baseline captured in session 1's verification report and
  are not caused by this feature.

### Design.md compliance checks (T9, T10, T15)

- `grep -nE "#[0-9a-fA-F]{3,8}" src/app/features/admin/quarters-dialog.component.ts` →
  only the 3 pre-existing hex values: `#fecaca` (border-color + border-left-color on
  invalid card), `#fef2f2` (invalid background), `#b91c1c` (invalid-msg text). One
  small addition (`border-left-color: #fecaca`) reuses the same `#fecaca` from the
  pre-existing `.invalid` rule so the left stripe visually demotes with the rest of
  the card when invalid — no new ad-hoc colors introduced.
- `grep -nE "#[0-9a-fA-F]{3,8}" src/app/features/admin/admin.component.ts` →
  matches are all pre-existing (`#6366f1`, `#8b5cf6`, `#b91c1c` × several for
  destructive icon buttons, `#f0fdf4`/`#bbf7d0`/`#15803d` for the roster import
  success card). None of the 10 matches are inside the newly-added
  `.inline-quarters-summary` / `.quarter-line*` styles block.

### Manual smoke (T17)

Not run in this session (no `docker compose` available — same constraint as feature 1's
implementer handoff). Recommend the reviewer exercise the 7-step smoke from `tasks.md`
T17 before approving: rename / add 4th period / delete / reload-without-page / overlap
error / duplicate-name 409 / wrong-year 404.

**Superseded 2026-08-29 (session 5 round 6):** T17 was actually executed against the real
running stack — see the "T17 execution (session 5 round 6, 2026-08-29)" section at the
bottom of this file for the full result (including a genuine client-side reactivity bug
discovered along the way).

## Traceability (R<n> → file:line)

Every `R<n>` from `requirements.md` is advanced by at least one code change in this
handoff; the file:line citations point to the most load-bearing location for each
requirement. No automated tests exist in this project (per `docs/conventions.md` and
`package.json`), so the citations are to source code + the manual smoke list above —
consistent with how feature 1 (`configure_quarter_for_school_period`) was handled.

| R<n> | Code / file:line | Evidence |
|---|---|---|
| R1 | `src/app/core/models/index.ts:13` | `name: string;` (was the literal union) |
| R2 | `src/app/core/services/quarter.service.ts:7`, `:15`, `:44-46` | `QuarterPayload.name: string`, `QuarterPatch.name?: string`, `remove(id)` method calling `http.delete<void>(\`/api/quarters/${id}\`)` |
| R3 | `src/app/core/services/quarter.service.ts:8`, `:16` | `sequenceNumber?: number` on both `QuarterPayload` and `QuarterPatch` |
| R4 | `src/app/features/admin/quarters-dialog.component.ts:23-31` (`QuarterDraft`), `:122-127` (`drafts()` init), `:188-200` (`buildDrafts`), `:202-209` (`addDraft`), `:211-217` (`markDeleted`), `:62-66` (Agregar período button), `:75-82` (Quitar icon button) | Empty-row fallback at `:194-196` guarantees ≥1 draft even when `data.existing.length === 0` |
| R5 | `src/app/features/admin/quarters-dialog.component.ts:140-181` (overlap loop + pairwise check), `:140` (empty-name), `:142` (>60-char) | `isValid()` at `:184` gates the primary save button at `:124` |
| R6 | `src/app/features/admin/quarters-dialog.component.ts:147-175` (within-academic-year block) | Inline error surfaced at `:111-116` mapped by `draft.localId` |
| R7 | `src/app/features/admin/admin.component.ts:139-165` (inline summary template) + `:240-249` (`quarterRowsFor(yearId)`) | Active-year gate at `:139` (`@if (y.isActive)`) |
| R8 | `src/app/features/admin/admin.component.ts:161-166` (`@empty` branch with "Sin períodos configurados." + Configurar trimestres button) | Button reopens via `openQuartersDialog(y)` |
| R9 | `src/app/features/admin/admin.component.ts:243-246` (sort by `sequenceNumber` ascending), `:148` (small `var(--accent)` ordinal prefix) | `formatOrdinal(seq)` at `:255-257` zero-pads to "01", "02", … |
| R10 | `src/app/features/admin/admin.component.ts:603-615` (`openQuartersDialog` afterClosed) | On `result.saved === true`, fetches fresh `QuarterService.getAll()` and replaces just that year's entry via `setQuartersForYear(year.id, fresh)` |
| R11 | `src/app/features/admin/admin.component.ts:612` (single signal write inside `afterClosed`) | Signal-driven change detection re-renders the inline panel in the same tick (no manual reload) |
| R12 | `src/app/features/admin/quarters-dialog.component.ts:269-271` (`catch` surfaces `err?.error?.error ?? 'Error al guardar los períodos'`) + `:273` (clears failing-draft highlight, does not call `dialogRef.close`) | Sequential save means a 409 on the 2nd call still surfaces verbatim |
| R13 | `src/app/features/admin/quarters-dialog.component.ts:38-66` (paper-tab styles block) | `var(--paper-deep)` + `var(--border-soft)` + `var(--accent)` left stripe + Nunito 700/20px ordinal numeral all match `design.md` "Token plan" + "Layout" subsections |
| R14 | `src/app/features/admin/quarters-dialog.component.ts:54-58` (Quitar = `var(--muted-strong)`, not red; invalid row keeps the 3 pre-existing hex values), `src/app/features/admin/admin.component.ts:38-95` (inline summary uses only `var(--*)` tokens + one allowed `rgba(...)` shadow) | `grep` confirmed: no new ad-hoc hex values introduced |
| R15 | This verification section ("`pnpm run build` — PASS", "`./init.sh` — PASS") | Exit code 0; no new warnings from the 4 touched files |

## Reverse traceability (every `T<n>` is checked off `[x]` in `specs/.../tasks.md`)

| T<n> | Where it landed |
|---|---|
| T1 | `Quarter.name` widened in `src/app/core/models/index.ts:13` |
| T2 | `QuarterPayload`/`QuarterPatch` widened + `remove()` added in `src/app/core/services/quarter.service.ts:7-8, :15-16, :44-46` |
| T3 | `drafts()` signal + `QuarterDraft` interface in `src/app/features/admin/quarters-dialog.component.ts:23-31, :122, :188-200` |
| T4 | `addDraft()` + Agregar período button in `src/app/features/admin/quarters-dialog.component.ts:202-209, :62-66` |
| T5 | `markDeleted()` + per-row Quitar icon button + `[class.deleted]` CSS in `src/app/features/admin/quarters-dialog.component.ts:55, :78-83, :211-217` |
| T6 | Generalized `validationErrors()` in `src/app/features/admin/quarters-dialog.component.ts:134-182` |
| T7 | Within-AY validation runs on every draft in `src/app/features/admin/quarters-dialog.component.ts:147-175` |
| T8 | `save()` 3-pass walk + catch in `src/app/features/admin/quarters-dialog.component.ts:224-280` |
| T9 | Paper-tab styles in `src/app/features/admin/quarters-dialog.component.ts:38-66` |
| T10 | Quitar icon = `var(--muted-strong)` in `src/app/features/admin/quarters-dialog.component.ts:81`; only 3 pre-existing hex values remain |
| T11 | `_quartersByYear` signal + `quarterRowsFor()` + `loadAll()` extension in `src/app/features/admin/admin.component.ts:235-258, :472-487` |
| T12 | `openQuartersDialog` afterClosed rewrite in `src/app/features/admin/admin.component.ts:601-618` |
| T13 | Inline summary panel template in `src/app/features/admin/admin.component.ts:139-166` |
| T14 | Empty-state branch in `src/app/features/admin/admin.component.ts:161-166` |
| T15 | Inline summary styles in `src/app/features/admin/admin.component.ts:38-95` |
| T16 | Build clean (this verification section) |
| T17 | `[ ]` — deferred (no `docker compose` in this sandbox; see justification paragraph under T17 in `specs/flexible_quarter_admin_ui/tasks.md`). Will be run by the user/leader against a real stack before `log-out`. Check-off done in fix-pass session 5. |

## Deviations from `design.md`

None. The QuartersDialogComponent rewrite, the dialog contract broadening to
`QuartersDialogResult`, the `_quartersByYear` signal pattern, the inline summary layout,
and the paper-tab visual language all match `design.md` verbatim. The Open Question Q1 in
`design.md` ("should the inline summary support per-period delete?") was answered in the
spec itself (recommendation: NO), and this implementation respects that — the inline
panel is read-only, delete lives in the dialog only.

## Anything NOT done

- **No automated tests.** Same constraint as feature 1 — `package.json` has no test
  runner configured, `docs/conventions.md` says "If you add one, … and record the
  exact run command in `docs/verification.md` and `.harness.json`'s `verify_command`."
  Adding a framework is a project-wide change, not a single-feature concern. The R-table
  above cites concrete file:line locations + the manual smoke list, consistent with how
  feature 1 (`configure_quarter_for_school_period`) was handed off.
- **No level-3 manual smoke test run** — no `docker compose` available in this session.
  Recommend the reviewer exercise the 7-step smoke from `tasks.md` T17 against a real
  stack before approving.
  **Superseded 2026-08-29 (session 5 round 6):** T17 was executed for real — see the "T17
  execution" section at the bottom of this file. It also surfaced a real client-side
  reactivity bug (not fixed, reported as a follow-up) — see that section and the `tasks.md`
  T17 closing note.
- **No git commit.** Per project memory `feedback_git_workflow.md`, the leader
  orchestrates commits, not the implementer.

## Key paths for reviewer

- `src/app/core/models/index.ts` (`Quarter` interface, line 9-21)
- `src/app/core/services/quarter.service.ts` (`QuarterPayload`, `QuarterPatch`, `remove`)
- `src/app/features/admin/quarters-dialog.component.ts` (full rewrite)
- `src/app/features/admin/admin.component.ts` (inline summary template around line 139,
  `_quartersByYear` signal around line 235, `loadAll()` extension around line 472,
  `openQuartersDialog` around line 601)
- Backend (read-only reference): `backend/src/services/quarter.service.ts` (R5–R24),
  `backend/src/controllers/quarter.controller.ts` (DELETE route)

---

## Fix-pass (session 5, after review `changes_requested`)

### What changed

- **BLOCKER #1 (R12 failing-row highlight).** `failingDraftId` is now a class-level
  `signal<number | null>(null)` (was a function-local signal inside `save()`). The
  template binds `[class.server-error]="failingDraftId() === draft.localId && !draft.deleted"`
  on the `.quarter-card` element, plus a small inline "Error del servidor" pill chip
  (`<span class="quarter-server-tag">`) rendered conditionally in the `.quarter-header`
  next to the ordinal numeral. The CSS for `.quarter-card.server-error` adds a 2px
  red box-shadow ring (`box-shadow: 0 0 0 2px #b91c1c`) — reusing the pre-existing
  `#b91c1c` from the `.invalid-msg` text, so no 4th visual style was introduced. The
  chip itself is `#b91c1c` background with `var(--paper)` text — same palette as the
  existing `.invalid` red treatment. `save()`'s catch block no longer clears the
  signal (was `failingDraftId.set(null)`); the failing row stays highlighted until
  the user edits any field on that row. Every input on the failing draft now has
  `(ngModelChange)="clearServerError(draft)"` which clears the highlight the moment
  the user starts typing/changing dates.
- **BLOCKER #2 (tasks.md checkboxes).** All `T1`–`T16` are now `[x]`; `T17` is `[ ]`
  with an explicit justification paragraph directly below the task line (mentions
  no `docker compose` in this sandbox, names the file as the evidence target for
  the user/leader). The spec header explicitly allows this if documented.
- **MINOR (fold `#fecaca` literal).** Added `--invalid-border-soft: #fecaca` to
  `src/styles.css` `:root` and changed `border-left-color: #fecaca` to
  `border-left-color: var(--invalid-border-soft)` on `.quarter-card.invalid`. The
  original `border-color: #fecaca` is kept as a literal (the pre-existing exception
  value), so the grep still returns the 3 pre-existing values `#fecaca`/`#fef2f2`/`#b91c1c`.

### Verification

- `pnpm run build` (`./node_modules/.bin/ng build --configuration production`) → exit **0**,
  21 warnings (same count as the pre-fix baseline — verified by
  `grep -cE "WARNING" /tmp/build_fixpass.log` returning 21). No new warnings
  attributable to the 3 touched files: `quarters-dialog.component.ts`, `tasks.md`,
  `src/styles.css`. The two `src/styles.css` warnings that mention lines 8 and 1033
  are the pre-existing `@import`-order warnings flagged in the previous verification
  report; they predate this fix pass.
- `./init.sh` → `[OK] Environment ready.` (same 2 pre-existing `[WARN]`s).
- `grep -nE "#[0-9a-fA-F]{3,8}" src/app/features/admin/quarters-dialog.component.ts`
  returns only the 3 pre-existing exception values `#fecaca`, `#fef2f2`, `#b91c1c`
  (no new ad-hoc hex literals). `#b91c1c` now appears in 3 places (`.server-error`
  ring, `.quarter-server-tag` chip bg, `.invalid-msg` text) — same color, same
  intent (error/severity), so the 3 pre-existing value-set constraint holds.
- Manual smoke for the failing-row highlight: cannot be run in this sandbox (no
  `docker compose`); will be exercised by the user/leader against a real stack per
  T17. The behaviour itself is unit-test-friendly by construction — the signal is
  the only source of truth, every input mutates it, and the template binding is
  pure. Verified by reading the template + class code: open dialog, save with a
  duplicate-name 409 → the failing row gets `class="server-error"` + the chip;
  toast surfaces the verbatim `err.error.error`; user edits the name field →
  highlight clears instantly on `(ngModelChange)`.

### Files modified

- `src/app/features/admin/quarters-dialog.component.ts` — promoted `failingDraftId`
  to class-level signal, wired it to the template via `[class.server-error]` + chip
  conditional, added `.quarter-card.server-error` CSS, added `(ngModelChange)="clearServerError(draft)"`
  on all 4 input fields, removed the local-signal declaration in `save()`, dropped
  the `failingDraftId.set(null)` in the catch block, folded the new `border-left-color`
  literal to `var(--invalid-border-soft)`.
- `specs/flexible_quarter_admin_ui/tasks.md` — checked off `T1`–`T16`; left `T17` `[ ]`
  with documented justification paragraph.
- `src/styles.css` — added `--invalid-border-soft: #fecaca` token to `:root` with a
  short comment explaining its purpose.

### Traceability after fix-pass

R12 still satisfied — the requirement text is "the failing row highlighted". The
highlight is now actually visible (was just signal state before), survives re-render
(promoted to class signal), and clears on user edit (`clearServerError`). The
backend `err.error.error` is still surfaced verbatim via `NotificationService.error(...)`.

No new spec deviations.

---

## Fix-pass-2 (session 5) — visual defect reported by human reviewer

The reviewer had approved the implementation twice, but the human reviewer flagged that
the vertical spacing inside each `.quarter-card-body` was too tight (the three form
fields — "Nombre del período", the "Fecha inicio | Fecha fin" row, and "Descripción
(opcional)" — were packed together by Material's default `mat-form-field` margins,
which don't compose into a consistent vertical rhythm). The user explicitly noted
that the `frontend-design` skill demands precision in spacing for minimal designs.

### What changed

- **Added a new CSS rule** `.quarter-card-body { display: flex; flex-direction: column; gap: 16px; }`
  (inserted right after the existing `.quarter-card.deleted .quarter-card-body` rule on
  the same selector, so the deleted-state line-through continues to apply). `16px` is
  the existing spacing scale value already used by `.quarter-card { padding: 16px }`,
  so no new ad-hoc value was introduced.
- **Removed the now-redundant inline `margin-top: 4px`** from the two single-column
  `mat-form-field` elements ("Nombre del período" line ~157 and "Descripción (opcional)"
  line ~178). Both now use `style="width:100%"` only.
- **Left untouched, per the brief**: the horizontal `.date-row { gap: 12px }`, the mobile
  `@media (max-width: 600px) { .date-row { flex-direction: column; gap: 0 } }` (parent
  rhythm still applies to the `.date-row` wrapper as a whole, so on mobile the wrapper
  itself still has `16px` from its parent above and below — the inner date fields will
  stack with `gap: 0` between them which matches the pre-existing mobile layout intent),
  `.invalid-msg` (its pre-existing `margin-top: 8px` is additive to the parent's
  `gap: 16px` and is only visible when there is an actual validation error), the
  `.server-error` ring/chip, the header layout, and the add-row button.

### Verification

- `grep -c "mat-form-field" src/app/features/admin/quarters-dialog.component.ts` → **9**
  (same count as the previous approved pass — confirms no orphan code from removed
  margin-top or new flex-column wrapping; the count is the same as the grep that the
  previous implementer handoff recorded).
- `grep -n "margin-top:4px" src/app/features/admin/quarters-dialog.component.ts` → **0
  matches** (both inline occurrences were removed cleanly).
- `pnpm run build` (`./node_modules/.bin/ng build --configuration production`) → exit **0**.
  Warning count: `grep -c "WARNING" /tmp/build_fixpass2.log` → **21**, identical to
  the previous-pass baseline `/tmp/build_fixpass.log` (also **21**). No new warnings
  attributable to the touched file: `grep -c "WARNING.*quarters-dialog"
  /tmp/build_fixpass2.log` → **0**. The 21 remaining warnings are the pre-existing
  infra issues (NG8102/NG8107 in absences/dashboard/justifications/students, budget
  warnings in layout/login/justification-create/export-config/calendar, and the two
  `src/styles.css` `@import`-order warnings) — all unchanged.
- Initial bundle size: `550.25 kB | 131.13 kB` (was `550.22 kB | 131.03 kB` in the
  previous pass — +0.03 kB raw / +0.10 kB transfer from the new 3-line CSS rule). Within
  the noise band of the existing budget warning.
- `./init.sh` not re-run for this fix-pass-2 since the fix is purely CSS and was
  verified end-to-end by `ng build --configuration production` exit 0 + zero
  attributable warnings, consistent with the previous implementer pass's verification
  protocol. The previous-pass `./init.sh` PASS report (which produced only the 2
  pre-existing `[WARN]`s about empty `verify_command` and unset Supabase env vars)
  applies unchanged — no harness or DB state was touched by this CSS-only fix.

### Files modified (this fix-pass-2)

- `src/app/features/admin/quarters-dialog.component.ts` — added 5-line
  `.quarter-card-body` flex-column rule, removed `margin-top:4px` from 2 inline styles
  in the template. Net diff: +3 lines CSS, -2 inline declarations.

No spec files, no other source files, no `src/styles.css`, no harness internals were
touched. The fix lives entirely within the already-approved file.

---

## Spec amendment — user-driven visual change (session 5, 2026-08-29)

The user reviewed the live UI after the third reviewer pass and asked for the inline period
list to live **inside the `.admin-row` next to the year name** as compact chips, instead of
the previously approved "separate panel beneath the row".

The spec owner (the user) is the authority on this — per `AGENTS.md` §7 the leader can edit
`specs/` directly, and the user's instruction IS the amendment. No `approve-spec` re-run
needed.

**Spec files amended by the leader (not the implementer):**

- `specs/flexible_quarter_admin_ui/requirements.md` — R7, R8, R9, R11, R13, R14 rewritten to
  describe chips inside `.admin-row` instead of a separate panel. Note added at the bottom
  of the R7–R9 block recording the amendment date.
- `specs/flexible_quarter_admin_ui/design.md` — file-to-requirement matrix updated; the
  "Inline summary panel (R7, R8, R9)" section replaced with "Inline period chips (R7, R8,
  R9)" including DOM sketch and rationale; the "Inline summary" layout subsection
  rewritten to describe chip styling (Nunito 700/14px ordinal, Nunito 600/13px name,
  Nunito 400/11px range, `var(--paper-deep)` background, 2px `--accent` left stripe,
  `var(--radius-sm)` corners, padding `4px 8px`); discarded alternative #4 replaced
  (`mat-chip-listbox` rejected for the same Material-chrome reason), new alternative #5
  added (chips-below-row rejected because that's exactly what the user pushed back on);
  Q1 removed (resolved 2026-08-29, session 4 — answer was "Solo en el diálogo").
- `specs/flexible_quarter_admin_ui/tasks.md` — T11, T12 retained as `[x]` (reactive-state
  plumbing unchanged); **T13, T14, T15 reverted from `[x]` to `[ ]`** with chip-specific
  done-conditions; T17 expanded with step (viii) for the empty-state chip link;
  reverse-traceability table updated; amendment note added.

**Tasks the next implementer pass must redo:**

- T13 (chips inside `.admin-row`, three child spans per chip, sorted ascending)
- T14 (empty-state chip area with inline text link, NOT Material button)
- T15 (chip styles per the design.md `Inline period chips` subsection)

**Tasks that remain `[x]` and need no redo:**

- T1–T10 (dialog + backend wiring, all approved twice already)
- T11, T12 (reactive-state plumbing + dialog contract — unchanged)
- T16 (build verification — re-run only, no spec change)

**T17** — still deferred to the user (no `docker compose` in this sandbox).

---

## Chip rework (session 5+, after user amendment 2026-08-29)

The user amended R7–R9 + R13–R14 to specify inline period chips inside `.admin-row` instead of
the previously approved summary panel beneath the row. The spec files
(`requirements.md`, `design.md`, `tasks.md`) were updated by the leader; T13, T14, T15 were
reverted to `[ ]`; this pass implements those three against the chip wording. T11, T12 stay
`[x]` (reactive-state plumbing is unchanged — only the template that consumes it changes).

### What changed in `src/app/features/admin/admin.component.ts`

- **Template — AÑOS LECTIVOS tab** (`@for (y of years(); …)` block):
  - **Removed** the entire `<div class="inline-quarters-summary">` panel that previously
    rendered beneath `.admin-row` (lines 187–209 in the pre-amendment file). Gone:
    `.inline-quarters-header`, `.quarter-line`, `.quarter-line-ordinal`,
    `.quarter-line-name`, `.quarter-line-range`, `.quarter-line-empty`, the
    "Períodos configurados" header strip, the count badge, the `formatOrdinal` helper.
  - **Inserted** a new `<div class="admin-row-quarters">` **inside** `.admin-row`, between
    the year-name column and `.admin-row-actions`. Wrapped in `@if (y.isActive)` so it only
    renders for the active year. Iterates `quarterRowsFor(y.id)` with
    `@for (q of rows; track q.id)`. Each chip is one `<span class="period-chip">` with the
    three required child spans (`.period-chip-ordinal` / `.period-chip-name` /
    `.period-chip-range`) and a `title` attribute mirroring the visible content for hover
    affordance. Ordinal uses the real middle-dot character `·` (U+00B7).
  - **Added** the `@empty` branch on the same `@for`: a single
    `<span class="period-chip-empty">` containing `"Sin períodos configurados."` and an inline
    `<a class="period-chip-cta" (click)="openQuartersDialog(y)">Configurar trimestres</a>`
    link (NOT a Material `mat-button`, per the user's "no me agrada que se vea como una
    opcion aparte visualmente" rationale).
  - **Left untouched**: the year-name column, `.admin-row-actions`, the badge + 4 icon
    buttons inside `.admin-row-actions`, and the surrounding `@for` iteration / `@if
    (activeTab() === 'years')` outer gate.

- **Styles block** (the same `styles: [\`...\`]` literal that already contained `.admin-row`):
  - **Removed** the old panel styles (`.inline-quarters-summary`, `.inline-quarters-header`,
    `.quarter-line`, `.quarter-line-ordinal`, `.quarter-line-name`, `.quarter-line-range`,
    `.quarter-line-empty`) including the `rgba(15, 23, 42, .04)` shadow that the old panel
    used. Those classes no longer exist in the template, so the styles are orphaned and
    safely removed.
  - **Added** the chip styles per T15 verbatim:
    - `.admin-row-quarters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      flex: 1; min-width: 0; }`
    - `.period-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px;
      background: var(--paper-deep); border: 1px solid var(--border-soft); border-left: 2px
      solid var(--accent); border-radius: var(--radius-sm); }`
    - `.period-chip-ordinal` / `.period-chip-name` / `.period-chip-range` /
      `.period-chip-empty` / `.period-chip-cta` / `.period-chip-cta:hover` per spec.
  - All values derive from `var(--*)` tokens in `src/styles.css`; no new hex literals
    introduced.
  - The existing `.admin-row` rule is unchanged. The mobile breakpoint
    `@media (max-width: 1280px) { .admin-row { flex-direction: column; align-items:
    flex-start; } }` is unchanged — `.admin-row-quarters` inherits `width: 100%` (via `flex: 1`
    + the parent's column direction + `align-items: stretch`) on mobile, and the chips wrap
    naturally via `flex-wrap: wrap`. No mobile-specific chip rule added (the spec's "Mobile
    (<600px)" subsection says: "chips wrap to additional lines naturally via
    `flex-wrap: wrap`").

- **Class body**:
  - **Removed** `formatOrdinal(seq)` (the zero-pad helper for `.quarter-line-ordinal`).
    Orphan after the panel removal — the chip strip displays `q.sequenceNumber` followed
    by a literal `·` directly, no padding.
  - **Left untouched**: `_quartersByYear`, `quartersByYear`, `quarterRowsFor(yearId)`,
    `setQuartersForYear(yearId, quarters)`, `loadAll()` (T11), `openQuartersDialog(year)`
    (T12). All `[x]` and unchanged.

### Verification

- `pnpm run build` (`./node_modules/.bin/ng build --configuration production`) → exit
  **0**. Warning count: `grep -cE "WARNING" /tmp/build_chips_v2.log` → **21**, identical to
  the previous-pass baseline (`/tmp/build_fixpass2.log` and `/tmp/build_fixpass.log`, also
  **21**). No new warnings attributable to the touched file:
  `grep -cE "WARNING.*admin.component.ts" /tmp/build_chips_v2.log` → **0** (also returns 0
  for any admin path). The 21 remaining warnings are the pre-existing infra issues
  (NG8102/NG8107 in absences/dashboard/justifications/students, budget warnings in
  layout/login/justification-create/export-config/calendar, and the two `src/styles.css`
  `@import`-order warnings) — all unchanged.
- Initial bundle size: `550.07 kB | 130.97 kB` (was `550.25 kB | 131.13 kB` in the
  spacing-fix pass-2 — net change -0.18 kB raw / -0.16 kB transfer because the chip
  styles are smaller than the panel styles they replaced, even after gaining the
  `.admin-row-quarters` rule).
- `grep -nE "inline-quarters-summary|quarter-line|inline-quarters-header"
  src/app/features/admin/admin.component.ts` → **0 matches** (exit code 1 = no matches).
  Old panel classes are gone from both the template and the styles block.
- `grep -nE "#[0-9a-fA-F]{3,8}" src/app/features/admin/admin.component.ts` → 10 matches,
  all pre-existing inline `style="..."` declarations (the institution primary/secondary
  color-picker defaults `'#6366f1'` / `'#8b5cf6'`, the destructive `#b91c1c` icon buttons,
  the roster-import success card `#f0fdf4` / `#bbf7d0` / `#15803d`). **Zero matches
  inside the new chip styles block (lines 43–73)** — only `var(--*)` references.
- `./init.sh` not re-run for this chip-rework pass since the change is purely
  template + styles and was verified end-to-end by `ng build --configuration production`
  exit 0 + zero attributable warnings, consistent with the fix-pass-2 verification
  protocol. The previous-pass `./init.sh` PASS report (which produced only the 2
  pre-existing `[WARN]`s about empty `verify_command` and unset Supabase env vars)
  applies unchanged — no harness or DB state was touched.

### Files modified (this chip rework)

- `src/app/features/admin/admin.component.ts` — replaced the `.inline-quarters-summary`
  template block with a new `.admin-row-quarters` chip strip inside `.admin-row`;
  removed 5 old `.quarter-line*` / `.inline-quarters-*` CSS rules and 1 `.rgba(...)` shadow;
  added 8 new `.admin-row-quarters` / `.period-chip*` CSS rules; removed the unused
  `formatOrdinal()` helper.
- `specs/flexible_quarter_admin_ui/tasks.md` — checked off T13, T14, T15 (were `[ ]` after
  the user's amendment).

### Traceability after chip rework

| R<n> | Where it landed (chip-rework pass) |
|---|---|
| R7 | `src/app/features/admin/admin.component.ts:165–179` (chip strip inside `.admin-row`); chip strip wraps in `@for` from `quarterRowsFor(y.id)` (R9 sort) |
| R8 | `src/app/features/admin/admin.component.ts:172–177` (`@empty` branch: muted text + inline `<a class="period-chip-cta">` calling `openQuartersDialog(y)`) |
| R9 | `src/app/features/admin/admin.component.ts:168` (literal `{{ q.sequenceNumber }}·` with U+00B7); sort still in `quarterRowsFor(y.id)` at `:466–470` |
| R11 | unchanged (T11/T12 plumbing still drives the chip re-render in the same tick via `_quartersByYear` signal write) |
| R13 | `src/app/features/admin/admin.component.ts:43–73` (chip styles match the spec's "Inline chip signature" — `--paper-deep` bg, `--border-soft` rule, 2px `--accent` left stripe, `--radius-sm`, Nunito 700/14px ordinal, Nunito 600/13px name, Nunito 400/11px range) |
| R14 | `src/app/features/admin/admin.component.ts:46–73` (only `var(--*)` tokens, no new hex literals; empty-state link Nunito 600/12px/`var(--accent)` underline on hover; Quitar button color untouched at `var(--muted-strong)` per the dialog's approved R14 implementation) |

No new spec deviations; no other source files, no `src/styles.css`, no harness internals
were touched.

---

## Chip rework-2 (session 5+, user amendment 2026-08-29)

The user reviewed the live UI again and asked for the chips to be **vertically stacked, one
per row**, anchored in the middle column between the year name and the action buttons. They
also asked for visual polish ("Intenta que se vea visualmente bien por favor"). The
structural location inside `.admin-row` is unchanged — only the inner layout changes. The
leader will update `design.md`/`tasks.md` for the vertical-stack wording after the reviewer
approves; this pass only touches the CSS.

### What changed in `src/app/features/admin/admin.component.ts`

- `.admin-row` — changed `align-items: center` to `align-items: flex-start`. Rationale: when
  the chip stack grows vertically (now the case), keeping `align-items: center` would
  vertically re-center the year-name column and the action-buttons column against a tall
  chip stack, which usually looks odd (year name and buttons floating mid-row against a
  cluster). Pinning them to the top of the row keeps the year name as the visual anchor and
  the action buttons anchored to the same baseline — both look like the "label" for the
  chip cluster.
- `.admin-row-quarters` — removed `flex-wrap: wrap`, added `flex-direction: column`, changed
  `align-items: center` to `align-items: flex-start` (chips left-aligned within the middle
  column), reduced `gap: 8px` to `gap: 6px`. Kept `display: flex`, `flex: 1`, `min-width: 0`.
  `6px` matches the spacing scale already used inside `.period-chip` (`gap: 6px` between
  ordinal/name/range), so the cluster reads as a consistent visual rhythm.
- `.period-chip` — added `align-self: flex-start` so each chip keeps its natural width (not
  stretched to fill the column). Different chips can have different widths based on their
  date-range length — that's natural and expected (longer ranges = wider chips).
- Mobile breakpoint (`@media (max-width: 1280px)`) — no change needed. The existing rule
  only adjusts `.admin-row` (column direction) and `.admin-row-actions` (wrap); it contains
  no chip-specific rule that would need to be undone. With `flex-direction: column` on
  `.admin-row-quarters`, chips naturally stack one per row regardless of width — no need
  for a mobile-specific chip rule.
- Template — unchanged (per the brief: `.admin-row-quarters` stays inside `.admin-row`
  between name and actions; the `@for` loop, the `@empty` branch, and the three child
  spans per chip are all untouched).

No new tokens, no hex literals, no new files. Net CSS diff: 3 small changes across 3
selectors (4 lines added/changed in total).

### Verification

- `pnpm run build` (`./node_modules/.bin/ng build --configuration production`) → exit **0**.
  Warning count: `grep -cE "WARNING" /tmp/build_chips_v3b.log` → **21**, identical to the
  chip-rework v2 baseline `/tmp/build_chips_v2.log` (also **21**). Zero new warnings
  attributable to the touched file: `grep -cE "WARNING.*admin.component.ts"
  /tmp/build_chips_v3b.log` → **0**. The 21 remaining warnings are the pre-existing infra
  issues (NG8102/NG8107 in absences/dashboard/justifications/students, budget warnings in
  layout/login/justification-create/export-config/calendar, and the two `src/styles.css`
  `@import`-order warnings) — all unchanged.
- Initial bundle size: `550.07 kB | 131.13 kB` (was `550.07 kB | 130.97 kB` in the
  chip-rework v2 pass — identical raw size, +0.16 kB transfer from the 4 added CSS lines
  crossing a compression boundary; within noise band of existing budget warning).
- `grep -nE "#[0-9a-fA-F]{3,8}" src/app/features/admin/admin.component.ts` → 10 matches,
  all pre-existing inline `style="..."` declarations (the institution primary/secondary
  color-picker defaults `'#6366f1'` / `'#8b5cf6'`, the destructive `#b91c1c` icon buttons,
  the roster-import success card `#f0fdf4` / `#bbf7d0` / `#15803d`). **Zero matches
  inside the modified CSS rules (lines 37–73)** — only `var(--*)` references.
- Visual polish: the chip stack in the middle column now feels like a coherent vertical
  cluster (consistent 6px gap between chips, matching the 6px gap inside each chip);
  the year-name column and the action-buttons column stay anchored to the top of the row
  instead of being centered against a tall stack; different-length chips keep their natural
  width via `align-self: flex-start` (a 6-week chip is shorter than a 12-week chip, as it
  should be).

### Files modified (this chip rework-2)

- `src/app/features/admin/admin.component.ts` — 4 lines of CSS changed across 3 selectors
  (`.admin-row`, `.admin-row-quarters`, `.period-chip`). No template, class body, or other
  file touched.

No spec files, no other source files, no `src/styles.css`, no harness internals were
touched.

---

## T17 execution (session 5 round 6, 2026-08-29)

Docker was available in this session's shell with the full stack already running
(`frontend`:80, `backend`:3000 healthy, `excel-service`:8002, `postgres` healthy, `redis`
healthy), so the "no docker compose" deferral from the previous 5 rounds no longer applied.
Wrote `scripts/t17-smoke.mjs` — a standalone Playwright script, headless Chromium, against
the **real** running frontend/backend/postgres (no route mocking, unlike the Level-4
`scripts/visual-smoke.mjs`) — that logs in as the seeded superadmin, creates a disposable
academic year (`T17-Smoke-<random>`) inside the real "Tia Blanquita" institution, runs all
8 of T17's sub-steps against that year's own quarters only, and deletes the disposable year
+ reactivates the real "2026-2027" year in a `finally` block. Ran the script 3 times; each
run confirmed via a follow-up `GET /api/quarters` that "2026-2027"'s 3 real periods
(`Primer Trimestre` id 9, `Segundo Trimestre` id 2, `Tercer Trimestre` id 3 — the same ids/
dates/descriptions visible in the user's screenshots across prior rounds) are byte-for-byte
unchanged. Full step-by-step log + every captured request/response pair:
`progress/t17_smoke_log.json`. Screenshots: `progress/t17_smoke_multi_change.png` (after
step iv), `progress/t17_smoke_empty_state.png` (after step viii).

**Genuine discovery, not fixed (out of scope for this execution pass):** steps (v) and (vi)
surfaced a real client-side reactivity bug in `quarters-dialog.component.ts` —
`validationErrors()` is a `computed()` whose only tracked dependency is the `drafts` signal's
own version; `[(ngModel)]` bindings mutate a draft object's property in place, which never
calls `.set()`/`.update()` on the `drafts` signal, so the computed's cached Map never
invalidates for a plain edit to an already-loaded row. See the `tasks.md` T17 closing note
for the full writeup and a suggested fix direction (recommended as a follow-up feature, not
folded into this one).

### R\<n\> → test / evidence (T17 traceability)

| `R<n>` | Test / evidence | Result |
|---|---|---|
| R1 | `smoke-year-seeded-quarters` log entry: `POST /api/academic-years` seeds 3 quarters whose `name` values are plain strings (not the old literal union) — `t17_smoke_log.json` | Confirmed |
| R2 | `step-vii-direct-api-delete-already-deleted-404`: `DELETE /api/quarters/<id>` issued directly, backend responds 404 once already soft-deleted — confirms `remove()`'s contract end-to-end | 404, `{"error":"Trimestre no encontrado"}` |
| R3 | `network` log entries for the `POST /api/quarters` create calls in steps (ii)/(vi): body omits `sequenceNumber`, backend auto-assigns (`sequenceNumber: 4` for "Periodo Extra") | Confirmed |
| R4 | `step-i-rename`, `step-ii-add-fourth-period`, `step-iii-delete-period` log entries — rename/add/delete all exercised on the same dynamic draft list in one dialog session | Confirmed |
| R5 | `step-v-client-side-overlap`: `invalidMessages: []`, `saveDisabled: false` despite a real overlap between Tercer and "Periodo Extra" — **discovered bug**, see writeup above | Bug found (R5 not honored for edits to already-loaded rows) |
| R6 | Same `step-v-client-side-overlap` entry — within-AY-range validation is driven by the same stale `validationErrors()` computed, same bug applies | Bug found (same root cause as R5) |
| R7 | `step-iv-chip-dom-location`: `{"chipsContainerIsChildOfAdminRow": true, "chipCount": 3}` — chip strip renders inside `.admin-row`, sourced from `QuarterService.getAll()` | Confirmed |
| R8 | `step-viii-empty-state`: `{"emptyStateText": "Sin períodos configurados.\nConfigurar trimestres", "emptyStateChipCount": 0}`; `step-viii-reopened-via-link`: clicking the link reopens the dialog with 1 empty draft | Confirmed |
| R9 | `step-iv-chip-strip-after-save.chips`: `["Periodo Extra\n2030-01-01 → 2030-03-31", "Segundo Trimestre (Smoke)\n— → —", "Tercer Trimestre\n— → —"]` — ordered by `startDate` ascending per the amended R9 (Periodo Extra's 2030-01-01 sorts before the two null-date periods, which are pushed last) | Confirmed |
| R10 | `network` log: `GET /api/quarters` fired immediately after the save's last write in every dialog session (steps iv, viii) — fresh fetch replaces the cached `Quarter[]` | Confirmed |
| R11 | `step-iv-chip-strip-after-save` / `step-viii-empty-state` both read the chip strip **without** any `page.reload()` call in the script — same-tick re-render confirmed | Confirmed |
| R12 | `step-v-guardar-clicked-despite-overlap-bug`: `tercerHasServerErrorClass: true`, `dialogStillOpenV: true`, toast text `"Las fechas se solapan con Periodo Extra (2030-01-01 a 2030-03-31)"`; `step-vi-duplicate-name-result`: `dupCardHasServerErrorClass: true`, `dialogStillOpen: true`, toast text `"Registro duplicado"` — both a 400 and a 409 verbatim-surfaced with the dialog staying open and the failing row highlighted | Confirmed |
| R13 | `t17_smoke_multi_change.png` — paper-tab chip signature (`--paper-deep` bg, `--accent` left stripe, Nunito type) visible inline in `.admin-row` | Confirmed (visual) |
| R14 | Same screenshot — no ad-hoc colors visible; empty-state link in `t17_smoke_empty_state.png` renders as inline text, not a button | Confirmed (visual) |
| R15 | `./node_modules/.bin/ng build --configuration production` → exit 0, 21 warnings (same baseline as every prior pass in this session), zero attributable to `scripts/t17-smoke.mjs` (not part of the Angular build) or any touched `src/` file (none touched this round); `./init.sh` → `[OK] Environment ready.`, same 2 pre-existing `[WARN]`s | Confirmed |

### Chip-strip state observations (raw, from `t17_smoke_log.json`)

- **After step (iv)** (rename + add + delete, one save): 3 chips —
  `Periodo Extra · 2030-01-01 → 2030-03-31`, `Segundo Trimestre (Smoke) · — → —`,
  `Tercer Trimestre · — → —`. Order matches R9's amended `startDate`-ascending sort
  (nulls last); `Periodo Extra` is the only one with real dates, sorts first.
- **After step (viii)** (all periods deleted): 0 chips, replaced by the
  `.period-chip-empty` placeholder text `"Sin períodos configurados."` plus the inline
  `.period-chip-cta` link `"Configurar trimestres"`.

### Request/response pairs (representative sample, full set in `t17_smoke_log.json`)

```
POST /api/academic-years  {"name":"T17-Smoke-62178"}
  -> 201 {"id":13,"name":"T17-Smoke-62178","isActive":true,...}   (auto-deactivates 2026-2027, seeds 3 quarters)

DELETE /api/quarters/<Primer Trimestre id>
  -> 204

PUT /api/quarters/<Segundo Trimestre id>  {"name":"Segundo Trimestre (Smoke)",...}
  -> 200 {...,"name":"Segundo Trimestre (Smoke)",...}

POST /api/quarters  {"name":"Periodo Extra","startDate":"2030-01-01","endDate":"2030-03-31"}
  -> 201 {...,"sequenceNumber":4,...}

PUT /api/quarters/<Tercer Trimestre id>  {"startDate":"2030-02-01","endDate":"2030-04-30",...}
  -> 400 {"error":"Las fechas se solapan con Periodo Extra (2030-01-01 a 2030-03-31)"}

POST /api/quarters  {"name":"Periodo Extra",...}   (duplicate name, sent via the real UI after
                                                     the nudge workaround documented in tasks.md)
  -> 409 {"error":"Registro duplicado","detail":"duplicate key value violates unique constraint
          \"quarters_academic_year_id_name_key\""}

DELETE /api/quarters/<already-deleted Primer Trimestre id>
  -> 404 {"error":"Trimestre no encontrado"}

PUT /api/academic-years/<2026-2027 id>  {"isActive":true}   (cleanup)
  -> 200 {...,"name":"2026-2027","isActive":true,...}

DELETE /api/academic-years/<smoke year id>   (cleanup)
  -> 204
```

### Verification

- `./node_modules/.bin/ng build --configuration production` → exit **0**, 21 warnings
  (identical count to every prior pass this session), 0 attributable to any file touched
  this round (only `scripts/t17-smoke.mjs`, `specs/flexible_quarter_admin_ui/tasks.md`,
  and this file were touched — no `src/` changes).
- `./init.sh` → `[OK] Environment ready.` Same 2 pre-existing `[WARN]`s (empty
  `verify_command`, unset `SUPABASE_URL`/`SUPABASE_ANON_KEY`).
- Real-data integrity re-verified via direct `curl` against `/api/academic-years` and
  `/api/quarters` (superadmin JWT + `X-Institution-Id: 2`) after 3 script runs: "2026-2027"
  is `isActive: true`, and its 3 quarters (ids 2, 3, 9) show identical `startDate`,
  `endDate`, `description`, and `updatedAt` timestamps to the pre-T17-execution baseline
  captured at the top of the session — i.e. genuinely untouched, not merely "restored to
  the same values".

### Files modified (T17 execution)

- `scripts/t17-smoke.mjs` — new file, the T17 smoke test script.
- `specs/flexible_quarter_admin_ui/tasks.md` — checked off `T17`; replaced the "T17
  deferred" blockquote with the "T17 executed" writeup.
- `progress/impl_flexible_quarter_admin_ui.md` — this section.

No `src/` files were touched by this round.

---

## Reactivity bug fix (session 5 round 7, 2026-08-29)

Fixed the client-side reactivity bug discovered in round 6's T17 execution (see above):
`quarters-dialog.component.ts`'s `validationErrors()` `computed()` never re-ran after
editing a field on an *already-loaded* draft row, because `[(ngModel)]="draft.xxx"`
mutates the plain object property in place without ever calling `.set()`/`.update()` on
the `drafts` signal itself. `addDraft()`/`markDeleted()` already worked correctly (they
call `.update()`), which is why the bug only manifested on in-place edits.

### What changed

- **`src/app/features/admin/quarters-dialog.component.ts`** — renamed the existing
  `clearServerError(draft)` method (previously bound to `(ngModelChange)` on all 4
  editable draft fields: name, startDate, endDate, description) to
  `onDraftFieldChange(draft)`. It keeps the original "clear the server-error highlight on
  edit" behavior and adds one line: `this.drafts.update(list => [...list])`. This is a
  shallow array-copy "poke" — the array's *contents* are unchanged (same, already-mutated
  object references), but the *reference itself* changes, which is exactly what
  `computed()` tracks. Chose this approach (design doc's "Option B") over rewriting every
  `[(ngModel)]` into `[ngModel]` + a per-field `updateDraftField(...)` handler (`Option
  A`) because it reuses the exact wiring already present on all 4 fields (smallest diff,
  same file convention `addDraft`/`markDeleted` already establish of calling
  `drafts.update(...)` to trigger recomputation) — commented inline explaining why the
  no-op-looking array copy exists, per the instruction to avoid it looking like dead code.
  Covers every editable field: confirmed via `grep -n "ngModel"` that all 4
  `[(ngModel)]`-bound fields (`draft.name`, `draft.startDate`, `draft.endDate`,
  `draft.description`) now call `onDraftFieldChange(draft)` on `(ngModelChange)`, not just
  the dates the bug was originally found through.

### Verification

- `./node_modules/.bin/ng build --configuration production` → exit **0**, 21 warnings
  (`grep -c WARNING` on the build output), identical to the session baseline — 0 new
  warnings attributable to the touched file.
- Docker stack was rebuilt (`docker compose build frontend`) and the container recreated
  (`docker compose up -d frontend`) — the frontend container is nginx serving a
  build-time-baked `dist/` (no bind-mount/hot-reload for the compiled bundle), so a local
  `ng build` alone does not change what the running container serves; this step was
  required before re-running the Playwright smoke test against the fix.
- Re-ran `node scripts/t17-smoke.mjs` (the exact T17 script from round 6) against the
  rebuilt stack:
  - **Before rebuilding the image** (sanity check, ran once against the *old* image to
    confirm the bug reproduces under the same script): `step_v_client.saveDisabled: false`
    with `invalidMessages: []` despite editing an overlap into existence — same bug as
    round 6, confirming nothing else had silently fixed it.
  - **After rebuilding+recreating the frontend container**: `step_v_client.saveDisabled:
    true` with two `"Las fechas se solapan con Periodo Extra."` messages, immediately
    after the `.fill()`+`.blur()` on the overlapping dates — no click of Guardar needed.
    Because `saveDisabled` is now correctly `true`, the script's `if (!saveDisabled) {
    ...click Guardar... }` branch is skipped entirely, so `step_v_backend_via_ui` is now
    `null` (previously it clicked Guardar over the actual bug and got a 400 back — that
    path is simply unreachable now, since the button is correctly disabled before Guardar
    is ever clickable).
  - Step (vi)'s `preNudge` (read immediately after typing the duplicate name, before the
    script's own "nudge" workaround runs) now already shows `saveDisabled: false` and
    `invalidMessages: []` — identical to `postNudge`. This proves the nudge workaround
    (adding then removing a disposable row purely to force a stale recompute) is no
    longer necessary; the script still performs it (harmless no-op now) since the script
    itself wasn't rewritten this round.
  - All 8 T17 sub-steps' `pass` flags remain `true`; `cleanup.pass: true` (real
    "2026-2027" year confirmed untouched: `realYearActive: true`, and its 3 quarters'
    ids/dates/descriptions unchanged).
- `./init.sh` → `[OK] Environment ready.` Same 2 pre-existing `[WARN]`s (empty
  `verify_command` in `.harness.json`; unset `SUPABASE_URL`/`SUPABASE_ANON_KEY`) —
  unrelated to this change, unchanged from every prior round's baseline.
- Added a `fixVerification` top-level note to `progress/t17_smoke_log.json` (the script
  overwrites that file on every run, so the note was added back in after the final
  re-run) documenting this fix and the before/after `step_v_client`/`step_vi` diff.
- `specs/flexible_quarter_admin_ui/tasks.md` — added a "Reactivity bug fixed" blockquote
  directly after the round-6 "T17 executed" blockquote (which reported the bug),
  confirming the fix and the re-run result, without rewriting T17's or T6's original
  done-condition wording.

### T6 done-condition note (awareness, not a rewrite)

T6's stated done-condition ("with 4 draft rows where rows 2 and 3 overlap... removing the
overlap re-enables it") is most naturally read as rows that already overlap when the
dialog/drafts are initialized (i.e., `drafts()` was freshly `.set()`, so `computed()` saw
it immediately) — not as *editing* an existing row into/out of overlap, which was the
actual bug's failure mode. T6's original wording is left unchanged per the round-7 brief
("don't rewrite T6's wording, just be aware of this distinction"); this fix makes both
the load-time and the edit-time cases work identically, so T6's condition holds either
way going forward.

### Files modified (this round 7 fix)

- `src/app/features/admin/quarters-dialog.component.ts` — renamed `clearServerError` to
  `onDraftFieldChange`, added the `drafts.update(list => [...list])` poke, updated the 4
  `(ngModelChange)` template bindings and 1 code comment reference accordingly.
- `progress/t17_smoke_log.json` — added `fixVerification` top-level note (script-generated
  content otherwise unchanged from this round's re-run).
- `specs/flexible_quarter_admin_ui/tasks.md` — added the "Reactivity bug fixed" blockquote
  note after the T17 execution writeup.
- `progress/impl_flexible_quarter_admin_ui.md` — this section.

No other `src/` files touched. No spec deviations — this is a bug fix, not a new
requirement; no `requirements.md`/`design.md` change needed.
