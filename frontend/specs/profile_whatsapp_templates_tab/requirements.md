# Requirements — `/profile` tabs + catalog-driven WhatsApp message templates

Scope: **frontend-only** (`attendance_frontend`, feature 43). It consumes the
backend contract shipped by backend feature 18 `message_template_catalog`
(`../backend/specs/message_template_catalog/`), which is **not** modified here:

| Endpoint | Body / response |
|---|---|
| `GET /api/notification-templates` | `200`, one item per **active** catalog action, ordered by `sort_order`, `action_key`. Item: `{ actionKey, label, description: string \| null, placeholders: { key, label }[], defaultTemplate, template, isCustom }` |
| `PUT /api/notification-templates` | body `{ actionKey, template }` → `200` with the item (`isCustom: true`); `400` on unknown/inactive key or blank template |
| `DELETE /api/notification-templates/:actionKey` | `200` with the item (`template === defaultTemplate`, `isCustom: false`), idempotent; `404` on unknown/inactive key |

## Context (read before the rest of this file)

- Feature 18 (`notification_templates_settings_ui`) built
  `NotificationTemplateService` (`core/services/notification-template.service.ts`)
  with a frontend-owned `DEFAULT_TEMPLATES` map and a dialog section array
  that rendered only `absences`.
- Feature 22 (`profile_to_route_promotion`) moved the dialog to the routed
  page `features/profile/profile.component.ts`. In doing so it **regressed**:
  the page reads/writes `/api/notification-templates` with direct
  `HttpClient` calls instead of the service (so the service cache that
  `absences`/`citations` read from goes stale after a save), hardcodes the
  `absences` action key and its four placeholder chips, and re-introduced a
  module-local `DEFAULT_NOTIFICATION_TEMPLATE` copy. The `citations`
  template has no editing UI at all.
- Since the backend catalog ships the label, placeholders and default for
  every action, the frontend no longer needs (and must no longer own) any of
  that knowledge as a **primary** source.
- Human decision (Ricardo, spec revision 2): when the user has not written
  their own template, WhatsApp must **always** open with a default text
  prefilled — never a bare chat for an absence/citation notification. So the
  consumers retry the catalog load before rendering, and as a last resort use
  a minimal built-in emergency copy (`FALLBACK_TEMPLATES`, R46–R49) that is
  used **only** when the catalog has no item for the action. That copy is
  never the source for the `/profile` editor. The old `DEFAULT_TEMPLATES`
  constant and its role as the primary source are removed (R12).
- The per-user cache fix (R5) is in scope for this feature by human
  decision: on a shared school computer, user B must never send or edit user
  A's custom messages.

Verification model: this project has no automated test runner yet (see
`docs/conventions.md` "Tests"; feature 42 is still pending). Every
requirement below is verified by one of: the Level 1 build (R44), a
repository grep check (listed in `tasks.md`), or a numbered step of the
manual smoke (R45), recorded in `progress/impl_profile_whatsapp_templates_tab.md`.

## Model

## R1
The system SHALL declare in `src/app/core/models/index.ts` an exported
interface `NotificationTemplateItem` with exactly the fields `actionKey:
string`, `label: string`, `description: string | null`, `placeholders:
NotificationTemplatePlaceholder[]`, `defaultTemplate: string`, `template:
string`, `isCustom: boolean`, and an exported interface
`NotificationTemplatePlaceholder` with fields `key: string` and `label:
string`.

## R2
The system SHALL NOT declare the former two-field `NotificationTemplate`
interface anywhere under `src/`.

## Service (`NotificationTemplateService`)

## R3
WHEN `NotificationTemplateService.load()` resolves, the service SHALL expose
the `GET /api/notification-templates` response through a public read-only
signal `items: Signal<NotificationTemplateItem[]>`, preserving the server's
order.

## R4
WHILE a `load()` call for the current authenticated user id is in flight or
has resolved, the service SHALL return the same promise from further
`load()` calls without issuing another `GET /api/notification-templates`.

## R5
IF `load()` is called while the authenticated user's id differs from the
user id the cached load was started for THEN the service SHALL discard the
cached promise and items and SHALL issue a new `GET /api/notification-templates`.

