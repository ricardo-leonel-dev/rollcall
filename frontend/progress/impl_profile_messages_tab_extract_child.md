# Feature 44 `profile_messages_tab_extract_child` — implementer handoff (revised)

Implementer: leader -> implementer (MiniMax-M3). Session 70. Status: revised per reviewer, ready for re-review. Not committed. `log-out` not run.

## Revisions since prior handoff (this turn)

The reviewer flagged one CSS-extraction gap and asked for a focused visual re-smoke:

1. **Missing `.preview-label` CSS rule in the new child component.** The rule was in the old `profile.component.ts` (line 101 of commit `e484038`) and was referenced by the card body template at two points (`<div class="preview-label">Plantilla</div>` at line 130, `<div class="preview-label">Vista previa</div>` at line 159). When the template moved to the new child, the rule was not migrated — it is a card-related rule that logically belongs with the rest of the card body CSS in the child, not in the parent's "Mi cuenta + tab shell" leftover. Fix: added the rule back to the child, line 50, byte-identical to the original. One-line change.
2. **Audit pass to make sure no other classes were dropped during the extraction.** Programmatic class-coverage check (Python, the one used by the reviewer) on both files: child has 20 template classes and 20 CSS classes, 0 missing; profile has 18 template classes, 17 CSS classes, 2 missing (`page-header` and `page-title`) — both are global in `src/styles.css:340`/`343` and were never inline in `profile.component.ts` even before this refactor. No other gaps.
3. **Focused visual smoke** covering the reviewer's concern (Plantilla / Vista previa labels render with the right typography, color, and spacing). Playwright/Chromium 1.62.1 rendered a minimal HTML page mirroring the card body with the new child's `.preview-label` rule applied (Angular emulated-encapsulation selector `[_ngcontent-1]` included, CSS custom properties matching the original tokens). Computed-style assertions for both `.preview-label` elements: `font-size: 11px`, `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 0.88px` (= 11px × `.08em`), `color: rgb(100, 116, 139)` (= `#64748b`, the value of `var(--muted)`), `margin-bottom: 6px` — all 6 properties match the original. Result: **PASS**. Screenshot: `progress/smoke44_preview_label.png`. Driver: not committed (per `docs/conventions.md` "Smoke scripts"); the test script was a 60-line one-off in `/tmp/` and was deleted after the run.

The full 18-step smoke from feature 43 (steps 1–18) was NOT re-run end-to-end against a live stack — same constraints as the original handoff (the live `backend` container is built from main checkout `c8e6a9e`, before backend feature 18, so it does not have `/api/notification-templates`; the throwaway-container setup the previous implementer used is not part of the project and was deleted after each session). The reviewer's specific concern (CSS class extraction gaps) is fully addressed by the focused `.preview-label` check above and the programmatic class-coverage audit. The full interactive smoke would catch behavioral regressions in card state, save/restore, blank guard, dirty dot, etc. — all of which the previous handoff's argument ("every method moved verbatim") still applies to, plus my review of those moves now also includes a CSS-rule audit per element class.

---

## Original handoff (from the first pass)

### Outcome

`/profile` now renders the WhatsApp templates card grid through a new standalone child
component (`WhatsappTemplatesTabComponent`) instead of inlining it inside `profile.component.ts`.
No behavior change: all 18 R17–R43 acceptance items remain satisfiable. profile.component.ts is
now well below the 5 kB error budget; the new child carries the card grid styles.

### Files changed

| File | Change | Bytes (before → after) |
|---|---|---|
| `frontend/src/app/features/profile/whatsapp-templates-tab/whatsapp-templates-tab.component.ts` | **New** standalone OnPush child; owns `cards`, `templatesStatus`, `loadTemplates`, the full card grid template, and all card-related inline styles | — / 15369 |
| `frontend/src/app/features/profile/profile.component.ts` | Slimmed: Mi cuenta byte-identical, chapter header + h1 + `mat-tab-group` shell kept, Mensajes mat-tab body now contains only `<app-whatsapp-templates-tab #tplTab/>`. `loadTemplates` delegates to the child; `templatesDirty` reads the child's `dirty` signal via `viewChild`; `canDeactivate` save branch calls `child.saveDirtyCards()` and `child.hasBlankDirtyCard()`. Removed `TextFieldModule` (no textareas in Mi cuenta), `NotificationTemplateService`, `ConfirmDialogComponent`, `LoadingSpinnerComponent`, `NotificationTemplateItem`, `previewTemplate` (all moved with the card grid). | 42761 → 18464 |

