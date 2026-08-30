# Design — Flexible quarter admin UI

See `docs/architecture.md` (layers, signal-based state, `inject()` over constructor injection,
`OnPush`, inline templates/styles, `firstValueFrom` over `.subscribe()`, error handling through
`NotificationService`) and `docs/conventions.md` (naming, file structure, no comments unless they
explain a non-obvious why, inline styles/templates, no `NgModule`) for the baseline this design
builds on. See `docs/specs.md` for the EARS/`R<n>`/`T<n>` contract that this design satisfies
and that `tasks.md` decomposes.

The backend contract this UI talks to is fixed by
`../backend/specs/relax_quarter_naming_and_count_constraints/{requirements,design}.md`. This design
only constrains the *shape* of the UI on top of that contract; it never proposes UI behavior the
backend doesn't support (e.g. no drag-and-drop reorder that would have to also re-sequence
siblings server-side, because no such endpoint exists).

## Files to touch

| File | Change | Requirements |
|---|---|---|
| `src/app/core/models/index.ts` | Widen `Quarter.name` from the literal union to `string`. | R1 |
| `src/app/core/services/quarter.service.ts` | Widen `QuarterPayload.name` and `QuarterPatch.name` to `string`; widen both to accept an optional `sequenceNumber?: number`; add `remove(id): Promise<void>` that issues `DELETE /api/quarters/:id`. | R2, R3 |
| `src/app/features/admin/quarters-dialog.component.ts` | Rewrite the component to (a) start from a dynamically-sized `drafts()` list derived from the existing `Quarter[]` in `data.existing` instead of the 3 fixed names, (b) expose "Agregar período" and per-row "Quitar" actions, (c) keep the existing client-side validation pipeline (within-academic-year + overlap) but generalize it to *N* rows, (d) `save()` distinguishes create vs update vs delete and issues the corresponding `create` / `update` / `remove` calls, returning `true` on success and `false` on cancel. | R4, R5, R6, R10, R11, R12 |
| `src/app/features/admin/admin.component.ts` | (a) Replace the `data: { academicYear: year, existing: quarters }` payload with a richer one (see "Dialog contract" below). (b) On `afterClosed() === true`, replace the local quarters cache with the fresh `QuarterService.getAll()` result and re-render the inline period chips directly from that cache (no full `loadAll()` round-trip needed for this scope). (c) Render inline period chips inside the same `.admin-row` as the academic-year name (to the right of the name, before the actions) for every academic-year row in the `AÑOS LECTIVOS` tab. | R7, R8, R9, R10, R11 |
| `src/app/features/admin/quarters-dialog.component.ts` (styles) | Apply the "paper-tab" design language per R13/R14. | R13, R14 |
| `src/app/features/admin/admin.component.ts` (styles) | Apply the inline-chip design language per R13/R14. | R13, R14 |

No new files are introduced — both the dialog and the admin page already exist; this feature
rewrites the dialog and extends the admin page. No new services, models, or routes are created.

## Service surface

```ts
// src/app/core/services/quarter.service.ts (post-change)

export type QuarterPayload = {
  name: string;
  sequenceNumber?: number;       // R3 — optional; backend auto-assigns when omitted
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
};

export type QuarterPatch = {
  name?: string;                 // R2 — now editable
  sequenceNumber?: number;       // R3 — now editable
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
};

@Injectable({ providedIn: 'root' })
export class QuarterService {
  // existing getAll / create / update unchanged in shape; signatures widen per R2/R3
  getAll(): Promise<Quarter[]>;
  create(data: QuarterPayload): Promise<Quarter>;
  update(id: number, data: QuarterPatch): Promise<Quarter>;
  remove(id: number): Promise<void>; // R2 — new, DELETE /api/quarters/:id
}
```

The `remove` method returns `Promise<void>` (not the deleted row) because the backend responds
`204 No Content` per R20 in the backend spec; the dialog deletes the row optimistically from its
local draft list before calling `remove`, so it never needs the response body.

## Dialog contract (intra-app, between `AdminComponent` and `QuartersDialogComponent`)

