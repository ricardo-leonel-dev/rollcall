# Design — `/profile` tabs + catalog-driven WhatsApp message templates

Conventions are those of `docs/architecture.md` (standalone + `OnPush`,
signals, `inject()`, `firstValueFrom` in `try/catch`, errors surfaced via
`NotificationService`) and `docs/conventions.md` (inline template/styles,
import order, `shared/utils/<domain>.util.ts` for pure functions). This file
only records choices made within those boundaries.

## Files touched

| File | Change | Requirements |
|---|---|---|
| `src/app/core/models/index.ts` | Replace `NotificationTemplate` with `NotificationTemplatePlaceholder` + `NotificationTemplateItem`. | R1, R2 |
| `src/app/shared/utils/template.util.ts` | **New.** `fillTemplate()`, `FALLBACK_TEMPLATES`, `PLACEHOLDER_SAMPLES`, `previewTemplate()`. | R11, R31, R48 |
| `src/app/core/services/notification-template.service.ts` | Rewrite: item cache, per-user memoization, `restoreDefault`, `renderTemplate` (with emergency fallback), `hasTemplate`, `ensureLoaded`; delete `DEFAULT_TEMPLATES`. | R3–R12, R46, R47, R49–R51 |
| `src/app/features/absences/absences.component.ts` | `ngOnInit` prefetches with `ensureLoaded()`; `notifyGuardian` becomes popup-safe async with retry, uses `renderTemplate`, always `?text=`. | R13, R15, R16, R52–R57 |
| `src/app/features/citations/citations.component.ts` | Same as absences. | R14, R15, R16, R52–R57 |
| `src/app/features/profile/profile.component.ts` | Chapter header, tab group, catalog-driven cards, dirty tracking; remove `DEFAULT_NOTIFICATION_TEMPLATE`, `template`/`savingTemplate`/`preview()`/`insert()`/`saveTemplate()`, `Me.notificationTemplate`, `MeSnapshot.notificationTemplate`, and both direct `/api/notification-templates` calls. | R12, R17–R43 |

Unchanged: `profile-can-deactivate.guard.ts`, `unsaved-changes-dialog.component.ts`
(its copy says "en tu perfil", which still fits both tabs), `app.routes.ts`,
`ConfirmDialogComponent`, `LoadingSpinnerComponent`, `ChapterHeaderComponent`.
No new runtime dependency: `MatTabsModule` is already used by
`absences.component.ts` and the global tab overrides live in `src/styles.css`
(lines ~260–262).

## Model (R1, R2)

```ts
export interface NotificationTemplatePlaceholder {
  key:   string;
  label: string;
}

export interface NotificationTemplateItem {
  actionKey:       string;
  label:           string;
  description:     string | null;
  placeholders:    NotificationTemplatePlaceholder[];
  defaultTemplate: string;
  template:        string;
  isCustom:        boolean;
}
```

Mirrors backend R7 exactly (backend `toItem`). The old `NotificationTemplate`
has two importers (the service and nothing else after this change) — delete it.

## `shared/utils/template.util.ts` (R11, R31, R48)

```ts
import { NotificationTemplatePlaceholder } from '../../core/models/index';

// EMERGENCY COPY — used ONLY by NotificationTemplateService.renderTemplate when the
// backend catalog (GET /api/notification-templates) has no item for the action,
// i.e. the catalog failed to load even after a retry. It is NOT the default shown or
// edited in /profile (that always comes from the catalog's `defaultTemplate`).
// Copied verbatim from ../backend postgres/24_message_template_actions.sql; it MAY
// DRIFT if the catalog defaults are later changed — the catalog wins whenever it loads.
// Keep each value a single-line literal (the verification grep depends on it).
export const FALLBACK_TEMPLATES: Readonly<Record<string, string>> = {
  absences: 'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.',
  citations: 'Estimado apoderado, se ha registrado una citación para {{nombre}} el {{fecha}}. Por favor confirmar asistencia.',
};

export function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{{${key}}}`, () => value);
  return out;
}

export const PLACEHOLDER_SAMPLES: Record<string, string> = {
  nombre: 'JUAN PÉREZ',
  fecha:  '17 de junio de 2026',
  tipo:   'una falta',
  curso:  'OCTAVO "A"',
};

