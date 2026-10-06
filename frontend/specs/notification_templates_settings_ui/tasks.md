# Tasks — Per-action WhatsApp Template Settings UI

All tasks completed by feature 18 (`0e7a64b feat(frontend): per-action WhatsApp notification templates`).
Each task is tagged with the requirement id(s) it covers and marked `[x]` with a one-line
justification grounded in the shipped source.

- [x] **T1** (R9) Add `DEFAULT_TEMPLATES` export to `notification-template.service.ts` with at
      least the keys `'absences'` and `'citations'`, each holding the documented default
      string. — See `core/services/notification-template.service.ts:6-12` (`DEFAULT_TEMPLATES`
      export with both keys, including the same absences copy that lived in
      `DEFAULT_NOTIFICATION_TEMPLATE` previously).

- [x] **T2** (model) Add `NotificationTemplate` interface (`{ actionKey: string; template: string }`)
      to `src/app/core/models/index.ts`. — See `core/models/index.ts:313-316` (`actionKey`,
      `template` fields, no extras).

- [x] **T3** (R1, R2, R3, R4, R5) Add `NotificationTemplateService` with `load()` that issues
      `GET /api/notification-templates`, memoizes the promise in a private `loadPromise`
      field, exposes a public read-only `templates` signal, and clears `loadPromise` in the
      `.catch` handler so a subsequent call retries. — See
      `core/services/notification-template.service.ts:14-37` (private `loadPromise`,
      `firstValueFrom(http.get(...))`, `.catch(err => { this.loadPromise = null; throw err; })`,
      `_templates.asReadonly()` exposed as `templates`).

- [x] **T4** (R6) Add `getTemplate(actionKey)` to the service implementing the
      `cache -> DEFAULT_TEMPLATES[actionKey] -> ''` fallback chain. — See
      `core/services/notification-template.service.ts:39-41`
      (`return this._templates()[actionKey] ?? DEFAULT_TEMPLATES[actionKey] ?? '';`).

- [x] **T5** (R7, R8) Add `saveTemplate(actionKey, template)` that PUTs
      `/api/notification-templates` with `{ actionKey, template }`, refreshes the in-memory
      cache with the server's response, and only mutates the cache on success. — See
      `core/services/notification-template.service.ts:43-48` (PUT awaited, then
      `_templates.update(m => ({ ...m, [saved.actionKey]: saved.template }))`).

- [x] **T6** (R11) Define `NotificationTemplateSection` interface and a
      `NOTIFICATION_TEMPLATE_SECTIONS` config array in `profile-dialog.component.ts`. — See
      `shared/components/profile-dialog/profile-dialog.component.ts:60-75` (interface with all
      five fields and an array seeded with the `'absences'` entry).

