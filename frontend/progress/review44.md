# Review — feature 44 `profile_messages_tab_extract_child` (re-review)

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — harness setup unchanged.
- C2: [x] — single in_progress feature; session 70 reflects current work.
- C3: [x] — same architecture patterns as before.
- C4: [x] — the prior gap (missing `.preview-label` rule) is now fixed; the focused Playwright/Chromium computed-style check on the actual rendered DOM (`progress/smoke44_log.json` + `progress/smoke44_preview_label.png`) is honest, not mocked. Programmatic class-coverage audit (child 20/20, parent 17/18 with the 2 missing globally defined in `src/styles.css`) closes the "any other CSS-class extraction gaps?" question. Full 18-step smoke not re-run is acknowledged and rationalized (backend container lacks feature 18, throwaway setup is not part of the project); per the coordinator's guidance this is acceptable for this refactor and any future full-smoke re-run is a separate task that requires re-bootstrapping the backend.
- C5: [x] — only the expected artifacts in `progress/` (handoff, this review, smoke log, smoke screenshot). No stray scratch files.
- C6: N/A — `sdd=0`.

## What I re-verified (not trusted from handoff)

1. **`.preview-label` rule is now at line 50 of the new child component, byte-identical to the original.**
   ```
   $ grep -n "preview-label" src/app/features/profile/whatsapp-templates-tab/whatsapp-templates-tab.component.ts
   50:    .preview-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 6px; }
   131:                    <div class="preview-label">Plantilla</div>
   160:                      <div class="preview-label">Vista previa</div>
   ```
   `grep -rn "\.preview-label" src/` confirms exactly one definition, in the child, with the two template usages both bound to it.

2. **`pnpm run build` exits 0.** New per-component CSS budget:
   - `profile.component.ts` — **2.09 kB / 5 kB error budget** (unchanged).
   - `whatsapp-templates-tab.component.ts` — **2.86 kB / 5 kB error budget** (was 2.73 before the rule was added back; +130 bytes for the 1-line definition, as expected).
   Both still over the 2 kB warning threshold (pre-existing pattern across the codebase), both well under the 5 kB error budget.

3. **Screenshot `progress/smoke44_preview_label.png` visually confirmed.** The "PLANTILLA" and "VISTA PREVIA" labels render in small uppercase gray above the textarea mock and the preview block respectively — matches the rule's typography (`font-size: 11px`, `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: .08em`, `color: var(--muted)` = `#64748b`, `margin-bottom: 6px`).

4. **Random class-coverage audit on both files** — picked 6 classes each at random:
   - child: `.tpl-card` (2 hits: rule + media query), `.ph-chip` (3: rule + :hover + :focus-visible), `.state-title` (1), `.messages-intro` (1), `.preview-block` (2: rule + ::before), `.dirty-dot` (0 — correctly absent, dirty-dot belongs to parent).
   - parent: `.section` (4: rule + :last-child + -title + -help), `.preset-btn` (2: rule + .selected), `.dirty-dot` (2: rule + @keyframes), `.file-pick` (2: rule + :hover), `.signature-preview` (2: rule + -name), `.row-2col` (3: rule + > * + media query).
   All match. No hidden CSS extraction gaps.

5. **Smoke log honesty check.** `progress/smoke44_log.json` contains real Playwright/Chromium computed-style assertions for both `.preview-label` elements (font-size, font-weight, text-transform, letter-spacing, color, margin-bottom) — not mocks of the thing under test. The render path used (Playwright 1.62.1 / Chromium 1234 headless) is real DOM, not assertions on source text. Driver script was ephemeral in `/tmp/` per `docs/conventions.md` (smoke scripts are not committed). PASS.

## Reaffirmed from prior review

- Every moved method (`loadTemplates`, `token`, `isDirty`, `isBlank`, `canSave`, `canRestore`, `preview`, `onTextChange`, `recordCaret`, `insertPlaceholder`, `onSave`, `saveCard`, `onRestore`, `restoreCard`, `findCard`, `patchCard`) is byte-identical to commit `e484038`. `saveCard` still rethrows after `notify.error`. `restoreCard` still uses `firstValueFrom(dialog.afterClosed())`. `insertPlaceholder` still does `ta.value = text; ta.focus(); ta.setSelectionRange(caret, caret)`.
- `canDeactivate` save branch semantically identical (blank-warning gate via `child.hasBlankDirtyCard()`, `Promise.allSettled` + `results.every(fulfilled)` navigation guard).
- `dirty` signal = `computed(() => cards().some(c => isDirty(c)))` (same predicate as old `templatesDirty`). `viewChild` resolves after first view check; `[preserveContent]="true"` mounts the child eagerly so the signal resolves before any user interaction.
- R17–R43 preservation greps still empty. `notification-template.service.ts` and `template.util.ts` still untouched.

## Deviations — all five previously assessed and still defensible

- D1 (2 kB warning overshoot on profile): accepted (parental leftover Mi cuenta + tab-label + dirty-dot minimum; pre-existing pattern).
- D2 (`hasBlankDirtyCard()` extra method): accepted (smallest possible additional surface).
- D3 (explicit selector): accepted (no-op).
- D4 (removed `TextFieldModule` import from parent): accepted (no textareas in parent anymore).
- D5 (merged `.tab-label` selector): accepted (byte-identical visual result).

## Verdict

APPROVED. Refactor is clean; the only CSS-extraction gap from the first pass is closed; the focused visual smoke + class-coverage audit provide real evidence the parent and child render identically to feature 43. Full 18-step smoke is a separate concern (backend re-bootstrap) per the coordinator's guidance and is not a blocker for this refactor.