export function previewTemplate(template: string, placeholders: NotificationTemplatePlaceholder[]): string {
  const vars: Record<string, string> = {};
  for (const p of placeholders) vars[p.key] = PLACEHOLDER_SAMPLES[p.key] ?? `[${p.label}]`;
  return fillTemplate(template, vars);
}
```

- `replaceAll` with a **string** pattern matches literally, and the
  replacer **function** makes the value literal too (a plain string value
  would interpret `$&`/`$1` sequences). Together that satisfies R11's
  "literal replacement".
- `PLACEHOLDER_SAMPLES` is preview sample data, not a catalog: a new catalog
  action whose placeholders are not in the map still previews (`[<label>]`)
  with zero frontend changes. It lives in `shared/utils/` so that
  `profile.component.ts` holds no placeholder key literals (R23).
- `fecha` sample is a long-form date because the same key carries a plain
  date for `absences` and "date a las time" for `citations`; one neutral
  sample keeps the map keyed by placeholder only.

## Service (R3–R12)

```ts
@Injectable({ providedIn: 'root' })
export class NotificationTemplateService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _items = signal<NotificationTemplateItem[]>([]);
  readonly items = this._items.asReadonly();

  private loadPromise: Promise<void> | null = null;
  private loadedForUserId: number | null = null;

  load(): Promise<void> {
    const userId = this.auth.currentUser()?.id ?? null;
    if (this.loadPromise && this.loadedForUserId !== userId) {   // R5
      this.loadPromise = null;
      this._items.set([]);
    }
    if (!this.loadPromise) {
      this.loadedForUserId = userId;
      this.loadPromise = firstValueFrom(this.http.get<NotificationTemplateItem[]>('/api/notification-templates'))
        .then(list => this._items.set(list))
        .catch(err => { this.loadPromise = null; throw err; });     // R6
    }
    return this.loadPromise;                                        // R4
  }

  /** Never rejects: used by the WhatsApp consumers to prefetch and to retry (R51). */
  async ensureLoaded(): Promise<void> {
    try { await this.load(); } catch { /* consumers fall back via renderTemplate (R46) */ }
  }

  getTemplate(actionKey: string): string {                          // R7 — cache only, no fallback
    return this.findItem(actionKey)?.template ?? '';
  }

  hasTemplate(actionKey: string): boolean {                         // R50
    return !!this.findItem(actionKey);
  }

  renderTemplate(actionKey: string, vars: Record<string, string>): string {   // R11
    const item = this.findItem(actionKey);
    if (item) return fillTemplate(item.template, vars);
    console.warn(`[NotificationTemplateService] catalog unavailable for "${actionKey}"; using emergency fallback text`); // R47
    return fillTemplate(FALLBACK_TEMPLATES[actionKey] ?? '', vars);                                               // R46
  }

  private findItem(actionKey: string): NotificationTemplateItem | undefined {
    return this._items().find(i => i.actionKey === actionKey);
  }

  async saveTemplate(actionKey: string, template: string): Promise<NotificationTemplateItem> {  // R8, R10
    const saved = await firstValueFrom(
      this.http.put<NotificationTemplateItem>('/api/notification-templates', { actionKey, template }),
    );
    this.replace(saved);
    return saved;
  }

  async restoreDefault(actionKey: string): Promise<NotificationTemplateItem> {  // R9, R10
    const restored = await firstValueFrom(
      this.http.delete<NotificationTemplateItem>(`/api/notification-templates/${encodeURIComponent(actionKey)}`),
    );
    this.replace(restored);
    return restored;
  }

  private replace(item: NotificationTemplateItem): void {
    this._items.update(list => list.map(i => (i.actionKey === item.actionKey ? item : i)));
  }
}
```

The service imports `fillTemplate` and `FALLBACK_TEMPLATES` from
`shared/utils/template.util.ts`; that import plus the one use in
`renderTemplate` are the only `FALLBACK_TEMPLATES` references outside the
util (R49).

`AuthService.currentUser` is the existing public read-only signal over
`_user` (`AuthResponse['user']`, which has `id: number`). There is no circular
dependency: `AuthService` does not inject this service.

**Why R5 (per-user memoization).** Today `load()` is memoized for the
lifetime of the tab. Feature 18 tolerated that because `DEFAULT_TEMPLATES`
masked an empty cache; but on a shared school computer, user B logging in
after user A (no page reload — `logout()` only navigates) would send A's
custom messages from `absences`. Now that the profile page also reads from
this cache, the bug would also show A's templates in B's profile. Keying the
memo by user id fixes both with no new wiring in `AuthService.logout()`.

**Error paths.**
- `load()` failure: memo cleared, error rethrown (R6) — the profile page
  needs the rejection to show its error state (R25). The WhatsApp consumers
  instead call `ensureLoaded()` (R51), which swallows it: today their
  `ngOnInit` does `Promise.all([GET /api/courses, templateService.load()])`,
  so a catalog failure also aborted loading the courses list; switching to
  `ensureLoaded()` (R56) decouples the two.
- Retry: because R6 clears the memo on failure, the `ensureLoaded()` in
  `notifyGuardian` (R15) issues a fresh `GET`; if the initial prefetch is
  still in flight it simply awaits that same promise (R4). No timeout is
  added: a failing backend errors quickly (connection refused / 502 from
  Nginx); a hung request would leave the reserved tab blank until the
  browser's own timeout — accepted for an emergency path.
- Fallback scope: `FALLBACK_TEMPLATES` is reached only through
  `renderTemplate` and only when no catalog item exists for the key — after a
  failed load, or if an action was deactivated in the catalog while a
  consumer still sends it. `getTemplate` (R7) and `items()` never see it, so
  the profile editor can only ever show catalog data (R23, R28, R49). The
  `console.warn` (R47) is the only signal; no toast, because the user's
  action (sending the message) still succeeds with a sensible text.
- `saveTemplate`/`restoreDefault` failure: `replace()` runs only after the
  awaited call, so the cache is untouched and the error propagates (R10).

## Consumers (R13–R16, R52–R57)

`ngOnInit` (both): replace `this.templateService.load()` inside the existing
`Promise.all` with `this.templateService.ensureLoaded()` (R56). The
destructuring (`const [courses] = ...`) is unchanged.

`notifyGuardian` (both) becomes `async ... : Promise<void>`; its callers
(template `(click)`, the snackbar `onAction`, the conflict dialog
`onWhatsapp`) ignore the returned promise — it never rejects. Justified /
closed early returns stay exactly as today (R57).

```ts
// absences.component.ts — notifyGuardian, after the isJustified early return
const vars = { nombre: studentName, fecha: date, tipo: type === 'F' ? 'una falta' : 'un atraso', curso: course };
const toUrl = (message: string) => `${whatsappLink}?text=${encodeURIComponent(message)}`;   // R52
if (this.templateService.hasTemplate('absences')) {                                         // R53 fast path
  window.open(toUrl(this.templateService.renderTemplate('absences', vars)), '_blank');
  return;
}
const reserved = window.open('', '_blank');                                                 // R54
await this.templateService.ensureLoaded();                                                  // R15 retry
const url = toUrl(this.templateService.renderTemplate('absences', vars));                   // catalog or R46 fallback
if (reserved) reserved.location.href = url; else window.open(url, '_blank');                // R55

