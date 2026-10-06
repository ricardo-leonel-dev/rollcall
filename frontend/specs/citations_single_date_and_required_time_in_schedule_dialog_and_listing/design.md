# Design — Citations: single date + required time in schedule dialog and listing

## Files to touch

All edits are inside `frontend/src/app/` (`core/models`, `shared/utils`, `features/citations/`) plus
one visual-smoke fixture file. No backend changes — the backend side of this model change already
shipped as `citation_guardian_conflict_validation` (#15).

### `core/models/index.ts`
- `Citation` interface: drop `dateFrom: string; dateTo: string;`, add `date: string;`, change
  `time: string | null` → `time: string`, add `guardianId: number | null;` right after `id` (matching
  the field order `CITATION_FIELDS_SQL` returns it in — `id, date, time, guardianId, status, ...` — for
  readability, not a functional requirement).
- `CitationRosterRow` already has its own `guardianId: number | null` at the row level (the *current*
  enrollment guardian, used for "who do we notify" and the WhatsApp link) — that field is untouched.
  The new `Citation.guardianId` is a **different, per-citation** snapshot (the guardian at the time that
  specific citation was made) — the two can differ for a student whose guardian changed after an older
  citation was created. Both fields coexist under the same name at different nesting levels; do not
  conflate them when implementing R13.

### `shared/utils/citation-date.util.ts`
Full replacement content:

```ts
import { dateStringToDate } from './date.util';

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatLongDateEs(dateStr: string): string {
  const d = dateStringToDate(dateStr)!;
  return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} del ${d.getFullYear()}`;
}

function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${mStr} ${period}`;
}

export function formatCitationDateLabel(date: string, time: string): string {
  return `Agendado el ${formatLongDateEs(date)} a las ${formatTime12h(time)}`;
}

export function formatCitationDateLabelShort(date: string, time: string): string {
  return `${formatLongDateEs(date)} a las ${formatTime12h(time)}`;
}
```

`formatTime12h`/`formatLongDateEs` are unchanged from #27 — only the two exported functions' signatures
and bodies simplify (no branch on equality, no `withTimeSuffix` null-check helper, since `time` is now
always a real string per R2).

### `features/citations/citation-dialog.component.ts`
- **Imports**: `MatDatepickerModule` stays (still one date-picker). No new imports needed.
- **Template**:
  - Delete the `<div class="section-label">Agendar entre</div>` heading and the `.date-row` two-field
    block. Replace with a single `mat-form-field` (`appearance="outline"`, no special class needed —
    drop `.date-row`/`.date-row mat-form-field` CSS rules since nothing uses them anymore) containing
    `<mat-label>Fecha</mat-label>` and `<input matInput [matDatepicker]="picker" [(ngModel)]="date">`
    plus its own `mat-datepicker-toggle`/`mat-datepicker` pair (`#picker` instead of the old
    `#pickerFrom`/`#pickerTo`).
  - Change the time field's `<mat-label>Hora (opcional)</mat-label>` to `<mat-label>Hora</mat-label>`.
  - Pending-citations banner: change
    `{{formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)}}` to
    `{{formatCitationDateLabel(c.date, c.time)}}`.
  - New: when `isEdit && data.citation!.guardianId === null`, render a warning block (reuse the
    existing `.pending-banner`/`.pending-banner-title` styling — same amber-warning look already used
    for the pending-citations banner, just a different message and no list) reading something like
    "Esta citación no tiene representante asignado y no puede editarse." immediately below the dialog's
    student-name line, before the date/time fields. This is a **template change** — load the
    `frontend-design` skill before touching this file's `template`/`styles`, per `docs/architecture.md`
    "Design Workflow" / `docs/conventions.md` "Before touching any UI" (removing a two-field row and
    adding a single field plus a new warning block is exactly the kind of restyle that convention
    covers, however small).