## R6
IF `GET /api/notification-templates` fails THEN the service SHALL clear its
cached load promise so the next `load()` call issues a new request, and SHALL
propagate the error to the caller.

## R7
The service SHALL expose `getTemplate(actionKey: string): string`, returning
the `template` of the cached item whose `actionKey` matches, or `''` when no
cached item matches.

## R8
WHEN `saveTemplate(actionKey, template)` is called, the service SHALL send
`PUT /api/notification-templates` with body `{ actionKey, template }`, SHALL
replace the cached item with that `actionKey` by the response body, and SHALL
resolve with the response body.

## R9
WHEN `restoreDefault(actionKey)` is called, the service SHALL send `DELETE
/api/notification-templates/<encodeURIComponent(actionKey)>`, SHALL replace
the cached item with that `actionKey` by the response body, and SHALL
resolve with the response body.

## R10
IF the `PUT` of `saveTemplate` or the `DELETE` of `restoreDefault` fails THEN
the service SHALL leave `items()` unchanged and SHALL reject with the
original error.

## R11
The service SHALL expose `renderTemplate(actionKey: string, vars:
Record<string, string>): string`, returning its source text (the `template`
of the cached item whose `actionKey` matches, or the R46 fallback when none
matches) with every occurrence of `{{<key>}}` replaced by `vars[<key>]` for
each key of `vars` (literal replacement, not regex-interpreted), and with any
`{{...}}` token whose key is not in `vars` left verbatim.

## R46
IF `renderTemplate(actionKey, vars)` is called and no cached item has that
`actionKey` THEN the service SHALL use `FALLBACK_TEMPLATES[actionKey]` as the
source text, or `''` when `FALLBACK_TEMPLATES` has no entry for that key.

## R47
WHEN `renderTemplate` uses `FALLBACK_TEMPLATES` as its source text, the
service SHALL emit exactly one `console.warn` naming the `actionKey`, and no
toast.

## R48
The system SHALL declare `FALLBACK_TEMPLATES: Readonly<Record<string,
string>>` exactly once, exported from `src/app/shared/utils/template.util.ts`,
with the keys `absences` and `citations` whose values are single-line string
literals byte-identical to the `default_template` values seeded by
`../backend`'s `postgres/24_message_template_actions.sql`, preceded by a
comment stating it is an emergency copy used only when the backend catalog is
unavailable and that it may drift from the catalog.

## R49
The identifier `FALLBACK_TEMPLATES` SHALL appear under `src/` only in
`shared/utils/template.util.ts` (its declaration) and in
`core/services/notification-template.service.ts` (its import and its single
use inside `renderTemplate`).

## R50
The service SHALL expose `hasTemplate(actionKey: string): boolean`,
returning `true` exactly when a cached item has that `actionKey`.

## R51
WHEN `ensureLoaded()` is called, the service SHALL await `load()` and SHALL
resolve (never reject) whether that load succeeds or fails.

## R12
The system SHALL NOT contain the identifiers `DEFAULT_TEMPLATES` or
`DEFAULT_NOTIFICATION_TEMPLATE` anywhere under `src/` (the only local copy of
default texts is the emergency `FALLBACK_TEMPLATES` of R48, restricted by
R49).

## WhatsApp consumers

## R13
WHEN `AbsencesComponent.notifyGuardian(...)` opens a WhatsApp link for a
non-justified absence, the system SHALL build the message with
`templateService.renderTemplate('absences', { nombre, fecha, tipo, curso })`
using the same values as today (`studentName`, `date`, `'una falta'` for
`'F'` / `'un atraso'` for `'AT'`, `course`).

## R14
WHEN `CitationsComponent.notifyGuardian(row)` opens a WhatsApp link for a
non-closed citation, the system SHALL build the message with
`templateService.renderTemplate('citations', { nombre, fecha })` using the
same values as today (`row.studentName`,
`formatCitationDateLabelShort(target.date, target.time)`).

## R15
IF `templateService.hasTemplate(<actionKey>)` is `false` when R13's or R14's
`notifyGuardian` runs THEN the system SHALL await
`templateService.ensureLoaded()` before calling `renderTemplate`.

