# Feature 43 `profile_whatsapp_templates_tab` — implementer handoff

Implementer: leader -> implementer (Opus 5.5). Spec: `specs/profile_whatsapp_templates_tab/` (R1–R57, T1–T24, all `[x]`).
Status: ready for review. Not committed. `log-out` not run.

## Outcome

`/profile` now has a chapter header, `Mi perfil` h1 and a two-tab `mat-tab-group` (`Mi cuenta` / `Mensajes de WhatsApp`,
deep-linkable with `?tab=mensajes`, `replaceUrl`). The messages tab renders one card per catalog item from
`NotificationTemplateService.items()`, with chips that insert at the caret, a notebook-margin preview, save/restore with
per-card busy state, and loading/error/empty states. `NotificationTemplateService` is catalog-driven and memoized per
user. `absences`/`citations` notify via `renderTemplate` with a popup-safe retry path and the emergency `FALLBACK_TEMPLATES`.

## Files changed

| File | Change |
|---|---|
| `src/app/core/models/index.ts` | `NotificationTemplate` replaced by `NotificationTemplatePlaceholder` + `NotificationTemplateItem` (T1). |
| `src/app/shared/utils/template.util.ts` | **New**: `FALLBACK_TEMPLATES` (EMERGENCY COPY comment), `fillTemplate`, `PLACEHOLDER_SAMPLES`, `previewTemplate` (T2). |
| `src/app/core/services/notification-template.service.ts` | Rewritten per design (T3–T6, T24). `DEFAULT_TEMPLATES` removed. |
| `src/app/features/absences/absences.component.ts` | `ensureLoaded()` prefetch; async popup-safe `notifyGuardian` (T7). |
| `src/app/features/citations/citations.component.ts` | Same as absences (T8). |
| `src/app/features/profile/profile.component.ts` | Tabs, cards, dirty tracking, guard (T9–T20). |
| `specs/profile_whatsapp_templates_tab/tasks.md` | T1–T24 checked off. |

## Deviations / decisions within the spec (please review)

1. **Stale-response guard in `load()`** (service). In addition to the design's per-user memo, the `.then`/`.catch`
   only touch state if `this.loadPromise === promise`. Without it, user A's in-flight GET resolving after user B's
   `load()` started could overwrite B's items, which is the same R5 bug through a race. Same public behavior as the design.
2. **Pre-existing feature-22 bug fixed in the extracted `accountDirty()`**: the old `hasDirty()` compared
   `selectedPreset()` (`null`) with `resolveAvatarPreset(null)?.id` (`undefined`), so it was **always dirty** for any user
   without a preset avatar (photo or no avatar). The unsaved-changes dialog fired on every exit for those users, and with
   R21 the `Mi cuenta` dot showed permanently. The smoke caught it (user B). Fix: `?.id ?? null`. One token, needed for
   R21/R41 to hold.
3. **`[preserveContent]="true"` on the tab group** keeps both tab bodies in the DOM when hidden. This goes beyond the
   design's "plain content", which Material still detaches. Card state lives in signals either way. This keeps the
   textarea caret and autosize stable across tab switches.
4. **Chip insertion writes `ta.value` directly**, then focuses and calls `setSelectionRange` before `patchCard`. The design
   suggested `afterNextRender`/microtask, but `NgModel` writes the view on a later microtask and that would reset the caret.
   Re-writing the same value keeps the selection. Smoke step 5 verifies this.
5. **Dirty-dot fade** uses a 150ms CSS `animation` instead of a `transition`, because the dot is inserted with `@if` and a
   transition doesn't run on insertion. It is disabled under `prefers-reduced-motion`.
6. **`.tpl-actions button:disabled { opacity: .5 }`** (component-scoped). The global `styles.css` forces
   `background: var(--accent) !important` on every primary flat button, disabled ones included. Without this rule a
   disabled `Guardar mensaje` looks identical to an enabled one, so R33/R36 had no visible effect. The global style was
   not changed.
7. **Card header wraps** (`flex-wrap`, text column `flex: 1 1 240px`). At 375px the pill squeezed the description into
   about 120px. Now the pill drops below the text instead.
8. The account sections keep their existing 720px card (`.account-card`, same values as the old inline style) inside a
   24px tab body.
9. The citations `notifyGuardian` captures `row.whatsappLink` into a local `const` so the closure keeps the narrowed
   type. No behavior change.

## Verification

Build-checked and manually/Playwright smoke-tested against the real local stack. Not unit-tested, because there is no
test runner yet (feature 42).

