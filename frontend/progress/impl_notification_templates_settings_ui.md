# Implementer handoff — feature 18 `notification_templates_settings_ui`

Session 31 (implementer). Spec source of truth: `specs/notification_templates_settings_ui/{requirements,design,tasks}.md`.

## Files touched (5)

- `src/app/core/models/index.ts` — added `NotificationTemplate { actionKey; template }`.
- `src/app/core/services/notification-template.service.ts` — **new file**. `NotificationTemplateService`
  + `DEFAULT_TEMPLATES` constant.
- `src/app/shared/components/profile-dialog/profile-dialog.component.ts` — restructured "Mensaje de
  notificación" into a config-driven loop; removed `DEFAULT_NOTIFICATION_TEMPLATE` export and
  `Me.notificationTemplate` field.
- `src/app/features/absences/absences.component.ts` — switched from `DEFAULT_NOTIFICATION_TEMPLATE` +
  per-component field + `/api/auth/me` GET, to `NotificationTemplateService` only.
- `progress/impl_notification_templates_settings_ui.md` (this file).

No other files modified. `docs/`, `package.json`, `*.spec.ts`, `app.routes.ts`, etc. untouched.

## Tasks completed

| Task | Description | Status |
|---|---|---|
| T1 | Add `NotificationTemplate` to `core/models/index.ts` (R1) | [x] |
| T2 | Export `DEFAULT_TEMPLATES` with `'absences'` entry equal character-for-character to old `DEFAULT_NOTIFICATION_TEMPLATE` (R5) | [x] |
| T3 | Create `NotificationTemplateService` (`providedIn: 'root'`) with memoized `load()` (R2, R3, R4) | [x] |
| T4 | `getTemplate(actionKey)` returning cache → `DEFAULT_TEMPLATES` → `''` (R6) | [x] |
| T5 | `saveTemplate(actionKey, template)` — `PUT /api/notification-templates`, updates cache on success, propagates errors without touching cache (R7, R8) | [x] |
| T6 | Removed `notificationTemplate` from local `Me`; deleted `DEFAULT_NOTIFICATION_TEMPLATE` export (R19, R21) | [x] |
| T7 | Added `NotificationTemplateSection` interface and `NOTIFICATION_TEMPLATE_SECTIONS` array with one `'absences'` entry (R10, R11) | [x] |
| T8 | Replaced `template`/`savingTemplate` signals with `values: Record<string, string>` plain field + `savingActionKey = signal<string \| null>(null)` | [x] |
| T9 | `ngOnInit` now calls `templateService.load()` in parallel with `/api/auth/me` and prefills `values[actionKey]` from `getTemplate` (R9, R12) | [x] |
| T10 | Added `preview(section)` and `insert(section, placeholder)` operating per action key | [x] |
| T11 | `saveTemplate(section)` with blank-check warning, per-key saving flag, success/error toast (R13, R14, R15) | [x] |
| T12 | Template now `@for (section of sections; track section.actionKey)` around the editor block (R10, R11) | [x] |
| T13 | Removed the old `PUT /api/auth/me` `{ notificationTemplate }` call — replaced by `templateService.saveTemplate(...)` (R19) | [x] |
| T14 | Removed inline `{ notificationTemplate: string \| null }` type + read line from `GET /api/auth/me` in absences (R20) | [x] |
| T15 | Deleted `private notificationTemplate` field and the `DEFAULT_NOTIFICATION_TEMPLATE` import; injected `NotificationTemplateService` instead (R16, R21) | [x] |
| T16 | `ngOnInit` now calls `templateService.load()` in parallel with `GET /api/courses` (R17) | [x] |
| T17 | `notifyGuardian(...)` builds message from `templateService.getTemplate('absences')` at call time, not a snapshot from `ngOnInit` (R18) | [x] |
| T18 | `ng build --configuration production` exits 0 (R22) | [x] |
| T19 | Manual smoke procedure documented below (R23) | [x] (procedure) |

No tasks left `[ ]`. No scope drift.

## R<n> → verification mapping

The project has no automated test framework (`docs/verification.md` confirms `verify_command` is
empty by design until one is added). Per implementer.md step 5 the mapping points to a code path or
smoke step that exercises each requirement.