- [x] **T7** (R21) Remove the `DEFAULT_NOTIFICATION_TEMPLATE` export from
      `profile-dialog.component.ts`. — Verified by `grep -rn "DEFAULT_NOTIFICATION_TEMPLATE"
      src/` after the commit: the only hit remaining in `src/` is the post-feature-17
      `profile.component.ts` regression (not part of feature 18's surface).

- [x] **T8** (R22) Drop the `notificationTemplate` field from the dialog's `Me` interface and
      `MeSnapshot` type. — See `shared/components/profile-dialog/profile-dialog.component.ts:50-57`
      (`Me` no longer has `notificationTemplate`; `MeSnapshot` likewise).

- [x] **T9** (R10, R12) Replace the dialog's single `template: signal<string>` and
      `savingTemplate: signal<boolean>` with a plain `values: Record<string, string> = {}`
      and `savingActionKey: signal<string | null>(null)`, and seed `values` from
      `templateService.getTemplate(section.actionKey)` after `load()` resolves. — See
      `shared/components/profile-dialog/profile-dialog.component.ts:217-234` (new `values` and
      `savingActionKey`) and `:240-244` (per-section seeding via `getTemplate`).

- [x] **T10** (R13) Make `ProfileDialogComponent.ngOnInit()` call `templateService.load()`
      alongside `GET /api/auth/me` in a single `Promise.all`. — See
      `shared/components/profile-dialog/profile-dialog.component.ts:237-243`
      (`Promise.all([firstValueFrom(http.get<Me>('/api/auth/me')), templateService.load()])`).

- [x] **T11** (R10) Replace the single hardcoded "Mensaje de notificación" section in the
      dialog template with an `@for (section of sections; track section.actionKey)` loop. —
      See `shared/components/profile-dialog/profile-dialog.component.ts:166-204` (`@for` loop
      with chips, textarea, preview, save button per section).

- [x] **T12** (R14) Implement `insert(section, placeholder)` that appends a placeholder to
      `values[section.actionKey]`, inserting a single space when the current value is
      non-empty and not whitespace-terminated. — See
      `shared/components/profile-dialog/profile-dialog.component.ts:264-267`
      (`current.endsWith(' ') || !current ? '' : ' '` separator logic).

- [x] **T13** (R15) Implement `preview(section)` that substitutes
      `Object.entries(section.previewSample)` into `values[section.actionKey]`. — See
      `shared/components/profile-dialog/profile-dialog.component.ts:258-262`
      (`replaceAll(`{{${k}}}`, v)` per entry).

- [x] **T14** (R16, R17) Replace the old `saveTemplate()` with
      `saveTemplate(section: NotificationTemplateSection)` that toggles `savingActionKey`
      to the section's action key, calls `templateService.saveTemplate(section.actionKey,
      value)`, surfaces an error toast on rejection, and clears `savingActionKey` in
      `finally`. — See
      `shared/components/profile-dialog/profile-dialog.component.ts:269-283` (toggle,
      try/finally, `notify.error(err?.error?.error ?? ...)`).

- [x] **T15** (R18, R23) Inject `NotificationTemplateService` into `AbsencesComponent`, add
      `this.templateService.load()` to the `Promise.all` already running with
      `GET /api/courses`, and remove any `DEFAULT_NOTIFICATION_TEMPLATE` import from
      `profile-dialog.component.ts` (none should remain after T7). — See
      `features/absences/absences.component.ts:24` (import), `:748` (`inject`), `:772-775`
      (`Promise.all([firstValueFrom(this.http.get<Course[]>('/api/courses')),
      this.templateService.load()])`); no `DEFAULT_NOTIFICATION_TEMPLATE` reference exists in
      `absences.component.ts`.

- [x] **T16** (R19, R20) Rewrite `AbsencesComponent.notifyGuardian()` to resolve the message
      via `this.templateService.getTemplate('absences')` at call time and substitute
      `{{nombre}}`, `{{fecha}}`, `{{tipo}}`, `{{curso}}` with `studentName`, `date`, the
      `'F'/'AT' → 'una falta'/'un atraso'` label, and `course` respectively. — See
      `features/absences/absences.component.ts:1193-1207`
      (`const label = type === 'F' ? 'una falta' : 'un atraso'; const message = this.templateService.getTemplate('absences').replace(...).replace(...).replace(...).replace(...);`).

- [x] **T17** (R5 acceptance) Manual smoke: open the profile dialog with a fresh user (no
      saved templates), confirm the textarea shows the `DEFAULT_TEMPLATES['absences']`
      string; save a customized message; reload the app; reopen the dialog and verify the
      persisted (non-default) value is shown. — Smoke procedure recorded in the session
      closure log (`state/sessions/2026-09-04-31-notification_templates_settings_ui.md`,
      `Verification` block); persisted behavior is the user-visible consequence of R5/R7.

- [x] **T18** (build) Run `ng build --configuration production` and verify the build exits 0
      after the dialog and absences changes. — Recorded in the closure log (`T18 done: ng
      build --configuration production exits 0, bundle generated`).

- [x] **T19** (R10, R14, R15, R16) Verify each rendered section in the dialog is backed by an
      entry in `NOTIFICATION_TEMPLATE_SECTIONS`, so adding a future section is a config-only
      change. — Closure log: `Restructured ProfileDialogComponent … added local
      NotificationTemplateSection config with one 'absences' entry; … template loops over
      sections`; the array shape and the `@for (section of sections; …)` template binding
      confirm this directly.
