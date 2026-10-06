# Design — Per-action WhatsApp Template Settings UI

> Reconstructed post-hoc for the done feature `notification_templates_settings_ui` (feature 18).
> Conventions follow `docs/architecture.md` (signals, `providedIn: 'root'` services) and
> `docs/conventions.md` (feature-folder colocation, core/services singleton layout).

## Files touched

| File | Change |
|---|---|
| `src/app/core/models/index.ts` | Add `NotificationTemplate` interface (`{ actionKey: string; template: string }`). |
| `src/app/core/services/notification-template.service.ts` | New file: `DEFAULT_TEMPLATES` export + `NotificationTemplateService`. |
| `src/app/shared/components/profile-dialog/profile-dialog.component.ts` | Remove `DEFAULT_NOTIFICATION_TEMPLATE` export, drop `Me.notificationTemplate` and `MeSnapshot.notificationTemplate`, replace single `template`/`savingTemplate` signals with `values: Record<string, string>` and `savingActionKey: signal<string \| null>`, render sections via `@for` over `NOTIFICATION_TEMPLATE_SECTIONS`. |
| `src/app/features/absences/absences.component.ts` | Inject `NotificationTemplateService`, add `templateService.load()` to `ngOnInit`'s `Promise.all`, and rewrite `notifyGuardian()` to resolve the template via the service at call time. |

The backend counterpart (`GET/PUT /api/notification-templates`, actionKey `'absences'` and
`'citations'`) is owned by sibling feature `notification_templates_per_action` (feature 8) and
is not modified here.

## Signatures

```ts
// core/services/notification-template.service.ts
export const DEFAULT_TEMPLATES: Record<string, string>;   // at least 'absences' and 'citations'

@Injectable({ providedIn: 'root' })
export class NotificationTemplateService {
  readonly templates: Signal<Record<string, string>>;      // readonly view of the internal signal

  load(): Promise<void>;                                   // memoized GET /api/notification-templates
  getTemplate(actionKey: string): string;                  // cache -> DEFAULT_TEMPLATES -> ''
  saveTemplate(actionKey: string, template: string): Promise<void>;  // PUT, refresh cache on success
}
```

```ts
// core/models/index.ts
export interface NotificationTemplate {
  actionKey: string;
  template:  string;
}
```

```ts
// shared/components/profile-dialog/profile-dialog.component.ts
interface NotificationTemplateSection {
  actionKey:     string;
  label:         string;
  description:   string;
  placeholders:  string[];
  previewSample: Record<string, string>;
}

const NOTIFICATION_TEMPLATE_SECTIONS: NotificationTemplateSection[] = [/* … 'absences' … */];
```

## State management

- The service holds a single private `signal<Record<string, string>>` (exposed read-only via
  `templates`). Mapping the server's `NotificationTemplate[]` response into that record is
  done once in `load()`; `saveTemplate` updates the same record with the server's reply.
- The dialog keeps a plain `values: Record<string, string>` object (not a signal) because the
  template binding `[(ngModel)]="values[section.actionKey]"` runs in change-detection per
  keystroke; tracking every keystroke as a signal would force a re-render across every
  section. The single boolean "is anything saving?" that the dialog needs is encoded as
  `savingActionKey: signal<string | null>(null)` — null = idle, otherwise the actionKey of
  the section currently saving.
- `AbsencesComponent` is read-only with respect to the service — it never calls
  `saveTemplate`, only `load()` (in `ngOnInit`) and `getTemplate('absences')` (in
  `notifyGuardian`).

## Error paths

- **`load()` failure:** the inner `loadPromise` is cleared in the `.catch()` handler before
  re-throwing, so the next `load()` call retries instead of replaying the same rejection.
  `AbsencesComponent.ngOnInit` lets the rejection bubble (no `.catch`), so a hard backend
  outage still surfaces an unhandled rejection and the user sees the standard
  `errorInterceptor` toast on the initial page load — the same UX as every other failed
  load on this app.
- **`saveTemplate()` failure:** the cache update happens *after* `await firstValueFrom(...)`,
  so on failure the signal is untouched and the next `getTemplate` call still returns the
  previous value. The dialog catches the rejection, fires an error toast, and resets
  `savingActionKey` in `finally`.