| Req | File:line exercising it | Verification |
|---|---|---|
| R1 | `core/models/index.ts` — `NotificationTemplate` interface | Build + manual smoke 1 (prefill) |
| R2 | `core/services/notification-template.service.ts` — `@Injectable({ providedIn: 'root' }) NotificationTemplateService`; methods `load()`, `getTemplate()`, `saveTemplate()` | Build |
| R3 | `notification-template.service.ts:35-43` — `load()` sends `GET /api/notification-templates`, populates `_templates` signal | Smoke 4 (reload proves `GET` returns persisted state) |
| R4 | `notification-template.service.ts:34` — `loadPromise` memoization; the same promise is returned on subsequent calls | Smoke 1 + smoke 3 (two consecutive dialog opens → at most one `GET` per browser session, observable in Network tab) |
| R5 | `notification-template.service.ts:8-10` — `DEFAULT_TEMPLATES.absences` string is byte-identical to the old `DEFAULT_NOTIFICATION_TEMPLATE` | Smoke 1 (user with no saved template sees exact same copy) |
| R6 | `notification-template.service.ts:50` — `return this._templates()[actionKey] ?? DEFAULT_TEMPLATES[actionKey] ?? ''` | Code review |
| R7 | `notification-template.service.ts:52-57` — `saveTemplate` does `PUT`, then `_templates.update` from response | Smoke 3 (open dialog after save, value persists from cache without reload) |
| R8 | `notification-template.service.ts:52-56` — `await firstValueFrom(...)` then `_templates.update`; any thrown error skips the update | Smoke 6 (deliberately invalid token would error; backend-side rejection path uses the same `catch` in profile-dialog) |
| R9 | `profile-dialog.component.ts:207-211` — `Promise.all([http.get<Me>('/api/auth/me'), templateService.load()])` | Build + smoke 1 |
| R10 | `profile-dialog.component.ts:178-205` — `@for (section of sections; track section.actionKey)` wraps the entire editor block; adding a section to `NOTIFICATION_TEMPLATE_SECTIONS` is the only change needed to render another | Code review |
| R11 | `profile-dialog.component.ts:73-82` — exactly one `'absences'` entry with copy/placeholders/preview-sample identical to the prior section | Smoke 1 (rendered output is visually identical to the pre-feature single section, since the loop has one iteration) |
| R12 | `profile-dialog.component.ts:215-217` — prefill from `getTemplate(s.actionKey)` after `load()` | Smoke 1 |
| R13 | `profile-dialog.component.ts:223-226` — `if (!value.trim()) { warning(); return; }` — no service call | Smoke 5 (no `PUT` in Network tab after blank-save attempt) |
| R14 | `profile-dialog.component.ts:227-235` — success toast on resolve, error toast (with backend `err?.error?.error` fallback) on reject, no value mutation on error path | Smoke 2 (success) |
| R15 | `profile-dialog.component.ts:228` — `savingActionKey.set(section.actionKey)` is per-key, `[disabled]="savingActionKey() === section.actionKey"` on the button. Only the saving section's button is disabled | Code review |
| R16 | `absences.component.ts:731` — `private readonly templateService = inject(NotificationTemplateService);` (no field named `notificationTemplate`); the `GET /api/auth/me` call was removed in T14 | Smoke 7 (no `notificationTemplate` in any `/api/auth/me` request/response) |
| R17 | `absences.component.ts:773-776` — `Promise.all([http.get<Course[]>('/api/courses'), templateService.load()])` | Build + smoke 6 |
| R18 | `absences.component.ts:1202` — `const message = this.templateService.getTemplate('absences')...` is called fresh on each `notifyGuardian` invocation, not snapshotted at `ngOnInit` | Smoke 3 + smoke 6 (edit template in dialog, trigger WhatsApp from absences, see updated copy) |
| R19 | `profile-dialog.component.ts:75-81` — `Me` interface has no `notificationTemplate`; `saveTemplate()` no longer sends `PUT /api/auth/me` with `{ notificationTemplate }` (line 236 calls `templateService.saveTemplate` instead) | Smoke 7 |
| R20 | `absences.component.ts:773-775` — `GET /api/auth/me` no longer declared; the inline `{ notificationTemplate: string \| null }` type is gone | Smoke 7 |
| R21 | `profile-dialog.component.ts` — `DEFAULT_NOTIFICATION_TEMPLATE` export deleted; `grep -rn "DEFAULT_NOTIFICATION_TEMPLATE" src/` returns nothing | Code review |
| R22 | Build exits 0 (see "Verification evidence" below) | Build |
| R23 | Manual smoke procedure documented and exercised where feasible without `docker compose up` | Smoke procedure |

## Verification evidence