```ts
// QuartersDialogComponent (data input)
export interface QuartersDialogData {
  academicYear: { id: number; name: string; startDate: string | null; endDate: string | null };
  existing: Quarter[];   // already-provided Quarter[] from QuarterService.getAll()
}

// QuartersDialogComponent (afterClosed output) — broadened from `boolean` to a structured
// result so the caller can refresh state without guessing what changed
export interface QuartersDialogResult {
  saved: boolean;        // false = user pressed Cancel
  quarters?: Quarter[];  // present iff saved === true — the freshly-fetched Quarter[] from
                         // AdminComponent after the dialog's save() resolved, so the inline
                         // summary can render directly from it (R7, R10, R11)
}
```

`AdminComponent#openQuartersDialog` keeps its `MatDialog` plumbing but switches `afterClosed`'s
`async result => { … }` callback to:

1. If `result.saved === false` → do nothing.
2. If `result.saved === true && result.quarters` → assign `result.quarters` to a new
   `quartersByYear = signal<Record<number, Quarter[]>>({})` (or simply to a flat
   `quarters = signal<Quarter[]>(result.quarters)` plus a `computed()` that filters by
   `academicYearId`) — see "Reactive state" below — and rely on the signal/computed to
   re-render the inline summary panel.

## Reactive state (R10, R11)

`AdminComponent` already loads `Quarter[]` via `QuarterService.getAll()` in
`openQuartersDialog` and re-calls `loadAll()` after every successful dialog close today. After
this feature, it keeps a local cache:

```ts
private readonly _quartersByYear = signal<Map<number, Quarter[]>>(new Map());
readonly quartersByYear = this._quartersByYear.asReadonly();

// computed view that the template binds to
quarterRowsFor(yearId: number): readonly Quarter[] {
  return (this._quartersByYear().get(yearId) ?? [])
    .slice()
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}
```

`openQuartersDialog`'s success path replaces the relevant year's entry in the map with the
freshly-fetched `Quarter[]` (R10). The inline summary template binds to `quarterRowsFor(year.id)`
through a pure `@for (q of quarterRowsFor(y.id); track q.id)` — Angular's signal-driven change
detection (zoneless + `OnPush` per `docs/architecture.md` §1) handles the re-render in the same
tick (R11). No `loadAll()` round-trip is needed for the inline summary to update; the rest of
`AdminComponent`'s data (users/courses) is unaffected by a quarter edit, so reloading it on every
quarter save would be wasted work.

The existing `loadAll()` flow is left intact for non-quarter mutations (academic year CRUD, user
CRUD, etc.) — the new inline quarters cache is *additional*, not a replacement.

## Inline period chips (R7, R8, R9)

Renders inside the `@for (y of years(); track y.id)` block in the `AÑOS LECTIVOS` tab, **inside
the existing `.admin-row` itself**, between the year name and the action buttons — visually
integrated into the row, not a separate block. Layout sketch (ASCII):

```
.admin-row                                                                       <-- existing
   ├── (year name, date range)
   ├── [1·T1·01/03–30/05]  [2·T2·01/06–31/08]  [3·T3·01/09–15/12]   ← NEW inline chips
   └── (action buttons: editar, trimestres, eliminar)
```

DOM:

```html
<div class="admin-row">                                          <!-- existing -->
  <div class="admin-row-name">{{ y.name }}</div>                 <!-- existing -->
  <div class="admin-row-quarters">                               <!-- NEW, vertical flex column, gap: 6px -->
    @for (q of quarterRowsFor(y.id); track q.id) {
      <span class="period-chip" title="{{ q.name }} · {{ q.startDate }} → {{ q.endDate }}">
        <span class="period-chip-ordinal">{{ q.sequenceNumber }}·</span>
        <span class="period-chip-name">{{ q.name }}</span>
        <span class="period-chip-range">{{ q.startDate ?? '—' }} → {{ q.endDate ?? '—' }}</span>
      </span>
    } @empty {
      <span class="period-chip-empty">
        Sin períodos configurados.
        <a class="period-chip-cta" (click)="openQuartersDialog(y)">Configurar trimestres</a>
      </span>
    }
  </div>
  <div class="admin-row-actions">…</div>                         <!-- existing -->
</div>
```

