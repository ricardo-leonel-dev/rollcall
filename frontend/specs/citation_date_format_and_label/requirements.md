# Requirements — Citation date range: human-readable format + "Agendar entre" label

Context: `citations_listing_page` (#20) and `citations_schedule_dialog` (#21) shipped
`CitationsComponent`, `CitationDialogComponent`, and `CitationHistoryDialogComponent`. All three render
a `Citation`'s `dateFrom`/`dateTo` (`YYYY-MM-DD` strings, per `core/models/index.ts`) and optional
`time` (`HH:MM` 24-hour string) directly as raw text:

- `CitationsComponent.pillLabel()` — `c.dateFrom === c.dateTo ? c.dateFrom : \`${c.dateFrom} – ${c.dateTo}\``
- `CitationDialogComponent`'s pending-citations banner — `{{c.dateFrom === c.dateTo ? c.dateFrom : c.dateFrom + ' – ' + c.dateTo}}` plus a separate `{{c.time}}` suffix
- `CitationHistoryDialogComponent`'s history rows — same ternary as above, plus a separate `{{c.time}}` suffix
- `CitationsComponent.notifyGuardian()` — `` target.time ? `${target.dateFrom} a las ${target.time}` : target.dateFrom `` to fill the `{{fecha}}` placeholder in the citations WhatsApp template

This feature replaces all four with human-readable Spanish text (day of week, spelled-out month,
12-hour time with AM/PM) — a **full** sentence form ("Agendado el ..." / "Agendado entre ... y el ...")
for the banner and history dialog, and a **short** form (just the date/time, no "Agendado" prefix) for
the compact roster pill and the WhatsApp message — and adds an "Agendar entre" heading above the
"Desde"/"Hasta" date pickers in `CitationDialogComponent`'s create/edit form. **No backend or storage
change** — `dateFrom`/`dateTo` continue to be sent/received as `YYYY-MM-DD` strings; only rendered
display text changes.

## Decisions (confirmed by Ricardo 2026-09-06)

The initial draft of this spec left 4 open questions; all are now resolved:

1. **Same-day citations** (`dateFrom === dateTo`): confirmed — `"Agendado el {weekday} {day} de
   {month} del {year}"` (R1), same as the draft default.
2. **Roster-pill verbosity** (`CitationsComponent.pillLabel()`): confirmed **short form** — no
   "Agendado"/"Agendado entre ... y el" prefix, just the date(s) and time (R5, R6).
3. **WhatsApp message date** (`CitationsComponent.notifyGuardian()`): this fills the `{{fecha}}`
   placeholder in the citations template, whose text already reads *"...se ha registrado una citación
   para {{nombre}} el {{fecha}}."* (`notification-template.service.ts`) — the template's own "el"
   means `{{fecha}}` must be bare date/time text, not a full sentence. Confirmed: apply the new
   formatting here too, using the **short form** (R5) built from `dateFrom` only, since the WhatsApp
   message has only ever referenced the first day of the citation, never the range (R9).
4. **Time edge cases** (`00:00`, `12:00`): confirmed — the displayed AM/PM must match how the hour was
   actually stored/entered, i.e. standard 12-hour conversion: `00:00` → `12:00 AM`, `12:00` → `12:00
   PM`, `13:05` → `01:05 PM` (R3, unchanged from the draft default).

## Date/time label formatting — full form (banner, history dialog)

## R1
WHILE a citation's `dateFrom` equals its `dateTo`, the system SHALL format that citation's full-form
date label as `"Agendado el {weekday} {day} de {month} del {year}"`, where `{weekday}` and `{month}`
are the full, lowercase Spanish name (e.g. `"domingo"`, `"mayo"`) and `{day}`/`{year}` are computed
from `dateFrom`.

## R2
WHILE a citation's `dateFrom` differs from its `dateTo`, the system SHALL format that citation's
full-form date label as `"Agendado entre {weekday1} {day1} de {month1} del {year1} y el {weekday2}
{day2} de {month2} del {year2}"`, where the first weekday/day/month/year are computed from `dateFrom`
and the second from `dateTo`, using the same lowercase full-name rule as R1, and always including both
years even when `year1` equals `year2`.

## R3
WHILE a citation has a non-null `time` value, the system SHALL append `" a las {hh}:{mm} {AM|PM}"` to
the date label (full or short form), converting the stored 24-hour `HH:MM` string to 12-hour format
with zero-padded `hh`/`mm` and an uppercase `AM`/`PM` suffix (no periods, no locale-dependent spacing),
matching how the hour was actually entered/stored — e.g. stored `"07:33"` → `"07:33 AM"`, stored
`"00:15"` → `"12:15 AM"`, stored `"13:05"` → `"01:05 PM"`.

## R4
WHILE a citation has a null `time` value, the system SHALL render its date label using only the
date-portion text (R1/R2 for full form, R5 for short form), with no time suffix appended.

## Date/time label formatting — short form (roster pill, WhatsApp message)

## R5
The system SHALL provide a short-form date label that omits the "Agendado"/"Agendado entre ... y el"
prefix: WHILE `dateFrom` equals `dateTo`, it SHALL be `"{weekday} {day} de {month} del {year}"`
(computed from `dateFrom`, same lowercase full-name rule as R1); WHILE `dateFrom` differs from `dateTo`,
it SHALL be `"{weekday1} {day1} de {month1} del {year1} – {weekday2} {day2} de {month2} del {year2}"`
(en dash `–` separator, matching the separator already used by the raw ternary this replaces). The time
suffix rule (R3/R4) applies identically to the short form.

## Applying the labels to the four existing render sites

## R6
The system SHALL replace `CitationsComponent.pillLabel()`'s current raw `dateFrom`/`dateTo` ternary
with the **short-form** label defined by R5 (R3/R4 for the time suffix), so each roster-table citation
pill shows human-readable Spanish text instead of raw `YYYY-MM-DD` strings, without the longer
"Agendado" sentence prefix.

## R7
The system SHALL replace `CitationDialogComponent`'s pending-citations warning banner's current raw
`dateFrom`/`dateTo` ternary plus separate `{{c.time}}` suffix with a single **full-form** date label
per pending citation, defined by R1–R4.

## R8
The system SHALL replace `CitationHistoryDialogComponent`'s history-row current raw `dateFrom`/`dateTo`
ternary plus separate `{{c.time}}` suffix with a single **full-form** date label per citation, defined
by R1–R4.

## R9
The system SHALL replace `CitationsComponent.notifyGuardian()`'s current raw `dateLabel` construction
(`` target.time ? `${target.dateFrom} a las ${target.time}` : target.dateFrom ``) with the **short-form**
label defined by R5, built from `target.dateFrom` only (passing it as both the "from" and "to" date, so
R5's same-day branch always applies — the WhatsApp message has only ever referenced the citation's
first day, never a range), with the R3/R4 time suffix rule applied identically. This is the text that
fills the `{{fecha}}` placeholder in the citations WhatsApp template.

## Create/edit form heading

## R10
The system SHALL render a heading with the exact text `"Agendar entre"` immediately above the
"Desde"/"Hasta" date-picker row in `CitationDialogComponent`'s template, shown identically in both
create mode and edit mode.

## Storage format unchanged

## R11
The system SHALL continue to send `dateFrom`/`dateTo` to `POST /api/citations` and
`PUT /api/citations/:id` as `YYYY-MM-DD` strings via the existing `dateToDateString` utility, unchanged
by this feature — R1–R10 affect only rendered display text, never the request payload.

## Build & verification

## R12
The system SHALL compile with zero new TypeScript errors introduced by this feature (`pnpm run build`
exits `0`).

## R13
The system SHALL be manually smoke-tested (per `docs/verification.md`'s Level 3) covering: the roster
pill (short form) for a same-day citation with a time, a same-day citation without a time, and a
multi-day citation with a time; the pending-citations banner (full form) when creating a new citation
for a student with an existing pending one; the history dialog's full list (full form); the "Agendar
entre" heading in both create and edit mode; and the WhatsApp notify button's pre-filled message text
(short form) for a citation with a time. The steps and outcome SHALL be recorded in
`progress/impl_citation_date_format_and_label.md`.

## R14
The system SHALL be visually smoke-tested (per `docs/verification.md`'s Level 4,
`VISUAL_FEATURE=citation_date_format_and_label node scripts/visual-smoke.mjs`, reusing
`visual-smoke.mjs`'s existing `/api/citations` fixture which already includes same-day, multi-day,
timed, and untimed citations), and the resulting screenshot SHALL show human-readable Spanish date text
(not raw `YYYY-MM-DD` strings) in the roster pills, in the short form (no "Agendado" prefix).