### Level 1 — `pnpm run build` (R44, T22)
Exit 0. The only output is budget **warnings**. Note: `profile.component.ts` styles are **4.97 kB against the 5 kB
error budget** (2 kB warning). They were already 2.5 kB, over the warning threshold, before this feature. Any further
CSS on this component will break the build.

### Grep checks (T21) — run from `frontend/`
- R12 `DEFAULT_TEMPLATES|DEFAULT_NOTIFICATION_TEMPLATE`: no output.
- R2 `interface NotificationTemplate\b|NotificationTemplate\[\]|<NotificationTemplate>`: no output.
- R23 action/placeholder literals in `profile.component.ts`: no output.
- R22 `/api/notification-templates` in `profile.component.ts`: no output.
- R16 `replace(/\{\{` in absences/citations: no output.
- R56 `templateService.load()` in absences/citations: no output.
- R49 `FALLBACK_TEMPLATES` under `src/`: exactly 3 lines (`template.util.ts:10` declaration;
  `notification-template.service.ts:5` import; `notification-template.service.ts:65` single use in `renderTemplate`).
- R48: both `grep -cF` literal checks print `1`; `EMERGENCY COPY` prints `1`. Also diffed byte-for-byte against `postgres/24_message_template_actions.sql`: identical.

### Level 3 — 18-step smoke (R45, T23)

**Setup (local only).** The running `backend` container is built from the main checkout (`c8e6a9e`, before backend
feature 18), so it still returns the old `{actionKey, template}` shape. Migration 24 *is* applied in the local DB.
To test against the real catalog API:
- Built this worktree's backend (`backend/dist`, feature 18 code).
- Ran it in a throwaway container, `smoke43-backend`. It used the `ai-personal-backend` image, the `ai-stack` network,
  the same env and the local postgres, on `127.0.0.1:3010`.
- Served this build's `dist/frontend/browser` from a tiny Node static server on `:4343` that proxies `/api` to `:3010`.

That container, the server, and the temporary `backend/node_modules` and `backend/dist` are all removed. The shared
stack was not restarted or changed.

**Driver.** The smoke was driven by headless Chromium (Playwright) with no API mocking. The only stub is
`wa.me` → a static 200 page, so no real WhatsApp request is made.
- `window.open` is wrapped by an init script that records its arguments. That is how fast path (one call with the final
  URL, R53) is told apart from reserved tab (`window.open('', '_blank')` first, R54).
- Catalog failures are simulated with `context.route('**/api/notification-templates**', abort)`. This plays the role of
  DevTools "block request URL".

The script was a scratch file in the session scratchpad and is not versioned, per `docs/conventions.md` "Smoke scripts".

**Data.** All test data was disposable and torn down in `finally`. Afterwards the DB was confirmed back to its original state:
- superadmin's `user_message_templates` (one `absences` row, id 38): backed up with `COPY`, deleted for a "fresh user"
  start, then restored byte-for-byte.
- Disposable superadmin user `smoke43_b`: created for step 13, then deleted.
- Disposable closed citation (enrollment 20, 2026-09-02, so it falls inside the current quarter): created for R57, then
  deleted.
- Step 16 ran `UPDATE message_template_actions SET active=false/true` **against the local `postgres` container only**.
  Never against Supabase or the VPS.
- Step 11 called `PUT /api/auth/me` with superadmin's unchanged values.

**Result: 18/18 steps PASS, 97 checks.** Full transcript: `progress/smoke43_log.json`.