- **Component class**:
  - Replace `dateFrom: Date | null = ...; dateTo: Date | null = ...;` with a single
    `date: Date | null = this.data.citation ? dateStringToDate(this.data.citation.date) : new Date();`.
  - `time` keeps its current initialization (`this.data.citation?.time ?? ''`) — still a plain string,
    just now required by `canSave` rather than optional.
  - New readonly `readonly isOrphanCitation = this.isEdit && this.data.citation!.guardianId === null;`
    computed once in the field initializer list (no need for a signal — `data.citation` never changes
    after the dialog opens, so a plain readonly field is consistent with how `isEdit` is already done
    two lines above it).
  - `canSave` getter:
    ```ts
    get canSave(): boolean {
      return !this.isOrphanCitation
        && this.reasonIds.length > 0
        && !!this.date
        && !!this.time;
    }
    ```
    (Folding `isOrphanCitation` into `canSave` directly satisfies R13's "Guardar stays disabled
    regardless of field values" without a second disabled-binding on the button.)
  - `save()`'s payload, branched by mode to match each endpoint's accepted body shape (verified against `backend/src/services/citation.service.ts`: `create()` at line 175 accepts `{ enrollmentId, date, time, observations?, reasonIds }`, and `update()` at line 209 accepts `Partial<{ date, time, observations, reasonIds }>` — passing `enrollmentId` to PUT is silently ignored, so don't send it):
    ```ts
    const base = {
      date: dateToDateString(this.date),
      time: this.time,
      observations: this.observations.trim() || null,
      reasonIds: this.reasonIds,
    };
    const payload = this.isEdit
      ? base
      : { enrollmentId: this.data.enrollmentId, ...base };
    ```
    (`time` is sent as-is, never `|| null`, since `canSave` already guarantees it's a non-empty string
    by the time `save()` can be invoked. Contract note: the backend's `update()` rejects `time: ''`
    or `time: null` with 400 — but the dialog has no UI control to clear time in edit mode, so this is
    a contract-clause note, not a user-reachable failure mode.)

### `features/citations/citations.component.ts`
- `scopedCitations()`: `c.dateFrom >= this.scopeStart! && c.dateFrom <= this.scopeEnd!` →
  `c.date >= this.scopeStart! && c.date <= this.scopeEnd!`.
- `pillLabel()`: `formatCitationDateLabelShort(c.dateFrom, c.dateTo, c.time)` →
  `formatCitationDateLabelShort(c.date, c.time)`.
- `notifyGuardian()`: `formatCitationDateLabelShort(target.dateFrom, target.dateFrom, target.time)` →
  `formatCitationDateLabelShort(target.date, target.time)`.
- (No roster-template change for `Agregar citación` — R14's proactive disable + tooltip was dropped per
  the "Decisions" section in `requirements.md` (option (c)). The button is left enabled and any
  enrollment without a representative falls through to the existing generic-error toast on save.)

### `features/citations/citation-history-dialog.component.ts`
- History-row label: `{{formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)}}` →
  `{{formatCitationDateLabel(c.date, c.time)}}`.

### `scripts/visual-smoke.mjs`
- Update the `/api/citations` mock fixture's citation objects (`id: 1`, `2`, `3`) to the new shape:
  replace `dateFrom`/`dateTo` pairs with a single `date` field (e.g. `id: 1` → `date: '2026-05-10'`,
  `id: 3`'s multi-day `dateFrom: '2026-06-01', dateTo: '2026-06-02'` collapses to `date: '2026-06-01'`
  since a range is no longer representable), and add a `guardianId` per citation (any non-null integer
  is fine). Note: the roster-row-level `guardianId: null` fixture at line ~211 is no longer exercising
  a feature requirement (R14 was dropped) — keep the fixture as-is so the row renders correctly with
  the new model, but no behavioral assertion attaches to it.
- Additionally, `id: 2` currently has `time: null` (line 192); the new `Citation.time: string` model
  is non-nullable, so set it to a concrete `HH:MM` (e.g. `time: '08:00'`). Its `status: 'closed'`
  is unchanged.

## Error handling / edge cases

- **`canSave` false states**: no new error path — the button simply stays disabled, same pattern as
  today's reason-count check.
- **`400`/`409` from `POST`/`PUT`**: unchanged — `save()`'s existing `try/catch` around
  `firstValueFrom(...)` already routes any failure through `NotificationService.error(err?.error?.error
  ?? 'No se pudo guardar la citación')`, per `docs/architecture.md`'s error-handling convention. This
  feature does not add a new catch branch for `409` specifically — see "Decisions" item 1 in
  `requirements.md` (Q1 option (b) adopted: 409 path stays untouched; the conflict object's fields are
  rendered richer by `citation_overlap_conflict_ui` #25).
- **Historical citation with `time` somehow still empty/malformed** (shouldn't happen post-migration,
  per backend R3's backfill, but defensively): `!!this.time` in `canSave` treats an empty string the
  same as any other missing value — the edit dialog simply won't let it save until the user fills in a
  time, which is the correct behavior for a "time is now mandatory" model regardless of how the row got
  into that state.

## Discarded alternatives

1. **Keep `formatCitationDateLabel(dateFrom, dateTo, time)`'s existing 3-argument signature and always
   call it with `dateFrom === dateTo`.** Rejected: this leaves dead code (the `dateFrom !== dateTo`
   branch can never execute once every call site is updated) and an API that lies about supporting
   multi-day ranges when the backend model no longer has a range to express. A reader encountering
   `formatCitationDateLabel(c.date, c.date, c.time)` six months from now would reasonably wonder why a
   "date range" formatter is being called with the same date twice — the single-date signature (R4/R5)
   states the actual current model directly.
2. **Keep `Citation.time` as `string | null` in the TS model** (defensive typing in case some row
   somehow retains a null time). Rejected: the backend's migration (`citation_guardian_conflict_validation` R3) backfills every existing null `time` to `'07:55'` and then sets the
   column `NOT NULL` at the schema level — there is no code path, migrated or newly-created, that can
   produce a null `time` going forward. Modeling it as nullable in TypeScript would just re-introduce,
   in the type system, the exact "is time present?" branch this feature is explicitly removing from
   `citation-date.util.ts`'s runtime logic (R6/R7) — the two would be inconsistent with each other.
3. **Don't proactively disable "Agregar citación"/"Guardar" for guardianless rows/citations;
   rely solely on the backend's `400` + the existing generic error toast.** Adopted partially
   (option (c) per the "Decisions" section in `requirements.md`): R13 (edit-mode orphan warning +
   permanently disabled "Guardar" when the citation's own `guardianId === null`) is kept, and R14
   (roster-row "Agregar citación" disabled button + tooltip) is dropped. The edit-side warning has
   higher user-visible value because the user has already invested in filling the dialog; the roster-
   side button can be added later if a real user-research need shows up.
4. **Represent the single date as a `[Date, Date]`-shaped tuple internally (reusing the old
   `dateFrom`/`dateTo` component fields, always kept equal) to minimize the diff against the current
   `citation-dialog.component.ts`.** Rejected: same reasoning as #1 — carrying two fields that must
   always be kept in lockstep is strictly more error-prone (a future edit could touch one and not the
   other) than a single `date` field, for a diff-size saving that doesn't matter here.

## Traceability note for the implementer

This feature has no automated tests (per `docs/conventions.md`/`docs/verification.md` — no test
framework configured yet), so "Traceability" in `progress/impl_<feature>.md` maps each `R<n>` to the
manual smoke step (R19) or visual smoke screenshot (R20) that exercises it, not to a `test_*` function —
consistent with how `citation_date_format_and_label` (#27) and other already-`done` SDD features in this
project recorded traceability before a test framework existed.
