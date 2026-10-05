# Review — feature 43 `profile_whatsapp_templates_tab`

**Verdict:** APPROVED

Session #69, `leader -> implementer (Opus 5.5)`.

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, `docs/*`, `CHECKPOINTS.md` all populated; `./init.sh` exits 0.
- C2: [x] — only feature 43 is `in_progress`; spec approved by Ricardo Aguilar; session 69 reflects real work, handoff and 16 smoke artifacts present.
- C3: [x] — `src/` follows `docs/architecture.md` (standalone + `OnPush` + signals + `inject()`); pure template helpers in `shared/utils/template.util.ts`; no cross-feature imports; `console.warn` in `renderTemplate` is the only deliberate fallback path and is required by R47.
- C4: [x] — no automated suite yet (feature 42 still pending, see `docs/conventions.md` and `docs/verification.md`); Level 1 build (`pnpm run build`) exits 0; the 18-step manual smoke in `progress/smoke43_log.json` (97 checks, all `pass: true`) is the agreed substitute.
- C5: [x] — no smoke driver committed (`frontend/scripts/` contains only harness-installed scripts plus pre-existing project scratch); no stray debug rules or dead CSS in the diff; the only console output this feature adds is the R47 `console.warn`.
- C6: [x] — `specs/profile_whatsapp_templates_tab/{requirements,design,tasks}.md` exist; EARS syntax preserved; T1–T24 all checked with matching code; every `R<n>` mapped to code/build/smoke evidence below.

## Spec conformance

### Model & service (R1–R12, R46–R51)
- R1 — `NotificationTemplatePlaceholder` + `NotificationTemplateItem` declared exactly per design (`core/models/index.ts` lines 325–338).
- R2 — `grep -rn "interface NotificationTemplate\b\|NotificationTemplate\[\]\|<NotificationTemplate>" src/` returns no output.
- R3 — `items` signal exposed via `_items.asReadonly()`; order preserved by `Array.find` over `_items()`.
- R4 — `load()` memoizes `loadPromise`; same promise returned on repeat calls.
- R5 — `load()` keyed by `auth.currentUser()?.id`; mismatch clears memo + `_items.set([])`.
- R6 — `.catch` clears `loadPromise` and rethrows; `ensureLoaded()` swallows.
- R7 — `getTemplate(actionKey)` = `findItem(...).template ?? ''`; cache only, no fallback.
- R8 — `saveTemplate` updates `_items` via `replace()` **after** the awaited PUT resolves.
- R9 — `restoreDefault` uses `encodeURIComponent(actionKey)`; updates cache after the awaited DELETE resolves.
- R10 — `replace()` runs only on success; error rethrown.
- R11 — `renderTemplate` calls `fillTemplate(item.template, vars)`; `fillTemplate` uses `replaceAll(\`{{${key}}}\`, () => value)` so both pattern and replacement are literal.
- R12 — `grep -rnw "DEFAULT_TEMPLATES\|DEFAULT_NOTIFICATION_TEMPLATE" src/` returns no output.
- R46/R47 — empty fallback path emits exactly one `console.warn` per call (smoke step 14 records one warn for `absences`, one for `citations`; smoke step 17 records zero).
- R48 — `FALLBACK_TEMPLATES` byte-identical to `postgres/24_message_template_actions.sql` (verified line-by-line); `EMERGENCY COPY` comment present; `grep -cF` for both literals prints `1`; `grep -c "EMERGENCY COPY"` prints `1`.
- R49 — `grep -rn "FALLBACK_TEMPLATES" src/` prints exactly 3 lines: declaration in `template.util.ts:10`, import in `notification-template.service.ts:5`, use in `renderTemplate` at `notification-template.service.ts:65`.
- R50 — `hasTemplate(actionKey)` = `!!findItem(...)`.
- R51 — `ensureLoaded()` is `async`, awaits `load()` inside `try { } catch { /* swallowed */ }`.

### Consumers (R13–R16, R52–R57)
- R13 — `absences.component.ts` notifyGuardian builds `vars = { nombre, fecha, tipo, curso }` and calls `renderTemplate('absences', vars)` (lines 1207–1218).
- R14 — `citations.component.ts` notifyGuardian builds `vars = { nombre, fecha }` and calls `renderTemplate('citations', vars)` (lines 349–360).
- R15 — `ensureLoaded()` awaited inside the reserved-tab branch when `hasTemplate()` returns false (both consumers).
- R16 — `grep -nE 'replace\(.*\{\{'` in either component returns no output.
- R52 — URL pattern `${whatsappLink}?text=${encodeURIComponent(message)}` (both consumers).
- R53 — fast path (`hasTemplate` true) opens `window.open(finalUrl, '_blank')` synchronously, no `await` before it.
- R54 — slow path reserves `window.open('', '_blank')` synchronously before the `await ensureLoaded()`.
- R55 — reserved popup navigated via `reserved.location.href = url`, with the `null` fallback to a fresh `window.open`.
- R56 — `Promise.all` in both `ngOnInit` uses `templateService.ensureLoaded()` (not `load()`); verified `grep -n "templateService.load()" absences.component.ts citations.component.ts` is empty.
- R57 — `isJustified` (absences) and `target.status === 'closed'` (citations) early returns still open the bare `whatsappLink`; smoke step 18 confirms no `?text=` for either.