| Step | Result | What was checked (requirements) | Evidence |
|---|---|---|---|
| 1 | PASS | Eyebrow `Cuenta personal · Preferencias y mensajes`; no title in the header; order is header → `page-header` h1 `Mi perfil` → tab group; tabs `Mi cuenta` then `Mensajes de WhatsApp`; `Mi cuenta` selected; the 4 sections; no `Mensaje de notificación` (R17, R18, R19) | `smoke43_01_mi_cuenta.png` |
| 2 | PASS | `?tab=mensajes` added; no dialog; Back leaves `/profile` (replaceUrl); cards match the GET response's labels and order; description per card; chip text `{{key}}` with `title`/`aria-label` = catalog label; with a 2s delayed GET, `Cargando mensajes…` shows before any card (R19, R20, R22, R23, R24, R27, R29) | log |
| 3 | PASS | Fresh user: textareas = `defaultTemplate`; pills `Predeterminado`; preview shows `JUAN PÉREZ` / `una falta` / `OCTAVO "A"` with no `{{`; Save and Restore disabled (R28, R31, R33, R36) | `smoke43_03_mensajes_default.png` |
| 4 | PASS | Editing Citaciones shows the Mensajes dot (`aria-label="Cambios sin guardar"`) and no dot on Mi cuenta; switching tabs both ways opens no dialog and keeps the edit (R20, R21, R41) | `smoke43_04_dirty_dot.png` |
| 5 | PASS | Caret at 9 + `{{fecha}}` inserts there, caret lands at 18 with focus kept; selecting `Estimado` + `{{nombre}}` replaces the word (R30) | log |
| 6 | PASS | Cleared textarea: preview hidden, exact blank hint shown, Save disabled (R32, R33) | `smoke43_06_blank_hint.png` |
| 7 | PASS | With a 1.5s delayed PUT: Citaciones buttons disabled while Faltas (dirty) stays enabled; toast `Mensaje guardado`; pill `Personalizado`; Save disabled; dot gone once nothing is dirty; text persists after reload (R33, R34, R40) | `smoke43_07_saved.png` |
| 8 | PASS | Saved, then SPA-navigated with no reload: citations notify opens with the new custom text and **no extra GET** (cache updated by `saveTemplate`); a single `window.open` with the final `?text=` URL; absences notify uses the default text with name/date/`un atraso`/course filled (R8, R13, R14, R52, R53) | log (`t8`, `o8`, `t8b`) |
| 9 | PASS | Confirm dialog has the exact title and message with «Citaciones»; `Cancelar` sends no DELETE and changes nothing; `Restaurar` shows toast `Mensaje restaurado`, text = default, pill `Predeterminado`, one DELETE (R9, R37) | `smoke43_09_restore_confirm.png` |
| 10 | PASS | Default card with extra text → Restore reverts instantly, no dialog, zero requests (R38) | log |
| 11 | PASS | Requests blocked: save shows toast `No se pudo guardar el mensaje` and keeps text and baseline; restoring a custom card shows toast `No se pudo restaurar el mensaje` and keeps text and pill; reload shows the error state with `Reintentar`; Mi cuenta still loads and saves (`Perfil actualizado`); unblock + `Reintentar` brings back 2 cards (R10, R25, R35, R39) | `smoke43_11_errors.png`, `smoke43_11_error_state.png` |
| 12 | PASS | Dirty card + sidebar `Inicio` → `Guardar y salir` navigates, sends one PUT and persists to the DB; a blank dirty card shows the exact warning toast, stays on `/profile` and sends no PUT (R42, R43) | `smoke43_12_blank_guard.png` |
| 13 | PASS | A logs out, B logs in with no reload: a second GET fires; B sees defaults, not A's `[A custom]`; B's absences notify uses B's text; no false Mi cuenta dot for B (R4, R5, R21) | log |
| 14 | PASS | Catalog blocked, absences opened fresh: page loads (7 rows); click → retry GET, `window.open('', '_blank')` first, popup lands on `wa.me?text=` with the emergency text filled; exactly one `console.warn` naming `"absences"`; no snackbar. Same for citations. Profile shows the error state with no emergency text visible (R6, R15, R46, R47, R51, R52, R54, R55, R56) | log (`o14`, `t14`, `warns`) |
| 15 | PASS (visual) | Light and dark at 1280 / 800 / 375, inspected by eye: chips, pills and the margin rule are readable in dark mode with no hardcoded light colors; 2 columns at 1280, 1 column at 800 and 375; actions stacked at 375 with `Guardar mensaje` on top | `smoke43_15_{light,dark}_{1280,800,375}.png` |
| 16 | PASS | Local DB with all actions inactive → empty-state copy; re-activated → 2 cards (R26) | `smoke43_16_empty_state.png` |
| 17 | PASS | Prefetch blocked, then unblocked: notify fires a retry GET that succeeds, uses the reserved tab, and opens with the user's **custom** text (`… C11`); no warning (R6, R15, R50, R54, R55) | log (`t17`, `o17`) |
| 18 | PASS | Closed citation → `https://wa.me/593939638508` (no `?text=`); justified absence → `https://wa.me/593968564789` (no `?text=`) (R57) | log |

Note on popup blocking: headless Chromium doesn't run a popup blocker. So R53 is shown by the single synchronous
`window.open(finalUrl)` call (no `''` reservation) plus the code: the fast path has no `await` before `window.open`.
R54/R55 are shown by the recorded `('', '_blank')` reservation followed by the popup navigating to the final URL.