// citations.component.ts — identical shape with 'citations',
// vars = { nombre: row.studentName, fecha: formatCitationDateLabelShort(target.date, target.time) }
// and row.whatsappLink.
```

**Why the reserved tab (R53–R55).** Browsers only allow `window.open` inside
the user's click gesture; one issued after an `await` on a network request
is usually popup-blocked. The common path (catalog already cached) opens
synchronously, exactly like today. Only the degraded path reserves a blank
tab synchronously and navigates it once the text is ready — assigning
`location.href` on a window this page opened (still `about:blank`, same
origin) is allowed. If even the reservation is blocked (`null`), it falls
back to a direct `window.open` (may be blocked, but no worse than doing
nothing). A shared helper is not extracted: two call sites, five lines each.

The action keys `'absences'`/`'citations'` stay as literals in the consumers
— they are the code paths that *are* those actions; R23's no-literal rule
applies only to the settings page.

## `ProfileComponent` (R17–R43)

### Tab state (R19, R20)

Same pattern as `admin.component.ts` (`activeTab` from `queryParamMap` via
`toSignal`):

```ts
private readonly route = inject(ActivatedRoute);
private readonly router = inject(Router);

readonly selectedTab = toSignal(
  this.route.queryParamMap.pipe(map(p => (p.get('tab') === 'mensajes' ? 1 : 0))),
  { initialValue: this.route.snapshot.queryParamMap.get('tab') === 'mensajes' ? 1 : 0 },
);

