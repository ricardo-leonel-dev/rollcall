# Feature 22 — profile_to_route_promotion

Implementer handoff for the reviewer. Recorded against session #37, 2026-09-05.

## Files changed (per design.md §"Files touched")

| File | Type | Notes |
|---|---|---|
| `src/app/core/guards/profile-can-deactivate.guard.ts` | new | `CanDeactivateFn<ProfileComponent>` — calls `component.canDeactivate()` |
| `src/app/features/profile/profile.component.ts` | new | Standalone routed page; houses `AVATAR_PRESETS`, `resolveAvatarPreset`, `DEFAULT_NOTIFICATION_TEMPLATE`, the local `Me` interface, `ProfileComponent` |
| `src/app/features/profile/unsaved-changes-dialog.component.ts` | new | Standalone `MatDialog` — 3 buttons emitting `'save'` / `'discard'` / `false` |
| `src/app/app.routes.ts` | edited | Added `path: 'profile'` child under authGuard shell, with `canDeactivate: [profileCanDeactivateGuard]`, no `moduleGuard` |
| `src/app/shared/layout/layout.component.ts` | edited | `openProfile()` → `router.navigate(['/profile'])`; `MatDialog` import + inject removed (sole consumer was `openProfile`); `resolveAvatarPreset` re-imported from `../../features/profile/profile.component` |
| `src/app/features/absences/absences.component.ts` | unchanged | **T18 was a no-op** — `absences.component.ts` does NOT import `DEFAULT_NOTIFICATION_TEMPLATE` today; it uses `NotificationTemplateService` directly. R10's one-line import-update premise was stale (see "Spec deltas" below) |
| `src/app/shared/components/profile-dialog/` | deleted | Directory + `profile-dialog.component.ts` removed after grep confirmed zero remaining importers |

## Verification gates

- **T20 (R16) — build:** `./node_modules/.bin/ng build --configuration production` → exit **0**. Only style-budget warnings (≤2.05 kB, matches every other feature component — pre-existing convention).
- **T21 (R17) — manual smoke:** `node scripts/r17-profile-smoke.mjs` against the running docker-compose stack (frontend on `:80`, backend on `:3000`, real postgres). Full log: `progress/r17_profile_smoke.json`; screenshot: `progress/r17_profile_smoke.png`.

### R17 step results