Console noise in `smoke43_log.json` → `log` that is **not** caused by this feature:
- `displayEnrollment` null `fullName` TypeError on `/inspectors/absences`. It's in the manual-tab autocomplete, which
  this diff doesn't touch.
- `504` responses: the PWA service worker's answer to the deliberately aborted requests.
- `401`/`400` and minified `ne` errors around logout and re-login in step 13. They come from other components'
  requests after `logout()` clears the institution context.

All of these come from code paths this diff doesn't touch. The reviewer may want to confirm.

## Traceability (R → evidence)

Grouping per `docs/specs.md` "Coverage granularity". "Build" means the strict/`strictTemplates` type check.

| Req | Evidence |
|---|---|
| R1 | Build (`NotificationTemplateItem` consumed by the service, profile and HTTP generics) + smoke 2 (response shape renders) |
| R2 | grep R2 (empty) |
| R3 | smoke 2 (cards = GET items, same order) |
| R4 | smoke 8 (no extra GET after navigation) + smoke 13 (exactly one more GET, only on user change) |
| R5 | smoke 13 |
| R6 | smoke 14 (retry GET after a failed prefetch), smoke 17 (retry succeeds) |
| R7 | code (`getTemplate` = cache `template` or `''`) + build; no caller depends on it after this feature (kept per spec) |
| R8 | smoke 7 (PUT, pill from response), smoke 8 (cache replaced → consumer text with no reload) |
| R9 | smoke 9 (DELETE, response applied) |
| R10 | smoke 11 (failed PUT/DELETE: text, baseline and pill unchanged) |
| R11 | smoke 8/14/17 (`renderTemplate` output, all vars filled, no `{{`); `fillTemplate` uses a string pattern + replacer fn (code) |
| R12 | grep R12 (empty) |
| R13 | smoke 8, 13, 14 |
| R14 | smoke 8, 14, 17 |
| R15 | smoke 14, 17 (GET at click time before render) |
| R16 | grep R16 (empty) |
| R17 | smoke 1 |
| R18 | smoke 1 |
| R19 | smoke 1, 2 |
| R20 | smoke 2, 4 |
| R21 | smoke 4, 13 |
| R22 | smoke 2 + grep R22 (empty) |
| R23 | smoke 2 + grep R23 (empty) |
| R24 | smoke 2 (delayed GET → spinner) |
| R25 | smoke 11 |
| R26 | smoke 16 |
| R27 | smoke 2, 3, 7, 9 |
| R28 | smoke 3 (+ step 7 reload shows the custom `template`) |
| R29 | smoke 2 |
| R30 | smoke 5 |
| R31 | smoke 3 |
| R32 | smoke 6 |
| R33 | smoke 3, 6, 7 |
| R34 | smoke 7 |
| R35 | smoke 11 |
| R36 | smoke 3, 7 |
| R37 | smoke 9 |
| R38 | smoke 6 (restore after clearing), 10 |
| R39 | smoke 11 |
| R40 | smoke 7 |
| R41 | smoke 4, 12 |
| R42 | smoke 12 |
| R43 | smoke 12 |
| R44 | `pnpm run build` exit 0 |
| R45 | this file + `progress/smoke43_*` |
| R46 | smoke 14 (emergency text when no catalog item) |
| R47 | smoke 14 (exactly one warn per action, no snackbar); smoke 17 (no warn when catalog present) |
| R48 | grep R48 (1/1/1) + byte diff against migration 24 |
| R49 | grep R49 (exactly 3 lines) |
| R50 | smoke 8 (fast path when cached) vs 14/17 (reserved path when not) |
| R51 | smoke 14 (blocked catalog: absences page still loads, notify proceeds) |
| R52 | smoke 8, 14, 17 (`?text=` always present) |
| R53 | smoke 8 (single synchronous `window.open(finalUrl)`) + code |
| R54 | smoke 14, 17 (`window.open('', '_blank')` recorded first) |
| R55 | smoke 14, 17 (reserved popup navigates to the final URL) |
| R56 | smoke 14 (courses/rows load with catalog blocked) + grep R56 (empty) |
| R57 | smoke 18 |

## Visual decisions

Followed `design.md` "Visual direction" as written: tokens only, Nunito, the `--stripe` notebook margin rule
(2px, 14px inset, text 12px after it), chip/pill colors, 1024px two-column breakpoint, stacked mobile actions, focus-visible
chip outline, the one reduced-motion-safe dot fade, and every string from the copy table. The deviations are only items 5–8 above.
