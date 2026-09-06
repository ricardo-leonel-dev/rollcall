# Design — Citation date range: human-readable format + "Agendar entre" label

## Files touched

| File | Change |
|---|---|
| `src/app/shared/utils/citation-date.util.ts` | New — `formatCitationDateLabel()` (full form, R1–R4) and `formatCitationDateLabelShort()` (short form, R3–R5). |
| `src/app/features/citations/citations.component.ts` | `pillLabel()` uses the short-form util (R6); `notifyGuardian()`'s `dateLabel` uses the short-form util (R9). |
| `src/app/features/citations/citation-dialog.component.ts` | Pending-banner list item uses the full-form util (R7); "Agendar entre" heading added above the date-row (R10). |
| `src/app/features/citations/citation-history-dialog.component.ts` | History-row date/time uses the full-form util (R8). |

No changes to `core/models/index.ts` (the `Citation` interface already carries `dateFrom`/`dateTo`/
`time`, all that's needed), no backend files, no routing changes, no change to `dateToDateString`/
`dateStringToDate` (R11 — those are only used to convert to/from the datepicker's `Date` objects and
the `YYYY-MM-DD` save payload, untouched by this feature).

## `shared/utils/citation-date.util.ts` (new)

```ts
import { dateStringToDate } from './date.util';

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatLongDateEs(dateStr: string): string {
  const d = dateStringToDate(dateStr)!; // dateStr is always a valid YYYY-MM-DD Citation field
  return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} del ${d.getFullYear()}`;
}

function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${mStr} ${period}`;
}

function withTimeSuffix(base: string, time: string | null): string {
  return time ? `${base} a las ${formatTime12h(time)}` : base;
}

/** Full form: "Agendado el ..." / "Agendado entre ... y el ...". Used in the pending-citations
 *  banner and the history dialog, where there's room for a full sentence. */
export function formatCitationDateLabel(dateFrom: string, dateTo: string, time: string | null): string {
  const base = dateFrom === dateTo
    ? `Agendado el ${formatLongDateEs(dateFrom)}`
    : `Agendado entre ${formatLongDateEs(dateFrom)} y el ${formatLongDateEs(dateTo)}`;
  return withTimeSuffix(base, time);
}

/** Short form: bare date(s) + time, no "Agendado" prefix. Used in the compact roster pill and in the
 *  WhatsApp message, where the surrounding text (pill layout, or the template's own "el {{fecha}}")
 *  already supplies context — see requirements.md decision #2/#3. */
export function formatCitationDateLabelShort(dateFrom: string, dateTo: string, time: string | null): string {
  const base = dateFrom === dateTo
    ? formatLongDateEs(dateFrom)
    : `${formatLongDateEs(dateFrom)} – ${formatLongDateEs(dateTo)}`;
  return withTimeSuffix(base, time);
}
```

- Reuses `dateStringToDate` from `shared/utils/date.util.ts` (already imported by all three existing
  call sites) to parse `YYYY-MM-DD` into a local-midnight `Date`, avoiding the classic UTC-vs-local
  off-by-one-day bug `date.util.ts` was already written to avoid.