## R52
WHEN R13's or R14's `notifyGuardian` opens WhatsApp, the system SHALL use the
URL `<whatsappLink>?text=<encodeURIComponent(message)>` (never the bare link)
for that notification.

## R53
WHILE `templateService.hasTemplate(<actionKey>)` is `true` when R13's or
R14's `notifyGuardian` runs, the system SHALL call `window.open` with the
final URL synchronously inside the click handler, with no `await` before it.

## R54
IF `templateService.hasTemplate(<actionKey>)` is `false` when R13's or R14's
`notifyGuardian` runs THEN the system SHALL reserve a tab with
`window.open('', '_blank')` synchronously, before the R15 `await`.

## R55
WHEN the message is rendered after the R15 `await`, the system SHALL load
the final URL into the tab reserved by R54, or SHALL call `window.open(url,
'_blank')` when that reservation returned `null`.

## R56
WHEN `AbsencesComponent` or `CitationsComponent` initializes, the system
SHALL prefetch the catalog with `templateService.ensureLoaded()` (not
`load()`), so a catalog failure does not reject the component's initial
data load.

## R57
The justified-absence (`isJustified`) and closed-citation early returns of
`notifyGuardian` SHALL keep opening the bare WhatsApp link without `?text=`,
as today.

## R16
The system SHALL NOT call `.replace(` with a `{{...}}` placeholder pattern in
`absences.component.ts` or `citations.component.ts`.

## `/profile` page structure

## R17
The `/profile` page SHALL render, in this order, an `app-chapter-header`
(eyebrow only, no `title` input), a `page-header` with the `h1` `Mi perfil`,
and a `mat-tab-group` with exactly two tabs labelled `Mi cuenta` and
`Mensajes de WhatsApp`, in that order.

## R18
The `Mi cuenta` tab SHALL contain the `Datos personales`, `Firma en
reportes`, `Avatar` and `Contraseña` sections with their current markup and
behavior, and SHALL NOT contain the former `Mensaje de notificación` section.

## R19
WHEN `/profile` is opened with the query parameter `tab=mensajes`, the
system SHALL select the `Mensajes de WhatsApp` tab; WHEN opened without it
(or with any other value), the system SHALL select the `Mi cuenta` tab.

## R20
WHEN the user switches tabs, the system SHALL update the URL's `tab` query
parameter (`mensajes` for the second tab, removed for the first) with
`replaceUrl: true` and SHALL NOT open the unsaved-changes dialog.

## R21
WHILE any field belonging to a tab differs from its last loaded/saved
value, the system SHALL render a dirty marker (a dot with the accessible
label `Cambios sin guardar`) next to that tab's label.

## `Mensajes de WhatsApp` tab

## R22
WHEN `ProfileComponent` initializes, the system SHALL call
`NotificationTemplateService.load()` in parallel with `GET /api/auth/me` and
SHALL NOT call `/api/notification-templates` through `HttpClient` directly.

## R23
WHEN the templates load resolves, the `Mensajes de WhatsApp` tab SHALL
render exactly one card per element of `NotificationTemplateService.items()`,
in that order, and `profile.component.ts` SHALL NOT contain any hardcoded
action key or placeholder key string literal.

## R24
WHILE the templates load is pending, the `Mensajes de WhatsApp` tab SHALL
render the loading state (`app-loading-spinner`) instead of any card.

## R25
IF the templates load fails THEN the `Mensajes de WhatsApp` tab SHALL render
the error state (copy in `design.md`) with a `Reintentar` button that calls
`load()` again, and the `Mi cuenta` tab SHALL remain fully usable.

## R26
IF the templates load resolves with zero items THEN the `Mensajes de
WhatsApp` tab SHALL render the empty state (copy in `design.md`).

## R27
Each card SHALL render the item's `label` as its heading, its `description`
when non-null, and a status pill reading `Personalizado` when `isCustom` is
`true` or `Predeterminado` when `isCustom` is `false`.

## R28
WHEN a card is rendered from an item, its textarea SHALL initially contain
that item's `template` (the user's own template, or the catalog default when
the user has none).