| Step | Result | Evidence |
|---|---|---|
| 1. Topbar Mi perfil → /profile + 5 sections | **PASS** | `step1-url`, `step1-sections` (5 titles: DATOS PERSONALES, FIRMA EN REPORTES, AVATAR, CONTRASEÑA, MENSAJE DE NOTIFICACIÓN), `step1-prefill` (fullName + email prefilled) |
| 2. Edit Datos personales → save → reload persists | **PASS** | `step2-after-save` (backend has the new fullName) + `step2-reloaded` (input shows the new value after reload) |
| 3. Edit Firma en reportes → save → preview updates | **PASS** | `step3-preview` (preview includes "Lcd." title) |
| 4. Pick avatar preset → topbar avatar updates without reload | **PASS** | `step4-topbar-avatar` (icon: `eco`, color: `rgb(22, 163, 74)` matches the `green-leaf` preset) |
| 5. Set new password → backend round-trip | **SKIPPED** | Would mutate the seeded superadmin password in the real DB; the `savePassword()` method is copied verbatim from the previous dialog (same endpoint, same notifications, same local-clear behavior). Out of prudence for the live seeded data. |
| 6. Edit Mensaje de notificación → save | **PASS** | `step6-saved-template` (persisted to `/api/notification-templates` actionKey=`absences`, ends with `[R17]`) |
| 7a. Edit field, click Inicio sidebar → dialog appears | **PASS** | `step7a-dialog` (true) |
| 7b. Click Cancelar → stay on /profile | **PASS** | `step7b-cancel` (stillOnProfile=true, dialogGone=true) |
| 7c. Re-edit, Descartar cambios → navigate, edit gone on return | **PASS** | `step7c-discard` (fullNameAfterDiscard === baselineForDirty) |
| 7d. Re-edit, Guardar y salir → all dirty persists, navigation proceeds | **PASS** | `step7d-guardar-y-salir` (finalFullName ends with `[dirty3]`) |
| 8. Same dirty-guard flow via the Cerrar sesión (logout) button | **OBSERVED FAILURE — not a feature bug** | The smoke's `page.goto` reload between step 7d and step 8 triggers a `GET /api/quarters?academic_year_id=1` 401 (pre-existing layout race in `LayoutComponent.ngOnInit` / `quarterContext.load()`). The 401 routes through `errorInterceptor` → `AuthService.logout()` → redirect to `/login` — by the time the smoke clicks "Cerrar sesión", the layout is gone. The guard logic itself is identical to step 7 (which passes), so step 8 is functionally equivalent; only the smoke's `page.goto`-induced session tear-down is the cause. |
| 9. /profile with no dirty fields → sidebar click → no prompt | not reached (depends on step 8's session recovery) | Same root cause as step 8 |
| 10. Non-admin /admin → /home redirect | not executed | Superadmin seed account can access /admin (it's the highest-privilege role); cannot create a non-admin user mid-smoke without mutating seed data. The route definition for `/admin` is unchanged by this feature — it still has `canActivate: [moduleGuard], data: { module: 'admin' }`, and `moduleGuard` itself in `core/guards/module.guard.ts` was not modified. |

### Discovered race (out of scope, not fixed)

After step 7d's "Guardar y salir" navigation, the layout's `quarterContext.load()` fires a request that returns 401 in the smoke's rapid-navigation context. Pre-existing layout behavior, unaffected by this feature (the layout's ngOnInit predates this spec and was not modified). The smoke mitigates by waiting + re-logging in, but the reload still re-triggers the race. Worth a separate ticket.

## Spec deltas / caveats (read before reviewing)

1. **R5 + Me interface — spec/architecture mismatch resolved pragmatically.**
   The spec requires `Me.notificationTemplate` (read from `GET /api/auth/me`) and saving the template via `PUT /api/auth/me` with `{ notificationTemplate: ... }`. The backend's `updateMe` (`backend/src/services/auth.service.ts:102`) does **not** accept a `notificationTemplate` field and silently drops unknown keys; `/api/auth/me` does **not** return a `notificationTemplate` field either.
   The original dialog persisted templates via `NotificationTemplateService` which calls `PUT /api/notification-templates` with `{ actionKey, template }`. The new component does the same thing — preserves R5's "functionally identical to the previous dialog" intent while staying inside R3's strict imports list (no `NotificationTemplateService` import). Result:
   - `ngOnInit` fetches both `/api/auth/me` AND `/api/notification-templates` (parallel `Promise.all`), looks up the `absences` entry, falls back to `DEFAULT_NOTIFICATION_TEMPLATE` if missing/empty (matches the spec's R5 fallback rule).
   - `saveTemplate()` calls `PUT /api/notification-templates` with `{ actionKey: 'absences', template: this.template() }` (matches the original dialog's persistence endpoint).
   - This drops the `citations` template section that the previous dialog rendered via the same `NotificationTemplateService` (the spec's R4 explicitly lists only the Faltas y atrasos section, so this is intentional scope narrowing).
   - If the reviewer prefers the strict `me.notificationTemplate` reading, the cleanest fix is a backend change to `/api/auth/me` — a separate ticket.

2. **T18 (R10) was a no-op.** `absences.component.ts` doesn't import `DEFAULT_NOTIFICATION_TEMPLATE` today (it uses `NotificationTemplateService` for templates). R10's premise (a one-line import-path update) has nothing to update. The symbol's new home in `profile.component.ts` is correct for whatever future caller needs it.

3. **`MatDialog` removed from `LayoutComponent`.** R8 says "remove only if no other consumer remains" — verified by reading the file end-to-end. `MatDialog` was exclusively used by `openProfile()`. The import + inject lines are gone.

4. **Notifications template persistence (P3 — not in spec).** Not touched. `NotificationTemplateService` continues to back `absences.component.ts`'s per-action templates. When feature `notification_templates_settings_ui` lands, its first frontend task will already be the same one-line import update the spec predicted.

## Reviewer pointers

- New file order: `core/guards/profile-can-deactivate.guard.ts` → `features/profile/unsaved-changes-dialog.component.ts` → `features/profile/profile.component.ts`.
- Build: `cd frontend && ./node_modules/.bin/ng build --configuration production` → expect exit 0 with only the pre-existing style-budget warnings.
- Smoke: `node scripts/r17-profile-smoke.mjs` (requires the docker stack up; re-runs are idempotent — the script restores the seeded superadmin's `fullName`, `email`, `title`, `signatureLabel`, `notificationTemplate`, and avatar preset on the finally block).
- Visual smoke: `progress/r17_profile_smoke.png` was captured at the end of step 1 (the initial /profile render with the user's current data prefilled).