The `@empty` branch renders a single muted span plus an inline text link (not a Material
button — buttons here would visually compete with the actions on the right). The link reuses
`openQuartersDialog(y)` so the affordance lives in exactly one place. The chip strip only
renders for the active year (`@if (y.isActive)`) — inactive years' quarters aren't editable in
the current flow and cluttering the row with read-only data would contradict the "save → see
inline" intent of A3.

### Why chips next to the name (and not below it)

Original R7 wording specified a "summary panel beneath each academic-year row". After two
reviewer passes approved that wording, the user (the spec owner) reviewed the live UI and asked
for the period list to live **next to the year name, inside the same row**, not as a separate
visual block. The chips above reflect that amendment. The implementer and reviewer of this
amended pass evaluate against the chip layout described here, not the original panel wording.

## Dialog CRUD mechanics (R4)

`drafts()` becomes a dynamic signal of `QuarterDraft[]`. Each draft carries a `localId: number`
(used as the `@for` track key, generated by an incrementing counter) so Angular can track add /
remove operations correctly:

```ts
interface QuarterDraft {
  localId: number;                  // stable track key for @for
  remoteId: number | null;          // present iff this draft was loaded from the backend
  name: string;
  sequenceNumber: number | null;    // null for newly-added drafts; backend auto-assigns on POST
  startDate: Date | null;
  endDate: Date | null;
  description: string;
  deleted?: boolean;                // set when the user clicked "Quitar" on a remote row
}
```

`save()` walks `drafts()` in a single transaction of HTTP calls (sequential, not
`Promise.all`, to preserve backend behavior on duplicate `sequenceNumber` checks — the backend
runs them in a transaction, but a parallel client could fire two creates with the same implicit
auto-assigned `sequenceNumber` and both could lose; serial is safer):

1. For each draft where `deleted === true && remoteId !== null` → `await quarterService.remove(remoteId)`.
2. For each remaining draft in `sequenceNumber`-ascending order, where `remoteId === null` →
   `await quarterService.create({ name, sequenceNumber: sequenceNumber ?? undefined, startDate, endDate, description })`.
3. For each remaining draft where `remoteId !== null && !deleted` →
   `await quarterService.update(remoteId, { name, sequenceNumber, startDate, endDate, description })`.

Validation (`validationErrors()` computed) runs on the full `drafts()` list before `save()`
issues any HTTP call and disables the primary button when any error exists — same `isValid()`
gate as today, generalized to N rows. Errors map by `localId`, not by `name`, so two draft rows
with the same name (allowed in the dialog before the backend 409 fires — useful for diagnosing
the error inline) can each carry their own error message.

The "Agregar período" action appends a new `QuarterDraft { localId: nextId++, remoteId: null,
name: '', sequenceNumber: null, startDate: null, endDate: null, description: '' }`. The "Quitar"
action sets `deleted = true` on a row that came from the backend; for a brand-new (never-saved)
row it removes the draft outright instead of soft-marking it.

## Visual & UX direction (R13, R14)

Subject, audience, and job:

- **Subject.** A school administrator managing the academic-year calendar for one institution —
  they think in terms of "Primer Trimestre / Segundo Trimestre" today but their institution may
  switch to semesters or bimesters in the future.
- **Audience.** A staff user (typically rector or admin), Spanish-speaking, who already manages
  the rest of the academic year from this same `AÑOS LECTIVOS` tab.
- **Job.** Configure the per-year period breakdown once, then read it back at a glance without
  re-entering the dialog.