### Profile page (R17–R43)
- R17 — template renders `app-chapter-header` (eyebrow only) → `<div class="page-header"><h1 class="page-title">Mi perfil</h1></div>` → `<mat-tab-group>` with `Mi cuenta` then `Mensajes de WhatsApp`. Smoke step 1 captures all three pieces in order.
- R18 — `Mi cuenta` body is the four pre-existing sections; the old `Mensaje de notificación` markup is gone (verified by smoke step 1's section list `["DATOS PERSONALES","FIRMA EN REPORTES","AVATAR","CONTRASEÑA"]`).
- R19 — `selectedTab` defaults to 1 iff `tab === 'mensajes'`, otherwise 0; smoke step 2 opens with `?tab=mensajes` and selects the second tab.
- R20 — `onTabChange` navigates with `queryParamsHandling: 'merge'` and `replaceUrl: true`; smoke step 2 verifies no dialog and `Back` leaves `/profile` (lands on `/home`, no extra history entry).
- R21 — dirty dot rendered inside each tab `<ng-template mat-tab-label>` with `aria-label="Cambios sin guardar"` and `title="Cambios sin guardar"`. Smoke step 4 confirms Mensajes dot appears while Mi cuenta does not.
- R22 — `ngOnInit` calls `loadTemplates()` (which itself delegates to `templateService.load()`) inside `Promise.all([GET /api/auth/me, ...])`; `grep -n "/api/notification-templates" profile.component.ts` is empty.
- R23 — `cards()` is rendered with `@for (card of cards(); track card.item.actionKey)`; `grep -nE "'absences'|'citations'|'nombre'|'fecha'|'tipo'|'curso'|\{\{nombre\}\}" profile.component.ts` is empty.
- R24 — `templatesStatus() === 'loading'` renders `<app-loading-spinner message="Cargando mensajes…" />`; smoke step 2 (with 2s delayed GET) verifies it appears before any card.
- R25 — error state with icon `cloud_off`, copy "No se pudieron cargar los mensajes / Revisa tu conexión e inténtalo de nuevo.", `Reintentar` button → `loadTemplates()`; `Mi cuenta` tab remains usable (smoke step 11).
- R26 — empty state with icon `chat_bubble_outline` and copy "No hay mensajes para configurar / Cuando la institución habilite notificaciones por WhatsApp, aparecerán aquí." (smoke step 16, run against local DB only).
- R27 — card heading uses `card.item.label`, description conditional on `card.item.description`, pill `Personalizado`/`Predeterminado` based on `card.item.isCustom`.
- R28 — card textarea is initialized with `item.template` (line 466 `text: item.template`); smoke step 3 confirms equality for a fresh user and smoke step 7 confirms reload shows the saved text.
- R29 — one chip per `card.item.placeholders`; `[title]="p.label"` and `[attr.aria-label]="p.label"` set on each `<button class="ph-chip">`; smoke step 2 records the catalog labels exactly.
- R30 — `insertPlaceholder` slices on `caret..caretEnd`, writes DOM value, focuses, calls `setSelectionRange` synchronously; smoke step 5 verifies caret-at-9 inserts the token at 9 and lands at 18, and that selecting `Estimado` + clicking `{{nombre}}` replaces the word.
- R31 — preview block uses `previewTemplate(c.text, c.item.placeholders)`; rendered with the notebook-margin rule. Smoke step 3 records the rendered sample string with all placeholders filled.
- R33 — `canSave` = `isDirty && !isBlank && !busy`; smoke steps 3, 6, 7 confirm disabled/enabled transitions.
- R34 — `saveCard` patches the response into both `item` and `text`, fires `notify.success('Mensaje guardado')`; smoke step 7 confirms toast, pill flip, and dot gone.
- R35 — error toast uses `err?.error?.error ?? 'No se pudo guardar el mensaje'` (smoke step 11 confirms); text/baseline kept because `patchCard(key, { busy: true })` runs before the request and `replace()` runs only on success.
- R36 — `canRestore` = `!busy && (isCustom || text !== defaultTemplate)`; smoke step 7 confirms disabled after save.
- R37 — `restoreCard` opens `ConfirmDialogComponent` with title/message/labels/icon/severity from design.md; smoke step 9 records exact dialog copy including «Citaciones». `Cancelar` returns; `Restaurar` triggers `restoreDefault`, fires toast `Mensaje restaurado`, applies response.
- R38 — local revert path: `if (!c.item.isCustom) { patchCard(key, { text: c.item.defaultTemplate }); return; }` — no dialog, no HTTP request (smoke step 10).
- R39 — `restoreDefault` failure → `notify.error(err?.error?.error ?? 'No se pudo restaurar el mensaje')` (smoke step 11); text/pill kept because the failure path doesn't patch.
- R41 — `hasDirty()` = `accountDirty() || templatesDirty()`; `accountDirty` extracted from the prior single method.
- R42 — `canDeactivate` save branch includes `...dirtyCards.map(c => this.saveCard(c))` in the existing `allSettled` task list and navigates only if every save fulfills`. Smoke step 12 confirms navigation + DB persistence after `Guardar y salir`.
- R43 — blank dirty card → `notify.warning('Hay un mensaje de WhatsApp vacío. Escríbelo o restáuralo antes de salir.')` and `return false` before any request (smoke step 12 confirms toast, no PUT, stays on `/profile`).

### Build & verification (R44, R45)
- R44 — `pnpm run build` exits 0 (verified in this session). The only diagnostics are budget warnings; profile styles are 4.97 kB vs the 5 kB error budget (over the 2 kB warning).
- R45 — 18-step manual smoke in `progress/smoke43_log.json`, 16 screenshots in `progress/smoke43_*.png`, handoff `progress/impl_profile_whatsapp_templates_tab.md`. Driver kept out of git per `docs/conventions.md` "Smoke scripts".

## Deviations assessment

1. **Stale-response guard in `load()`** — Approved. The `if (this.loadPromise === promise)` checks close a real race (user A's in-flight GET resolving after user B's `load()` would otherwise overwrite B's items). Same public behavior as the design; one extra internal line per branch. Justified.
2. **`accountDirty()` fix (`resolveAvatarPreset(i.avatarUrl ?? null)?.id ?? null`)** — Approved. Confirmed pre-existing in feature 22 (commit `431807d`, line 311 of `frontend/src/app/features/profile/profile.component.ts`): `selectedPreset() !== resolveAvatarPreset(i.avatarUrl ?? null)?.id` compares `null` (from `selectedPreset`) with `undefined` (from `null?.id`) → always dirty for users without a preset avatar. Without the fix, R21's `Mi cuenta` dot is permanently on for those users and the unsaved-changes dialog fires on every exit — R21/R41 cannot hold. Single-token fix; surfaced and explained in the session log. Not scope creep.
3. **`[preserveContent]="true"` on the tab group** — Approved. Design says "plain content is preserved" with state in signals; this option takes the stronger interpretation of preserving DOM too. Card state is in signals either way; the option only avoids re-instantiation of the hidden DOM tree on switch. Within intent.
4. **Chip insertion writes `ta.value` directly then focuses + sets selection before `patchCard`** — Approved. `NgModel` writes the view on a later microtask, which would reset `selectionStart`/`selectionEnd`. Re-writing the same value keeps the selection. Smoke step 5 verifies caret lands at 18 and selection survives the chip insert.
5. **Dirty-dot fade uses `animation` instead of `transition`** — Approved. The dot is mounted by `@if`, and transitions don't fire on insertion. `animation` runs on mount and is disabled under `prefers-reduced-motion`.
6. **`.tpl-actions button:disabled { opacity: .5 }`** — Approved. `src/styles.css` forces `--accent !important` on primary flat buttons regardless of state, so without this rule a disabled `Guardar mensaje` is visually indistinguishable from an enabled one. R33/R36 would have no visible effect.
7. **`flex-wrap` + `flex: 1 1 240px` on the card header** — Approved. At 375px the pill squeezed the description into ~120px; verified in `progress/smoke43_15_dark_375.png`.
8. **Account sections keep the existing 720px `.account-card` inside a 24px tab body** — Approved. Pre-existing visual preserved verbatim (per T10), only rewrapped.
9. **`row.whatsappLink` narrowed into a local `const` in citations notifyGuardian** — Approved. Type-narrowing for the post-`if (!whatsappLink || !target) return;` path; zero behavior change.

## Smoke integrity — confirmed

- 18/18 steps PASS, 97 checks total — matches `summary` map.
- All 97 checks have `ok: true` (none fail silently). Step 1 (8), 2 (10), 3 (9), 4 (7 — actually recorded as 5, see below), 5 (3), 6 (3), 7 (7), 8 (5), 9 (5), 10 (3), 11 (9), 12 (6), 13 (4), 14 (11), 15 (1), 16 (2), 17 (4), 18 (2). Recounted from the JSON: 8+10+9+5+3+3+7+5+5+3+9+6+4+11+1+2+4+2 = 97. Matches.
- Note: the handoff narrative says "step 4 ... 5 checks" while my recount is also 5; no discrepancy.
- Step 15 is a single placeholder check `screenshots captured (inspect manually)` with `chipColorDark: rgb(129, 140, 248)`. Manual inspection of `progress/smoke43_15_dark_375.png` and `progress/smoke43_15_light_375.png` confirms: chip text is readable in both modes, notebook margin rule (`--stripe`) visible in both, pill readable, two-column at 1280 collapses to one column at 800/375, `Guardar mensaje` stacked above `Restaurar predeterminado` at 375.
- Step 14 console.warn count is exactly one per action; smoke step 17 records zero warns when the catalog loads. R47 holds.
- The `log` array records pre-existing console noise (displayEnrollment null fullName TypeError on `/inspectors/absences` autocomplete, 504s from the PWA service worker answering deliberately aborted requests, 401/400 noise from other components after logout). I verified by `git diff` that none of those changes come from this feature.

## Build & budgets — confirmed (with caveat)

- `pnpm run build` exits 0.
- profile.component.ts styles: **4.97 kB / 5 kB error budget** (2 kB warning budget exceeded by 2.97 kB). New visual direction (tabs, cards, chips, pills, preview, dirty dot, blank hint, stacked mobile actions) is necessary; no debug rules or dead CSS detected by inspection. The implementer disclosed this honestly in the handoff. Any further CSS on this component will break the build — flagged as a follow-up, not a reject reason.
- Other components also exceed the 2 kB warning (login 3.45, calendar 3.97, layout 3.15, export-config-dialog 2.55, justification-create-dialog 2.79, admin 4.67, absences 2.65, citation-dialog 2.98) — pre-existing, not introduced by this feature.
- Bundle initial warning (554.86 kB vs 500 kB budget) — pre-existing, not introduced by this feature.

## Conventions — confirmed

- Standalone, `OnPush`, `inject()`, signals — yes throughout.
- Pure helpers (`fillTemplate`, `previewTemplate`, `FALLBACK_TEMPLATES`, `PLACEHOLDER_SAMPLES`) live in `shared/utils/template.util.ts` per `docs/architecture.md`.
- HTTP calls via `firstValueFrom(this.http.xxx(...))` inside `try/catch` — yes.
- `NotificationService` used for user-facing feedback; the only `console.warn` in the diff is the deliberate R47 fallback signal.
- Inline template + styles in `profile.component.ts`, no `.html`/`.css` siblings.
- No smoke driver committed; no harness files patched.
- No new runtime dependency added.

## Cross-feature scope creep — none blocking

- The `accountDirty()` fix is the only deviation touching pre-existing code outside this feature's nominal scope. Justified because R21/R41 cannot hold without it. Worth flagging as a separate follow-up to audit `selectedPreset()`-based comparisons elsewhere (none found in this quick grep).
- All other touched files (`models/index.ts`, `shared/utils/template.util.ts`, `notification-template.service.ts`, `absences.component.ts`, `citations.component.ts`) were either rewritten per design or had targeted updates aligned with the requirements.

## Required fixes

None.

## Suggested follow-ups (out of scope, NOT a reject reason)

1. Pre-existing `displayEnrollment` null `fullName` TypeError on `/inspectors/absences` autocomplete (manual-tab) — out of scope, already documented in the smoke log.
2. Pre-existing 504 noise from the PWA service worker answering deliberately aborted requests during the smoke — out of scope.
3. Pre-existing 401/400 noise around logout/re-login from other components after `AuthService.logout()` clears the institution context — out of scope.
4. Pre-existing component CSS budgets over the 2 kB warning (login 3.45, calendar 3.97, layout 3.15, export-config-dialog 2.55, justification-create-dialog 2.79, admin 4.67, absences 2.65, citation-dialog 2.98) — out of scope, but worth a future cleanup pass to either raise the budget or split the CSS.
5. profile.component.ts is at 4.97 kB / 5 kB error budget — one more CSS rule breaks the build. Consider extracting the new template/visual styles into a sibling `.css` file or raising the per-component error budget (but the implementer correctly stayed within the existing budget rather than editing `angular.json`).

## Verdict

APPROVED.