onTabChange(index: number): void {
  this.router.navigate([], {
    relativeTo: this.route,
    queryParams: { tab: index === 1 ? 'mensajes' : null },
    queryParamsHandling: 'merge',
    replaceUrl: true,
  });
}
```

Template: `<mat-tab-group [selectedIndex]="selectedTab()" (selectedIndexChange)="onTabChange($event)" ...>`.
A query-param-only navigation reuses the same `ProfileComponent` instance and,
with the default `runGuardsAndResolvers: 'paramsChange'`, does **not** run
`canDeactivate` — so switching tabs never prompts (R20) and in-progress edits
on the other tab survive. Smoke step 4 verifies this rather than assuming it.

Use `mat-tab` with `<ng-template mat-tab-label>` so each label can carry its
dirty dot (R21). Both tab bodies must keep their DOM-held state when hidden;
`mat-tab` content is lazily created and destroyed by default only with
`matTabContent` — do **not** use `<ng-template matTabContent>`; plain content
is preserved. All card state lives in signals anyway (below), so even a
re-created DOM would re-render the same text.

### Card state

```ts
interface TemplateCardState {
  item:      NotificationTemplateItem;   // baseline = item.template; pill = item.isCustom
  text:      string;                     // current textarea value
  caret:     number;                     // last recorded selectionStart
  caretEnd:  number;                     // last recorded selectionEnd
  busy:      boolean;                    // save or restore in flight (R40)
}

readonly templatesStatus = signal<'loading' | 'ready' | 'error'>('loading');
readonly cards = signal<TemplateCardState[]>([]);
```

- `ngOnInit`: `Promise.all([GET /api/auth/me, this.loadTemplates()])` where
  `loadTemplates()` sets `templatesStatus('loading')`, awaits
  `templateService.load()` inside `try/catch`, then
  `cards.set(items().map(item => ({ item, text: item.template, caret: item.template.length, caretEnd: item.template.length, busy: false })))`
  and `templatesStatus('ready')`; on error, `templatesStatus('error')` (no
  toast — the inline error state is the feedback, and it must not reject the
  `Promise.all` so `Mi cuenta` still loads: R25). `Reintentar` calls
  `loadTemplates()`.
- Every mutation goes through one helper:
  `private patchCard(actionKey: string, patch: Partial<TemplateCardState>)`
  that does `cards.update(list => list.map(...))`. Per-card `busy` makes R40
  fall out naturally (feature 18 discarded alternative 1 applies equally here).
- Textarea binding: `[ngModel]="card.text" (ngModelChange)="patchCard(card.item.actionKey, { text: $event })"`
  plus `(select)`, `(click)`, `(keyup)` and `(blur)` handlers that record
  `selectionStart`/`selectionEnd` from the `HTMLTextAreaElement` (`$event.target`).
- Chip insert (R30):
  `text = text.slice(0, caret) + token + text.slice(caretEnd)`, new
  `caret = caretEnd = caret + token.length`; then, after the view updates
  (`afterNextRender` or a `queueMicrotask`), focus the textarea and call
  `setSelectionRange(caret, caret)`. Get the element via a template ref on
  the textarea passed into the handler: `(click)="insertPlaceholder(card, p.key, ta)"`.
  Unlike feature 18 (append-only), insertion at the caret is what lets a
  user place `{{curso}}` mid-sentence without retyping.
- Derived per card (pure methods taking the card, called from the template;
  cheap and `OnPush`-safe because `cards` is a signal):
  `isDirty(c) = c.text !== c.item.template`,
  `isBlank(c) = !c.text.trim()`,
  `canSave(c) = isDirty(c) && !isBlank(c) && !c.busy` (R33),
  `canRestore(c) = !c.busy && (c.item.isCustom || c.text !== c.item.defaultTemplate)` (R36),
  `preview(c) = previewTemplate(c.text, c.item.placeholders)` (R31).
- `templatesDirty = computed(() => cards().some(isDirty))` drives the
  Mensajes tab dot; the Mi cuenta dot uses the existing account-field
  comparisons extracted from `hasDirty()` into `accountDirty()`. Because
  the account fields are plain `[(ngModel)]` class fields (not signals),
  `accountDirty()` is a method, re-evaluated on each change-detection pass
  triggered by those inputs — same mechanism the existing `@if (title ||
  signatureLabel || fullName)` signature preview already relies on.

### Save / restore (R34–R39)

```ts
async saveCard(c: TemplateCardState): Promise<void> {
  const key = c.item.actionKey;
  this.patchCard(key, { busy: true });
  try {
    const saved = await this.templateService.saveTemplate(key, c.text);
    this.patchCard(key, { item: saved, text: saved.template });
    this.notify.success('Mensaje guardado');
  } catch (err: any) {
    this.notify.error(err?.error?.error ?? 'No se pudo guardar el mensaje');
    throw err;            // so canDeactivate's allSettled sees the failure (R42)
  } finally {
    this.patchCard(key, { busy: false });
  }
}
```

The button handler wraps it: `(click)="saveCard(card).catch(() => {})"` —
or provide a thin `onSave(card)` that swallows, so a click never produces an
unhandled rejection. `restoreCard(c)`: if `!c.item.isCustom`, `patchCard(key,
{ text: c.item.defaultTemplate })` and return (R38); otherwise open
`ConfirmDialogComponent` (data below), `await firstValueFrom(afterClosed())`,
return unless `=== true`, then the same busy/try/catch/finally shape calling
`restoreDefault` with toast `Mensaje restaurado` / error fallback `No se pudo
restaurar el mensaje` (R37, R39). `afterClosed()` here is a one-shot read,
so `firstValueFrom` is fine.

### Unsaved-changes guard (R41–R43)

- `hasDirty()` becomes `accountDirty() || templatesDirty()` (R41).
- In `canDeactivate()`'s `'save'` branch: first, if any dirty card is blank,
  `notify.warning('Hay un mensaje de WhatsApp vacío. Escríbelo o restáuralo antes de salir.')`
  and `return false` before sending anything (R43). Otherwise add
  `cards().filter(isDirty).map(c => this.saveCard(c))` to the existing task
  list (dropping the old `saveTemplate()` entry) and keep the existing
  `Promise.allSettled(...).every(fulfilled)` rule (R42).

## Visual direction

Written by hand within the existing "Cuaderno de Asistencia" system
(`frontend-design` skill loaded; the brief pins the direction, so no new
palette or typeface — tokens only, Nunito only, no hex literals except the
WhatsApp green already used app-wide). The page's one job: let a teacher
read, at a glance, *what the parent will actually receive* for each kind of
message, and change it with confidence.

**Signature element — the notebook margin.** The `Vista previa` block is
styled as a torn-out cuaderno note: `--paper-deep` background, and a
2px vertical rule in `--stripe` (the red margin line of a school notebook)
inset 14px from its left edge, with the text starting 12px after the line.
This is the one decorative move on the page; everything else stays quiet.
It encodes something true: the preview is the "written-out" message, as
opposed to the template with tokens above it.

### Palette (tokens only)

| Role | Value |
|---|---|
| Card surface | `background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-lg)` |
| Card heading | `color: var(--ink)` |
| Description / help text | `color: var(--muted-strong)` |
| Chip | `background: var(--accent-soft); color: var(--accent); border: 1px solid transparent; border-radius: var(--radius-sm)` — replaces the old hardcoded `#4f46e5` / `#c7d2fe`, which broke in dark mode |
| Chip hover | `border-color: var(--accent)` |
| Pill `Personalizado` | `background: var(--accent-soft); color: var(--accent)` |
| Pill `Predeterminado` | `background: var(--border-soft); color: var(--muted-strong)` |
| Preview block | `background: var(--paper-deep); border: 1px solid var(--border-soft); border-radius: var(--radius-md)`; margin rule `var(--stripe)` |
| Blank hint | `color: var(--stripe)`; icon `error_outline` 16px |
| Dirty dot | 7px circle, `background: var(--accent)` |
| Tab icons | `Mi cuenta`: `mat-icon` `person` 18px; `Mensajes de WhatsApp`: `<app-whatsapp-icon [size]="18" />` (existing shared component), `margin-right: 6px` — same label pattern as `absences.component.ts` tabs |