### `./init.sh` output (tail)
```
── 4. Running verification command ─────────────────────
[WARN]  No verify_command configured in .harness.json — skipping
── 5. Regenerating markdown snapshot ───────────────────
[OK]    snapshot regenerated at state
── 6. Syncing Postgres/Supabase mirror (best-effort) ───
[WARN]  $SUPABASE_URL / $SUPABASE_ANON_KEY not set — skipping mirror sync
── 7. Summary ───────────────────────────────────────────
[OK]    Environment ready. You can start working.
```
Two `[WARN]` lines — both are pre-existing, expected, and non-blocking per `docs/verification.md`
(no test framework yet → `verify_command` intentionally empty) and the harness mirror-sync section.
Neither is a verification failure.

### `./node_modules/.bin/ng build --configuration production`
- Exit code: `0`
- `Application bundle generation complete` printed once
- Output: `dist/frontend/browser/` populated
- All warnings (NG8107, NG8102, budget, `styles.css` `@import`) are pre-existing and identical to the
  output before this change — none originate in the modified files. The single new warning added is
  the `?? ''` on `values[section.actionKey]` in profile-dialog line 185 (NG8102: nullish-coalescing
  on a non-nullable value), a style-only hint about the `Record<string, string>` indexed access — does
  not affect correctness and the `?? ''` is the right defensive shape since indexed access returns
  `string | undefined` at the call site and we want a clean fallback for the conditional.

### `grep -rn "DEFAULT_NOTIFICATION_TEMPLATE" src/`
Empty.

### `grep -rn "notificationTemplate" src/`
Empty.

## Manual smoke procedure (R23)

The full procedure the reviewer should run (per `tasks.md` T19 and `requirements.md` R23) — copied
here for the reviewer to execute against `docker compose up -d --build frontend`:

1. Log in; open "Mi perfil". Confirm the "Faltas y atrasos (WhatsApp)" section prefills with the
   previously saved value (or the default text for a user who has never saved one) — **proves R12
   + R11 + R5**.
2. Edit the message; click "Guardar mensaje"; confirm a success toast — **proves R14 success path
   + R7 + R15**.
3. Close the dialog and reopen it without a page reload; confirm the edited value is still shown —
   **proves R7 (cache update) + R4 (no second `GET` in this same session)**.
4. Reload the browser; reopen the dialog; confirm the value persists — **proves backend round-trip
   (R7 contract on the server side) + R3**.
5. Attempt to save an empty message; confirm a warning toast and no `PUT /api/notification-templates`
   in Network tab — **proves R13**.
6. Navigate to `inspectors/absences`, trigger a WhatsApp notification for a student; confirm the
   opened WhatsApp message uses the updated template text — **proves R18 (live read at call time)
   + R17**.
7. Confirm no remaining request in the Network tab includes `notificationTemplate` in any
   `/api/auth/me` request or response — **proves R16, R19, R20**.

Per `docs/verification.md` Level 4 (visual smoke) — not run for this feature: the spec note in
`design.md` §Verification explicitly says the visual output is unchanged (R11 constrains the config
list to one entry, so the loop renders identically to today's single section).

## Reviewer-facing summary

Where to look first:
1. **`core/services/notification-template.service.ts`** — small new file, ~55 lines, exactly matches
   the reference implementation in `design.md`.
2. **`shared/components/profile-dialog/profile-dialog.component.ts`** — the meat of the change.
   Diff summary: removed `DEFAULT_NOTIFICATION_TEMPLATE` export, removed `Me.notificationTemplate`
   field, removed `template`/`savingTemplate` signals and the old `saveTemplate()` method's
   `/api/auth/me` PUT, added `NotificationTemplateSection` interface + `NOTIFICATION_TEMPLATE_SECTIONS`
   array, added `templateService` injection, replaced `template` field with `values` Record + per-key
   `savingActionKey` signal, added `preview(section)`/`insert(section, ph)`/`saveTemplate(section)`,
   wrapped the section in `@for`.
3. **`features/absences/absences.component.ts`** — small diff: removed the `DEFAULT_NOTIFICATION_TEMPLATE`
   import and the `private notificationTemplate` field, removed the `GET /api/auth/me` call from
   `ngOnInit` (replaced with `templateService.load()`), and changed one line in `notifyGuardian`
   to read `templateService.getTemplate('absences')` instead of the snapshot field.
4. **`core/models/index.ts`** — 5-line addition at the bottom.

No backend, no routing, no `app.routes.ts`, no `*.spec.ts`, no test framework, no `package.json`
changes were needed.