- `formatTime12h` operates on the raw `"HH:MM"` string directly (no `Date` round-trip needed since
  there's no timezone/day component to get wrong).
- `formatCitationDateLabelShort` is not a special case of the full form with a flag — it's a second
  exported function sharing the same private helpers, since the two forms' prefix logic differs enough
  (the full form's "y el" is embedded mid-sentence, the short form's separator is a plain en dash) that
  a single function with a boolean/variant parameter would need its own branching per form anyway. Two
  small pure functions reading top-to-bottom is simpler than one function branching twice.
- Named/grouped as `shared/utils/citation-date.util.ts` rather than added to the generic
  `shared/utils/date.util.ts` — see "Discarded alternatives" #2.

## Call-site changes

**`citations.component.ts`** — `pillLabel(c: Citation): string` body becomes:
```ts
return formatCitationDateLabelShort(c.dateFrom, c.dateTo, c.time);
```

`notifyGuardian(row: CitationRosterRow): void` — replace:
```ts
const dateLabel = target.time ? `${target.dateFrom} a las ${target.time}` : target.dateFrom;
```
with:
```ts
const dateLabel = formatCitationDateLabelShort(target.dateFrom, target.dateFrom, target.time);
```
(passing `target.dateFrom` as both arguments so the short form's same-day branch always applies — the
WhatsApp message only ever references the citation's first day, per requirements.md decision #3). The
rest of `notifyGuardian` (building `message` from the template, opening the WhatsApp link) is unchanged.

**`citation-dialog.component.ts`** — the pending-banner `<li>` becomes:
```html
<li>{{formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)}}</li>
```
(dropping the now-redundant `@if (c.time) { · {{c.time}} }` suffix, since the util already appends
time). `formatCitationDateLabel` is imported and exposed as a readonly class field (same pattern as
`citationReasonSeverityBadgeClass` already used in this file) so the template can call it directly.

Add the heading immediately above the existing `.date-row` div:
```html
<div class="section-label">Agendar entre</div>
<div class="date-row"> ... </div>
```
with a small style rule alongside the file's existing style block:
```css
.section-label { font-size: 12px; font-weight: 700; color: var(--muted-strong); margin-bottom: 6px; }
```
(matching the weight/size/color already used for e.g. `.evidence-zone-label`/`.pending-banner-title` in
this same file — no new visual language introduced). Shown unconditionally (both create and edit mode,
per R10 — no `@if` needed).

**`citation-history-dialog.component.ts`** — the `.history-row-date` div becomes:
```html
<div class="history-row-date">{{formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)}}</div>
```
dropping the separate `@if (c.time) { <span class="history-row-time"> · {{c.time}}</span> }` block
(now folded into the util's output) and the now-unused `.history-row-time` style rule.

## Exceptions / error paths

None — both formatting functions are pure over data that's already validated server-side (`dateFrom`/
`dateTo` are non-null `YYYY-MM-DD` strings on every `Citation` returned by the backend, `time` is
either `null` or a valid `HH:MM` string per the existing `citation-dialog.component.ts` save payload).
No new try/catch or `NotificationService` call is needed.

## Discarded alternatives

1. **Use `Date.prototype.toLocaleDateString('es-EC', {...})` / `toLocaleTimeString(..., { hour12:
   true })`** instead of hand-written weekday/month arrays and a custom AM/PM formatter — this is the
   pattern already used elsewhere in the codebase (`timeline.component.ts`, `calendar.component.ts`,
   `dashboard.component.ts`). **Rejected**: `es-EC`'s AM/PM marker renders as `"a. m."`/`"p. m."`
   (lowercase, with periods, non-breaking space) in every ICU build tested, not the uppercase `"AM"`/
   `"PM"` the feature's literal example shows — using `toLocaleTimeString` would still require
   post-processing the string to strip periods and re-case it, at which point a small dedicated
   formatter is more predictable than depending on `Intl`'s locale data (whose exact output can vary
   across Node/browser ICU versions) and is easier to unit-test once this project has a test runner.
2. **Add the formatting functions to the existing generic `shared/utils/date.util.ts`** instead of a
   new `citation-date.util.ts`. **Rejected**: `date.util.ts` today has a narrow, reusable contract —
   pure `Date <-> YYYY-MM-DD` conversion, used by ~15 unrelated features. This feature's formatters
   embed citation-specific business text (`"Agendado"` / `"Agendado entre ... y el ..."`), which
   doesn't belong in a file whose only job is format conversion; `docs/conventions.md`'s "grouped in
   `shared/utils/<domain>.util.ts`" naming rule supports a separate, citation-scoped file instead.
3. **Give the roster pill and the WhatsApp message the same full-sentence label** used in the banner/
   history dialog, for a single formatting function instead of two. **Rejected** per Ricardo's decision
   #2/#3 (2026-09-06) — the pill is a compact table cell and the WhatsApp template already supplies its
   own "el" before `{{fecha}}`, so both need the bare short form instead.