### Type

- Card heading (`label`): Nunito 16px / 700 / `--ink`.
- Description: 13px / 400 / line-height 1.5.
- Chips: `ui-monospace, monospace` 11.5px (same monospace the old chip used —
  tokens are code-like, the user types them literally).
- Pills: 11px / 700 / uppercase / letter-spacing .06em / padding 3px 9px /
  radius 999px.
- Preview text: 13.5px / line-height 1.6 / `--ink-soft` / `white-space: pre-wrap`.
- Section labels inside a card (`Plantilla`, `Vista previa`): reuse the
  existing `.preview-label` style (11px, 700, uppercase, `--muted`).

### Layout

```
app-chapter-header  (icon="manage_accounts", eyebrowPrefix="Cuenta personal",
                     eyebrowSuffix="Preferencias y mensajes")
page-header  h1 "Mi perfil"
mat-tab-group (same container style as absences: paper bg, --border, radius 16px)
├─ [person] Mi cuenta •          → existing 4 sections, unchanged, max-width 720px
└─ [wa]    Mensajes de WhatsApp • → intro line + stack of cards, max-width 960px
```

Mensajes tab body: `padding: 24px`; intro paragraph (copy below) 13px
`--muted-strong`, `margin-bottom: 20px`; cards stacked with `gap: 16px`.

Card anatomy (≥1024px — two columns inside the card body):