This rules out the three "AI-default" looks the `frontend-design` skill calls out (warm cream +
terracotta, near-black + acid green, broadsheet hairline rules). The "Cuaderno de Asistencia"
ledger/notebook palette already established in `src/styles.css` is the right fit — it is
specific to the subject (a teacher's attendance book), so we extend it rather than introduce a
parallel system. The aesthetic risk lives in one place: the **paper-tab period row**.

### Token plan

No new tokens. Every color, type, and spacing decision derives from existing tokens in
`src/styles.css` and the Nunito family already loaded. Specifically:

| Decision | Token / source |
|---|---|
| Background of dialog body and summary panel | `var(--paper)` (and `var(--paper-deep)` for the per-period card) |
| Text color, period name | `var(--ink)`, Nunito 700, 14–15px |
| Text color, date range | `var(--muted-strong)`, Nunito 400, 12px |
| Container border | `var(--border-soft)` 1px (panels), `var(--border)` 1px (per-row stripe) |
| Left-edge ordinal stripe | `var(--accent)` (with `var(--accent-soft)` fill on hover) |
| Card radius | `var(--radius-md)` (period cards), `var(--radius-lg)` (dialog content) |
| Invalid-row accent | keep existing `#fecaca` border + `#fef2f2` background + `#b91c1c` text — already used elsewhere in the file |
| Destructive "Quitar" affordance | `var(--muted-strong)` ghost icon, not red — destroys via `ConfirmDialogComponent` so the actual destructive color lives there, in one place |
| Typography, ordinal numeral | Nunito 700, 20px, `var(--accent)` — a single restrained use of display weight per row |

### Layout

**Dialog** (per `QuartersDialogComponent`):

- Width stays at `560px` (current value).
- Body has 16px padding via `mat-dialog-content`'s default + a 12px vertical gap between period
  cards.
- Top of body keeps the existing `range-hint` strip ("Rango del año lectivo: … → …") so the
  within-academic-year bound is visible at the top of the dialog without the user having to
  scroll — but its color is bumped from `var(--paper)` to `var(--paper-deep)` to keep visual
  hierarchy with the new period cards.
- A persistent footer "Agregar período" `mat-stroked-button` lives just above the dialog
  `mat-dialog-actions` so the affordance is in the same scrolling context as the rows it adds,
  not buried under them.
- Each period card is `var(--paper-deep)` with a 4px-wide left edge in `var(--accent)` (the
  "paper-tab" signature) and a small `var(--muted-strong)` ordinal numeral "01", "02", … in the
  top-left, derived from `sequenceNumber` for saved rows or `$index + 1` for new ones.

**Inline period chips** (per `AdminComponent`):

- The chips live inside `.admin-row` in a flex container `.admin-row-quarters` with
  `flex-direction: column; gap: 6px; align-items: flex-start; flex: 1; min-width: 0;` — chips
  stack vertically, one per row, in the middle column between the year name and the action
  buttons. The `.admin-row` parent uses `align-items: flex-start` so the year name and the
  action buttons stay anchored to the top of the row while the chip stack grows downward.
- Each chip is a single inline-flex span on `var(--paper-deep)` background, 1px
  `var(--border-soft)` rule, 2px left-edge stripe tinted with `var(--accent)`,
  `var(--radius-sm)` corners, padding `4px 8px`, gap `6px` between the three text spans. The
  chip carries a `title` attribute with the same content as visible text for hover affordance.
- Inside each chip: ordinal (`N·`, Nunito 700, 14px, `var(--accent)`) — name (Nunito 600, 13px,
  `var(--ink)`) — range (`YYYY-MM-DD → YYYY-MM-DD`, Nunito 400, 11px, `var(--muted-strong)`).
  Use a real middle dot `·` (U+00B7), not a hyphen or asterisk.
- Empty state is a single muted span ("Sin períodos configurados.", Nunito 400, 12px,
  `var(--muted-strong)`) followed by an inline text link "Configurar trimestres" in
  `var(--accent)` (Nunito 600, 12px, underline on hover, cursor pointer). No Material button
  here — buttons would visually compete with the row's right-hand actions.
- Loading / error states are not rendered in the chip strip: chips only appear once
  `quartersByYear` has a value, and HTTP errors surface through the dialog itself, not here.
- Mobile (<600px): chips already stack vertically (one per row) at every width, so the mobile
  view is the same as desktop for this layout — no extra responsive rule needed.

### Motion

Two restrained uses only — both already proven elsewhere in the codebase:

- The `Agregar período` button triggers a 120ms fade-in on the newly-appended draft card via
  `@starting-style` / CSS animation (Angular 22 + zoneless supports this; no `setTimeout`).
- The "Quitar" `ConfirmDialogComponent` slides in via the default Material dialog motion.

No scroll-triggered reveals, no parallax, no ambient motion — the design's boldness lives in the
signature paper-tab stripe, not in animation.

### Writing

Plain, sentence-case Spanish matching the rest of the app:

- Dialog title: "Configurar períodos" (not "Trimestres" — the title changes with the new
  flexible model; "períodos" is the same word the backend spec uses for the relaxed case).
- Per-row empty `name` placeholder: "Nombre del período".
- Per-row primary action labels: "Agregar período", "Quitar".
- Empty-state inline message: "Sin períodos configurados."
- Success toast: "Períodos actualizados." (replaces the current "Trimestres actualizados" — same
  tone, plural noun matching the new flexible model).
- Error toast: pass through `err.error.error` unchanged (R12) — no rewriting, no apology.

## Discarded alternatives

1. **Drag-and-drop reorder of period rows (`@angular/cdk/drag-drop`) so the user can drag a row
   to change its `sequenceNumber`.** Rejected: the acceptance criteria says "create, rename, and
   delete periods" — reorder is not in scope. Adding drag-and-drop brings the whole `cdk/drag-drop`
   module into the bundle (~15–20 kB raw) for a feature no one asked for; the same effect is
   achievable today by editing `sequenceNumber` explicitly via the backend's PUT endpoint, and
   the inline summary already sorts by `sequenceNumber` ascending so the visual ordering is
   data-driven, not position-driven. If reorder becomes a real requirement, it is its own
   `R<n>` and its own Notion card — not a stealth add-on here.
2. **A separate `QuarterFormComponent` shared between the dialog (edit-existing row) and the
   inline chip strip (in-place edit).** Rejected: in-place edit of an already-saved period
   inside the chip strip is not in the acceptance criteria ("after saving, … shows inline (per
   academic year) the name and date range of the configured periods" — that's read-only
   intent). The dialog is the only edit surface; the chips are a viewer. Splitting the form
   into its own component to share it with a non-existent consumer would be speculative
   abstraction.