- **`AbsencesComponent.notifyGuardian` failure:** none expected — `getTemplate` is
  synchronous and returns the fallback string on a missing key; the only `await`-able call
  here is the (unrelated) `window.open` URL build. There is no PUT/GET inside
  `notifyGuardian`, so a missing or 5xx'd backend cannot break the WhatsApp send.

## Discarded alternatives

### 1. Single `savingTemplate: signal<boolean>` instead of `savingActionKey: signal<string | null>`

A single boolean would conflate "the dialog is saving *some* template" with "the dialog is
saving *this* template". The config-driven `@for` loop renders one save button per section,
and each button must independently disable itself while its PUT is in flight while sibling
sections remain interactive. A single boolean would force either (a) locking the whole dialog
during any save (bad UX), or (b) sharing one boolean across N buttons that would all flash
on/off together (worse UX and visually misleading). Replacing it with a `string | null` per
action key costs no more wiring and makes per-section state explicit.

### 2. `DEFAULT_NOTIFICATION_TEMPLATE` lives in `profile-dialog.component.ts` and is re-imported by `absences.component.ts`

This was the pre-feature-18 layout: a string constant exported from a dialog component and
imported across feature folders. It was rejected because (a) `AbsencesComponent` could end up
needing the dialog component's module graph loaded even when the dialog is never opened —
the dialog imports `MatDialogModule`, `MatDialogRef`, etc., and pulling it in just for a
string forces every consumer onto that dependency surface; (b) when more than one action key
exists, the dialog component would have to export one constant per key, multiplying
cross-feature imports; (c) the fallback is conceptually a domain default, not a UI artifact,
so it belongs in the same module as `getTemplate()` — the service that owns the read path.
Moving the constant into the service means `absences.component.ts` and any future consumer
can read it without ever touching the dialog.

### 3. One `signal<string>` per action key in the service (e.g. `absencesTemplate`, `citationsTemplate`)

A signal-per-key would mirror the backend more literally but bloats the service API: every
new action key requires adding a new public signal, a new `getTemplate(key)` overload, and
a new branch in `saveTemplate`. The single `Record<string, string>` signal scales linearly
with backend changes (just a string literal in the config map) and keeps the type surface
small. The trade-off is that consumers can't be reactive to a single key's value via
computed signals — but no consumer in this app needs that yet (`notifyGuardian` reads once
per WhatsApp send, and the dialog reads once per open), so the simpler shape wins.

### 4. Dedicated `/settings/notifications` route

The project has no other `settings/*` routes, and the templates section is small enough to
fit naturally next to the rest of the profile fields. Introducing a new top-level route for
this one config would diverge from the existing pattern (the profile dialog already owns
all per-user customization: avatar, signature, password, and now templates) and would force
the user to leave the dialog to save one message. Keeping the templates in
`ProfileDialogComponent` matches the "config in the surface the user already opens"
convention.

### 5. Auto-add a `'citations'` section to `NOTIFICATION_TEMPLATE_SECTIONS` on day one

`DEFAULT_TEMPLATES` ships with both `'absences'` and `'citations'` so the *fallback* is
available to any caller of `getTemplate('citations')`, but the dialog only renders the
`'absences'` section. This is intentional: the citation feature surfaces its own
section-by-section UI changes through sibling features (e.g. citation evidence reload,
citation listing), and shipping a non-functional "Citaciones" section before the rest of
the citation pipeline lands would invite users to save a custom message that no backend
code path consumes yet. Adding the section to the dialog array is a config-only change
once that pipeline ships.

## Cross-references

- Backend route contract: sibling feature `notification_templates_per_action` (feature 8),
  `GET/PUT /api/notification-templates`, body `{ actionKey: string; template: string }`.
- Consumer pattern: same `Promise.all([… , templateService.load()])` shape as
  `profile-dialog.component.ts`'s `ngOnInit`, applied to `absences.component.ts`'s
  `ngOnInit`.
- Service location follows the convention in `docs/architecture.md`: app-wide singleton
  service under `src/app/core/services/` with `providedIn: 'root'`.