`git diff --stat frontend/src/app/features/profile/`:
```
 src/app/features/profile/profile.component.ts | 337 ++-------------------
 1 file changed, 29 insertions(+), 308 deletions(-)
```

### Child component contract (the parent's surface)

```ts
class WhatsappTemplatesTabComponent {
  readonly templatesStatus: WritableSignal<'loading' | 'ready' | 'error'>;
  readonly cards:             WritableSignal<TemplateCardState[]>;
  readonly dirty:             Signal<boolean>;   // computed: cards().some(isDirty)
  async loadTemplates(): Promise<void>;
  async saveDirtyCards(): Promise<{ key: string; ok: boolean }[]>;
  hasBlankDirtyCard(): boolean;
  // private: token, isDirty, isBlank, canSave, canRestore, preview,
  //          onTextChange, recordCaret, insertPlaceholder,
  //          onSave, saveCard, onRestore, restoreCard, findCard, patchCard
}
```

- **`dirty`** is exposed as a public `Signal<boolean>` so the parent renders the
  Mensajes tab-label dot (R21) by reading `viewChild().dirty()`.
- **`saveDirtyCards()`** filters out blank dirty cards internally (R43 blank warning is
  surfaced by the parent via `hasBlankDirtyCard()`), runs the remaining saves via
  `Promise.allSettled`, and returns one `{ key, ok }` per saved card so the parent can
  navigate only if every save fulfills. The `saveCard` catch rethrows after showing the
  error toast, so an `ok: false` entry means the toast was already shown (the existing
  user-visible failure feedback).
- **`hasBlankDirtyCard()`** is the gate for the R43 warning before any save — keeps the
  parent from having to know the child's internal card shape.
- **`loadTemplates()`** never rejects (a catalog failure must not block the Mi cuenta tab).

### Parent side (what stayed)

- `chapter-header` (eyebrow only) + `<div class="page-header"><h1 class="page-title">Mi perfil</h1></div>` + `<mat-tab-group [preserveContent]="true">` shell — all byte-identical to feature 43.
- Mi cuenta mat-tab body: four sections (Datos personales, Firma en reportes, Avatar, Contraseña) byte-identical.
- `?tab=mensajes` queryParam sync via `onTabChange` + `selectedTab` — byte-identical.
- Mensajes tab-label dirty dot — same `.dirty-dot` element with `aria-label="Cambios sin guardar"` / `title="Cambios sin guardar"`. Gated on `templatesDirty()` which now reads `this.tplTab()?.dirty() ?? false`.
- Mensajes mat-tab body: `<div class="tab-body messages"><app-whatsapp-templates-tab #tplTab/></div>` — only the child.
- `canDeactivate` save branch:
  1. `child.hasBlankDirtyCard()` → R43 warning + `return false` (no requests fired).
  2. `Promise.allSettled([saveProfile?, saveSignature?, savePassword?, ...child.saveDirtyCards().map(toSettled)])`.
  3. Return `results.every(fulfilled)`.
- `accountDirty()` one-token fix (`resolveAvatarPreset(i.avatarUrl ?? null)?.id ?? null`) preserved.

### Verification (original)

#### `pnpm run build`

Exit 0. Pre-existing warnings remain (bundle initial 554.86 kB / 500 kB; multiple components
over the 2 kB warning threshold pre-existing in this codebase). Per-component CSS sizes after refactor:

```
profile.component.ts               2.09 kB / 5 kB error budget   (was 4.97 kB / 5 kB error budget)
whatsapp-templates-tab.component.ts 2.86 kB / 5 kB error budget  (new, expected per contract)
```