3. **Auto-naming new drafts (`"Nuevo período 1"`, `"Nuevo período 2"`, …) so the user can press
   "Agregar período" and immediately see a sensible label, even before typing.** Rejected: it
   would let the user POST a row whose `name` is the placeholder string by accident (they
   forget to rename it), the backend's 409 `UNIQUE(academic_year_id, name)` would fire on the
   second auto-named row, and the inline summary would briefly show "Nuevo período 1 /
   Nuevo período 2 / …" before the user fixed them — a confusing intermediate state. Empty
   `name` + immediate inline error is more honest.
4. **Render the inline period chips as a Material `mat-chip-listbox` so they get the official
   focus / keyboard / removable affordances for free.** Rejected: `mat-chip-listbox` brings the
   Material chip chrome (the rounded avatar slot, the elevation, the remove-icon defaults) on
   top of every period row, contradicting R13/R14's "no generic Angular Material defaults"
   intent and the paper-ledger aesthetic. Native `<span>` chips styled via the existing tokens
   keep the visual language consistent with the dialog cards (same `--paper-deep` background,
   same `--accent` left-stripe). If keyboard/ARIA support becomes a real requirement, this is
   a future feature, not a stealth add-on here.
5. **Put the chips in a second line below the year name (a "row + chips" two-line layout) so
   long period lists don't push the actions off-screen.** Rejected: this is exactly what the
   user pushed back on ("no me agrada que se vea como una opcion aparte visualmente"). Chips
   live inside the same `.admin-row`; the row itself stays a single visual unit (name + chips
   + actions), and the chips stack vertically in the middle column. When the chip list grows,
   the row grows vertically; the name and the actions stay pinned to the top of that row.

## Resolved questions (from earlier review passes)

**Q1 (resolved 2026-08-29, session 4).** Should the inline summary support per-period delete
from the summary itself? **Answer: NO** — keep delete inside the dialog. The chips are a
viewer, not an edit surface.
