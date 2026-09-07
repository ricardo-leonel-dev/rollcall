# Requirements — Per-action WhatsApp Template Settings UI

> Reconstructed post-hoc for the done feature `notification_templates_settings_ui` (feature 18).
> Source of truth: shipped `notification-template.service.ts`, `profile-dialog.component.ts`
> (post `0e7a64b`), and `absences.component.ts`; intent recorded in
> `state/features/018-notification_templates_settings_ui.md`.

## Service layer

### R1
The frontend SHALL expose an `NotificationTemplateService` that wraps
`GET /api/notification-templates` and `PUT /api/notification-templates`.

### R2
`NotificationTemplateService` SHALL be registered with Angular's root injector via
`@Injectable({ providedIn: 'root' })`.

### R3
WHEN `load()` is called for the first time, the service SHALL issue
`GET /api/notification-templates`, parse the response as `NotificationTemplate[]`,
and store the result in an internal signal keyed by `actionKey`.

### R4
WHILE a load is in flight or has already resolved, the service SHALL return the same
memoized promise from subsequent `load()` calls and SHALL NOT issue a second `GET` request.

### R5
IF the initial `GET /api/notification-templates` fails, the service SHALL clear the cached
load promise so a subsequent `load()` call retries the request instead of replaying the
same rejection.

### R6
The service SHALL expose `getTemplate(actionKey)` that returns the persisted template for
that key, falling back to `DEFAULT_TEMPLATES[actionKey]` when the key is unset in the cache,
and to an empty string when the key has neither a saved value nor a default entry.

### R7
WHEN `saveTemplate(actionKey, template)` is called, the service SHALL send
`PUT /api/notification-templates` with body `{ actionKey, template }` and SHALL update the
in-memory cache with the server's response after the call resolves.

### R8
IF `PUT /api/notification-templates` fails, the service SHALL NOT mutate the in-memory cache
for that `actionKey` and SHALL propagate the error to the caller.

### R9
`DEFAULT_TEMPLATES` SHALL be exported from `notification-template.service.ts` and SHALL contain
at least the keys `'absences'` and `'citations'`, each mapped to a non-empty default string.

## Dialog layer

### R10
`ProfileDialogComponent` SHALL render one editable template section per entry in a local
`NOTIFICATION_TEMPLATE_SECTIONS` config array, driven by an `@for (section of sections; track section.actionKey)`
loop in the dialog template.

### R11
Each `NotificationTemplateSection` entry SHALL declare an `actionKey`, a `label`, a
`description`, a `placeholders: string[]` array, and a `previewSample: Record<string, string>` map.

### R12
WHEN the dialog opens, the dialog SHALL populate each section's textarea value from
`NotificationTemplateService.getTemplate(section.actionKey)`, applying the
`cache → DEFAULT_TEMPLATES → ''` fallback chain.

### R13
WHEN `ProfileDialogComponent.ngOnInit()` runs, the dialog SHALL request
`NotificationTemplateService.load()` in parallel with `GET /api/auth/me`.

### R14
For each rendered section, the dialog SHALL render a placeholder chip for every entry in
`section.placeholders` and, WHEN that chip is clicked, SHALL append that placeholder to
the section's textarea value, inserting a single space when the current value does not end
in whitespace and is non-empty.

### R15
WHILE a section's textarea value is non-empty after trimming, the dialog SHALL render a live
preview block that substitutes the values from `section.previewSample` into the section's
textarea content.

### R16
WHEN the user clicks a section's "Guardar mensaje" button, the dialog SHALL call
`NotificationTemplateService.saveTemplate(section.actionKey, value)` and SHALL disable only
that section's save button while the request is in flight.

### R17
IF `saveTemplate` rejects, the dialog SHALL display an error notification via
`NotificationService` and SHALL leave the cached template for that action key unchanged.

## Absences consumer

### R18
WHEN `AbsencesComponent.ngOnInit()` runs, the component SHALL request
`NotificationTemplateService.load()` in parallel with `GET /api/courses` and SHALL NOT issue
a separate `GET /api/auth/me` for the notification template.

### R19
`AbsencesComponent.notifyGuardian()` SHALL read the absence template via
`NotificationTemplateService.getTemplate('absences')` at the moment the WhatsApp link is
opened, not from a value captured during `ngOnInit`.

### R20
`notifyGuardian()` SHALL substitute the `{{nombre}}`, `{{fecha}}`, `{{tipo}}`, and
`{{curso}}` placeholders in the resolved template with the call's `studentName`, `date`,
`type` (mapped to `'una falta'` for `'F'` and `'un atraso'` for `'AT'`), and `course`
arguments respectively, before opening the WhatsApp URL.

## Cross-cutting removal

### R21
The `DEFAULT_NOTIFICATION_TEMPLATE` export SHALL NOT exist in
`profile-dialog.component.ts`; the only export of that name in the project SHALL be the
`DEFAULT_TEMPLATES` map in `notification-template.service.ts`.

### R22
The `Me` and `MeSnapshot` interfaces used by `ProfileDialogComponent` SHALL NOT contain a
`notificationTemplate` field; the dialog SHALL read all template values from
`NotificationTemplateService` instead of from `/api/auth.me`.

### R23
`AbsencesComponent` SHALL NOT import `DEFAULT_NOTIFICATION_TEMPLATE` from
`profile-dialog.component.ts`, and the WhatsApp message resolution path SHALL NOT depend on
`/api/auth/me` or on the dialog component being open.