```
┌───────────────────────────────────────────────────────────────┐
│ Faltas y atrasos                              [PERSONALIZADO] │
│ Mensaje de WhatsApp al representante cuando …                 │
│ ─────────────────────────────────────────────────────────────│
│ PLANTILLA                        │ VISTA PREVIA               │
│ {{nombre}} {{fecha}} {{tipo}} …  │ ┃ Estimado representante,  │
│ ┌─────────────────────────────┐  │ ┃ le informamos que JUAN … │
│ │ textarea (rows 6, autosize) │  │ ┃                          │
│ └─────────────────────────────┘  │                            │
│ ─────────────────────────────────────────────────────────────│
│                 [Restaurar predeterminado]  [Guardar mensaje] │
└───────────────────────────────────────────────────────────────┘
```

- ≥1024px: body `display: grid; grid-template-columns: 1fr 1fr; gap: 20px`.
- 600–1023px and <600px: single column, preview below the textarea (tablet
  rule matches feature 29's 1024px breakpoint).
- <600px: actions stack full-width, `Guardar mensaje` first (primary on top),
  card padding 16px, tab group labels may scroll (Material default).
- Card padding 20px 24px; header row `display:flex; justify-content:space-between; align-items:flex-start; gap:12px`;
  divider lines `1px solid var(--border-soft)`.
- Textarea: Material `outline` form field, `cdkTextareaAutosize` with
  `cdkAutosizeMinRows=5`, `cdkAutosizeMaxRows=14` (import `TextFieldModule`
  from `@angular/cdk/text-field` — already a transitive dependency of
  Material; no new package).

### Interaction states

| Element | Hover | Focus-visible | Selected / active | Disabled |
|---|---|---|---|---|
| Chip | `border-color: var(--accent)` | `outline: 2px solid var(--accent); outline-offset: 2px` | — | n/a (chips never disable; inserting while busy is harmless) |
| Tab label | Material default | Material default focus ring | global override: `--accent` text + underline | — |
| `Guardar mensaje` (`mat-flat-button color="primary"`) | Material | Material | — | Material disabled (R33) |
| `Restaurar predeterminado` (`mat-stroked-button`, icon `restart_alt`) | Material | Material | — | Material disabled (R36) |
| `Reintentar` (`mat-stroked-button`, icon `refresh`) | Material | Material | — | while `templatesStatus() === 'loading'` |

While `busy`, the clicked button shows its label unchanged and is disabled —
no spinner inside buttons (matches every other save button on the page).

### Motion

One allowed motion: the dirty dot fades in (`opacity 0 → 1`, 150ms ease-out)
when a tab becomes dirty. Wrap it in
`@media (prefers-reduced-motion: reduce) { transition: none; }`. Nothing else
animates.

### UI copy (every new string)

| Where | Text |
|---|---|
| Chapter eyebrow | prefix `Cuenta personal`, suffix `Preferencias y mensajes` |
| Tab 1 label | `Mi cuenta` |
| Tab 2 label | `Mensajes de WhatsApp` |
| Dirty dot `aria-label` / `title` | `Cambios sin guardar` |
| Mensajes intro | `Estos son los mensajes que se precargan al notificar a un representante por WhatsApp. Son personales: los cambios solo aplican a tu cuenta.` |
| Pill (custom) | `Personalizado` |
| Pill (default) | `Predeterminado` |
| Textarea label | `Plantilla` |
| Chips row hint (above chips, 12px muted) | `Toca un marcador para insertarlo donde está el cursor.` |
| Preview label | `Vista previa` |
| Blank hint (R32) | `El mensaje no puede quedar vacío. Usa «Restaurar predeterminado» para recuperar el texto original.` |
| Save button | `Guardar mensaje` |
| Restore button | `Restaurar predeterminado` |
| Save success toast | `Mensaje guardado` |
| Save error fallback | `No se pudo guardar el mensaje` |
| Restore confirm dialog | `title: 'Restaurar mensaje predeterminado'`, `message: 'Se reemplazará tu mensaje personalizado de «<label>» por el texto predeterminado. Esta acción no se puede deshacer.'`, `confirmLabel: 'Restaurar'`, `icon: 'restart_alt'`, `severity: 'primary'` |
| Restore success toast | `Mensaje restaurado` |
| Restore error fallback | `No se pudo restaurar el mensaje` |
| Loading (spinner `message`) | `Cargando mensajes…` |
| Error state | icon `cloud_off`, title `No se pudieron cargar los mensajes`, body `Revisa tu conexión e inténtalo de nuevo.`, button `Reintentar` |
| Empty state | icon `chat_bubble_outline`, title `No hay mensajes para configurar`, body `Cuando la institución habilite notificaciones por WhatsApp, aparecerán aquí.` |
| Guard blank warning (R43) | `Hay un mensaje de WhatsApp vacío. Escríbelo o restáuralo antes de salir.` |

The page `h1` stays `Mi perfil` (topbar entry is labelled `Mi perfil`).
Error/empty states: centered column, padding 48px 24px, icon 32px
`--muted`, title Nunito 15px/700 `--ink`, body 13px `--muted-strong`.

## Discarded alternatives

1. **Child routes `/profile/cuenta` and `/profile/mensajes`.** Rejected:
   each child would be a separate component instance, so switching tabs
   would run `canDeactivate` (prompting on every tab switch with edits) and
   dirty state would have to be hoisted into a shared service. A query param
   on one component keeps deep-linkability without either cost.
2. **Open the bare WhatsApp chat (no `?text=`) when the catalog cannot be
   loaded** (this spec's first draft). Rejected by the human reviewer: a
   default text must always be prefilled unless the user wrote their own.
   Replaced by retry + emergency `FALLBACK_TEMPLATES` (R15, R46–R55).
2b. **Keep the old `DEFAULT_TEMPLATES` pattern (`getTemplate` = cache ??
   local default) as the fallback.** Rejected: it makes the local copy a
   co-primary source that leaks into anything calling `getTemplate`
   (including the profile editor), and it masked the per-user cache bug
   (R5). The emergency copy is reachable only from `renderTemplate`, only
   after a retry, and is grep-restricted (R49).
2c. **Await the retry and then `window.open` directly, without reserving a
   tab.** Rejected: the open happens outside the click gesture and is
   popup-blocked in Chrome/Safari, so the degraded path would silently do
   nothing.
3. **Restore by `PUT`-ing `defaultTemplate` as the user's template.**
   Rejected: it would leave `isCustom: true` with default text, so future
   catalog default changes would never reach that user. `DELETE` is what the
   backend designed for this.
4. **Per-action preview samples from the backend.** Rejected for now: the
   catalog has no sample column and adding one is a backend change outside
   this feature; a frontend sample map keyed by placeholder plus the
   `[label]` fallback covers unknown future placeholders.
5. **Append-only chip insertion (feature 18 behavior).** Rejected: with
   two or more messages and long text, forcing tokens to the end makes the
   chips nearly useless; caret insertion is a small, contained change.

## Verification

Level 1 build (R44) plus these grep checks (each must print nothing):

```
grep -rnw "DEFAULT_TEMPLATES\|DEFAULT_NOTIFICATION_TEMPLATE" src/          # R12
grep -rn "interface NotificationTemplate\b\|NotificationTemplate\[\]\|<NotificationTemplate>" src/   # R2
grep -n "'absences'\|'citations'\|'nombre'\|'fecha'\|'tipo'\|'curso'\|{{nombre}}" src/app/features/profile/profile.component.ts   # R23
grep -n "/api/notification-templates" src/app/features/profile/profile.component.ts   # R22
grep -n "replace(/\\\\{\\\\{" src/app/features/absences/absences.component.ts src/app/features/citations/citations.component.ts   # R16
grep -n "templateService.load()" src/app/features/absences/absences.component.ts src/app/features/citations/citations.component.ts   # R56
```

And these checks with an expected (non-empty) output:

```
# R49 — exactly 3 lines: the declaration in template.util.ts, the import and the
# single renderTemplate use in notification-template.service.ts. Nothing else.
grep -rn "FALLBACK_TEMPLATES" src/

# R48 — each prints 1 (texts byte-identical to the backend migration 24 seed)
grep -cF "'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.'" src/app/shared/utils/template.util.ts
grep -cF "'Estimado apoderado, se ha registrado una citación para {{nombre}} el {{fecha}}. Por favor confirmar asistencia.'" src/app/shared/utils/template.util.ts
grep -c "EMERGENCY COPY" src/app/shared/utils/template.util.ts
```

Manual smoke (R45; 18 steps) — stack running with backend migration 24 applied; record
pass/fail + screenshot per step in `progress/impl_profile_whatsapp_templates_tab.md`:

1. Open `/profile`: chapter header, `Mi perfil`, tabs `Mi cuenta` |
   `Mensajes de WhatsApp`; `Mi cuenta` selected, 4 sections, no
   `Mensaje de notificación` section. (R17, R18, R19)
2. Click `Mensajes de WhatsApp`: URL gains `?tab=mensajes` with no new
   history entry (Back leaves `/profile`); one card per item returned by
   `GET /api/notification-templates` in DevTools, same order (expect
   `Faltas y atrasos`, `Citaciones`); each card shows label, description,
   pill, chips with catalog labels as tooltips. Repeat with DevTools
   throttling "Slow 4G" on a reload of `/profile?tab=mensajes`: spinner
   `Cargando mensajes…` shows before the cards. (R20, R22, R23, R24, R27, R29)
3. Fresh user (no customs): both textareas equal `defaultTemplate`, pills
   `Predeterminado`, previews show sample values; `Guardar mensaje`
   disabled; `Restaurar predeterminado` disabled. (R28, R31, R33, R36)
4. Edit `Citaciones` text → Mensajes dot appears; switch to `Mi cuenta` and
   back: no dialog, edit still there. (R20, R21, R41)
5. Put the caret mid-text, click `{{fecha}}`: token inserted there, caret
   after it; select a word and click a chip: word replaced. (R30)
6. Clear a textarea: preview hidden, blank hint shown, Save disabled. (R32, R33)
7. Save `Citaciones`: toast `Mensaje guardado`, pill `Personalizado`, dot
   gone, Save disabled; while in flight the `Faltas y atrasos` buttons stay
   governed by their own state. Reload: text persists. (R34, R40)
8. In `/citations`, notify a guardian: WhatsApp opens with the saved
   custom text rendered (no reload between step 7 and this), opened
   immediately with no blank intermediate tab. In `/absences`,
   notify for a falta: default text with name/fecha/`una falta`/curso. (R8, R13, R14, R52, R53)
9. Back in Mensajes, `Restaurar predeterminado` on `Citaciones`: confirm
   dialog; `Cancelar` → nothing changes; again → `Restaurar`: toast
   `Mensaje restaurado`, text = default, pill `Predeterminado`. (R37)
10. On a default card, type extra text, click `Restaurar predeterminado`:
    text reverts instantly, no dialog, no network request. (R38)
11. DevTools → block request URL `/api/notification-templates*`: save →
    error toast, text kept; restore on a custom card → error toast, text and
    pill kept. Reload `/profile?tab=mensajes` with the block on → error
    state with `Reintentar`; `Mi cuenta` still loads/saves; unblock and
    click `Reintentar` → cards appear. (R10, R25, R35, R39)
12. Edit a card, click a sidebar link → unsaved dialog → `Guardar y salir`:
    navigation proceeds, text persisted. Repeat with a blank dirty card →
    warning toast, stay on page, no PUT sent. (R42, R43)
13. Log out as user A (who has a custom `Faltas y atrasos`), log in as user B
    without reloading the browser: B's `/profile?tab=mensajes` shows B's own
    templates and `/absences` notify uses B's text (second GET visible in
    DevTools). (R4, R5)
14. DevTools → block request URL `/api/notification-templates*`, open
    `/absences` fresh: the courses list and absences still load (no broken
    page). Notify a guardian for a falta: a new GET to
    `/api/notification-templates` is visible at click time (retry), it fails,
    and WhatsApp still opens (not popup-blocked) with `?text=` prefilled
    with the emergency default text (name/fecha/`una falta`/curso filled);
    the console shows one `catalog unavailable for "absences"` warning and no
    toast appears. Repeat in `/citations`. Then, with the block still on,
    open `/profile?tab=mensajes`: error state, no card shows the emergency
    text. (R6, R15, R46, R47, R51, R52, R54, R55, R56)
15. Toggle dark mode: chips, pills, preview margin rule readable (no
    hardcoded light colors). Check widths 1280 / 800 / 375. (Visual direction)
16. In the local DB only: `UPDATE message_template_actions SET active = false;`
    reload `/profile?tab=mensajes` → empty state copy; then
    `UPDATE message_template_actions SET active = true;` and confirm cards
    return. Never run this against Supabase/VPS. (R26)
17. Retry success: block `/api/notification-templates*`, open `/citations`
    fresh (prefetch fails), then remove the block and notify a guardian
    for a citation of a user with a custom `Citaciones` template: the retry
    GET succeeds and WhatsApp opens with the user's **custom** text (not the
    emergency copy), no console warning. (R6, R15, R50, R54, R55)
18. Justified absence in `/absences` and closed citation in `/citations`:
    WhatsApp still opens the bare chat with no `?text=`, as before. (R57)

Requirement grouping for traceability (per `docs/specs.md` "Coverage
granularity"): R1, R3, R7, R9, R11 are exercised end-to-end by smoke steps
2/3/8/9 plus the build's type-checking; the implementer lists the mapping
explicitly in `progress/impl_profile_whatsapp_templates_tab.md`.