## R29
Each card SHALL render one placeholder chip per element of the item's
`placeholders`, in catalog order, showing `{{<key>}}` as its text and the
placeholder's `label` as its `title` and `aria-label`.

## R30
WHEN the user clicks a placeholder chip, the system SHALL insert
`{{<key>}}` into that card's textarea at the last recorded caret position
(replacing any selected text; at the end of the text if the textarea has not
been focused yet) and SHALL place the caret immediately after the inserted
token.

## R31
WHILE a card's textarea is non-blank, the card SHALL render a `Vista previa`
block showing the textarea text with each `{{<key>}}` of the item's
placeholders replaced by the sample value for `<key>` from
`PLACEHOLDER_SAMPLES` (`design.md`), or by `[<label>]` when the key has no
sample.

## R32
WHILE a card's textarea is blank (empty after trimming), the card SHALL hide
the `Vista previa` block and SHALL render the inline hint `El mensaje no
puede quedar vacío. Usa «Restaurar predeterminado» para recuperar el texto
original.`

## R33
WHILE a card's textarea equals its baseline `template`, OR is blank, OR that
card has a save/restore request in flight, the card's `Guardar` button SHALL
be disabled.

## R34
WHEN the user clicks a card's enabled `Guardar` button, the system SHALL
call `saveTemplate(actionKey, text)` and, on success, SHALL set that card's
baseline and textarea to the response `template`, SHALL show the
`Personalizado` pill, and SHALL show the success toast `Mensaje guardado`.

## R35
IF a card's save fails THEN the system SHALL show an error toast (the
backend's `error` message when present, else `No se pudo guardar el
mensaje`) and SHALL keep the card's textarea text and baseline unchanged.

## R36
WHILE a card's `isCustom` is `false` AND its textarea equals its
`defaultTemplate`, OR that card has a request in flight, the card's
`Restaurar predeterminado` button SHALL be disabled.

## R37
WHEN the user clicks `Restaurar predeterminado` on a card whose item has
`isCustom: true`, the system SHALL open `ConfirmDialogComponent` and, only
if the user confirms, SHALL call `restoreDefault(actionKey)`; on success it
SHALL set the card's baseline and textarea to the response `template`, SHALL
show the `Predeterminado` pill, and SHALL show the success toast `Mensaje
restaurado`.

## R38
WHEN the user clicks `Restaurar predeterminado` on a card whose item has
`isCustom: false`, the system SHALL set the card's textarea to the item's
`defaultTemplate` without an HTTP request and without a confirmation dialog.

## R39
IF a card's `restoreDefault` call fails THEN the system SHALL show an error
toast (backend `error` message when present, else `No se pudo restaurar el
mensaje`) and SHALL keep the card's textarea text, baseline and pill
unchanged.

## R40
WHILE one card has a save or restore request in flight, the system SHALL
keep the `Guardar` and `Restaurar predeterminado` buttons of every other
card governed only by their own state (R33, R36).

## Unsaved-changes guard

## R41
`ProfileComponent.hasDirty()` SHALL return `true` WHEN any template card's
textarea differs from its baseline, in addition to the account fields it
already tracks (feature 22 R11), regardless of which tab is selected.

## R42
WHEN the user picks `Guardar y salir` in the unsaved-changes dialog, the
system SHALL save every dirty template card through `saveTemplate` together
with the existing dirty account sections, and SHALL allow the navigation
only if every save succeeds.

## R43
IF, on `Guardar y salir`, a dirty template card is blank THEN the system
SHALL NOT send its request, SHALL show the warning toast `Hay un mensaje de
WhatsApp vacío. Escríbelo o restáuralo antes de salir.`, and SHALL cancel the
navigation.

## Build & verification

## R44
The implementer SHALL run `pnpm run build` and confirm it exits `0` under the
project's `strict` / `strictTemplates` settings.

## R45
The implementer SHALL run the manual smoke listed in `design.md`
"Verification" against the running stack (with backend feature 18's
migration 24 applied) and record each numbered step's pass/fail plus
screenshots in `progress/impl_profile_whatsapp_templates_tab.md`.