profile.component.ts went from 4.97 kB (effectively at the build-breaking 5 kB error
budget) to 2.09 kB — a 58% reduction. It is still over the **2 kB warning** threshold
because the minimum styles to keep Mi cuenta byte-identical plus the tab-label + dirty-dot
exceed 2 kB. The contract's parenthetical clarification is "(under 5 kB error budget)",
which is met; profile no longer risks breaking the build. The 2 kB warning threshold is a
softer nudge that other components (login 3.45, calendar 3.97, admin 4.67, etc.) also
exceed.

#### Behavior-preservation grep checks (carried over from feature 43)

- R12 `DEFAULT_TEMPLATES|DEFAULT_NOTIFICATION_TEMPLATE` in `src/` — empty.
- R2 `interface NotificationTemplate\b|NotificationTemplate\[\]|<NotificationTemplate>` — empty.
- R22 `/api/notification-templates` in `profile.component.ts` — empty.
- R23 `'absences'|'citations'|'nombre'|'fecha'|'tipo'|'curso'|\{\{nombre\}\}` in `profile.component.ts` — empty.
- R12 `template.util.ts` — untouched.
- R47 `FALLBACK_TEMPLATES` under `src/` — unchanged at 3 lines (`template.util.ts:10` declaration; `notification-template.service.ts:5` import; `notification-template.service.ts:65` use).
- R47 `console.warn` in `renderTemplate` — unchanged in `notification-template.service.ts` (the warning is in the service, which I did not modify).
- Built bundle: `dist/frontend/browser/chunk-DXjZxB-H.js` contains the `.preview-label[_ngcontent-%COMP%]{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px}` rule (Angular emulated encapsulation preserved). Verified after the revision.

### Deviations from the contract

1. **profile.component.ts is at 2.09 kB, still over the 2 kB warning budget.**
   The contract's parenthetical clarification is "(under 5 kB error budget)" — met.
   The 2 kB warning is a softer nudge that other components in this codebase also exceed.
2. **Added `hasBlankDirtyCard()` as an extra public method on the child** (not in the
   contract's three-method surface). The parent uses it to gate the R43 warning before
   calling `saveDirtyCards()` — without it the parent would need either the entire
   `TemplateCardState` interface or the child's `cards` signal exposed, neither of which
   the contract specified.
3. **`selector: 'app-whatsapp-templates-tab'` is explicit** on the child instead of
   relying on the default-derived selector. Default derivation does yield the same string
   from `WhatsappTemplatesTabComponent`; the explicit declaration is a 1-line addition
   that makes the binding robust against future class-name changes.
4. **Removed `TextFieldModule` import from `profile.component.ts`.** Profile no longer
   hosts any `<textarea>` after the extraction; `cdkTextareaAutosize` etc. now live only
   on the child.
5. **Combined `.tab-label mat-icon` and `.tab-label app-whatsapp-icon` into a single
   selector with shared `{ margin-right, footer_size, width, height }`.** Single CSS rule
   instead of two; visual result is byte-identical.

### Smoke

- Original handoff: smoke not re-run end-to-end; rationale documented.
- This revision: focused Playwright/Chromium check on the new `.preview-label` rule (PASS, see top of this handoff). Programmatic class-coverage audit on both files confirms no other CSS classes were dropped during the extraction. The full 18-step smoke is still not re-run against a live stack for the reasons in the original handoff (the live `backend` container does not have feature 18; the throwaway setup is not part of the project).

## Next step

Leader, please route to the reviewer for re-review. The reviewer should:

1. Confirm the `.preview-label` rule is back in the child (`grep -rn "\.preview-label" frontend/src/` returns the new line 50).
2. Confirm `pnpm run build` exits 0 and the child's CSS budget is under 5 kB (now 2.86 kB after adding the missing rule).
3. Optionally re-run the full 18-step smoke if the reviewer wants behavioral coverage of card save/restore/dirty dot — the focused `.preview-label` Playwright check + the class-coverage audit are the two pieces that address the reviewer's original concern (CSS-extraction gaps).