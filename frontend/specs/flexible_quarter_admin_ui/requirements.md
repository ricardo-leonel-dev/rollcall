# Requirements — Flexible quarter admin UI

Scope: frontend-only (`asistencia-frontend`). Rewrites
`src/app/features/admin/quarters-dialog.component.ts` from a 3-fixed-row editor into a real CRUD
(add / rename / delete / re-sequence) over the relaxed backend model implemented in the sibling
project by `relax_quarter_naming_and_count_constraints`, and surfaces the configured period
breakdown inline inside the academic-year row in `admin.component.ts`, so a reader does not need to
reopen the dialog to see what was saved. Cross-references:

- Backend contract that this UI talks to:
  `../backend/specs/relax_quarter_naming_and_count_constraints/{requirements,design}.md` —
  R5–R24 there are the load-bearing constraints this UI must respect (free-form `name` 1–60 chars,
  optional `sequenceNumber` auto-assigned when omitted, overlap + within-academic-year range
  validation, soft-delete on `DELETE`, 409 on duplicate `name`/`sequenceNumber`).
- Existing frontend feature this rewires: `configure_quarter_for_school_period` (feature 1, done,
  commits `ef4b7ed` + `4e64cbb` + `6ef1316`) — its dialog stays in place; this feature *changes*
  what that dialog does, not where it is opened from.

Acceptance-criterion mapping (every bullet from `state/features/004-…md` is satisfied by at least one
`R<n>` below; every `R<n>` below cites the acceptance bullet it satisfies):

- A1: "Dialog allows creating, renaming, and deleting periods (not limited to 3 fixed rows)"
  → **R1, R2, R3, R4**
- A2: "Overlap and academic-year-range validation still applies for N periods"
  → **R5, R6**
- A3: "After saving, `admin.component.ts` shows inline (per academic year) the name and date range
  of the configured periods, without reopening the dialog" → **R7, R8, R9**
- A4: "The inline list updates immediately after creating/editing/deleting a period"
  → **R10, R11, R12**
- A5: "Design built following the `frontend-design` skill (no generic Angular Material defaults)"
  → **R13, R14**
- A6: "`pnpm run build` returns 0 with no new warnings" → **R15**

## Data model

## R1 [A1]
The system SHALL widen the `Quarter.name` field in `src/app/core/models/index.ts` from the literal
union `'Primer Trimestre' | 'Segundo Trimestre' | 'Tercer Trimestre'` to plain `string`, so the
frontend TypeScript type matches the backend's relaxed `name VARCHAR(60)` column.

## R2 [A1]
The system SHALL widen `QuarterPayload.name` and `QuarterPatch.name` in
`src/app/core/services/quarter.service.ts` from the same literal union to plain `string`, and SHALL
expose a new `remove(id: number): Promise<void>` method on `QuarterService` that issues
`DELETE /api/quarters/:id`.

## R3 [A1]
The system SHALL widen `QuarterPayload` to accept an optional `sequenceNumber?: number` and SHALL
widen `QuarterPatch` to accept an optional `sequenceNumber?: number`, mirroring the backend R10/R16
contract (omit → backend auto-assigns next; explicit → backend validates and persists it).

## R4 [A1]
The system SHALL display, inside `QuartersDialogComponent`, a dynamically-sized list of period
cards — one per period saved for the academic year — instead of the current fixed array of
`['Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre']`. The list SHALL always render at
least one empty draft row when the academic year has zero persisted periods, and SHALL allow the
user to add additional rows via an "Agregar período" action and to remove rows via a per-row
"Quitar" action (so a previously-saved period can be deleted in the same session, not only
renamed/edited).

## CRUD behavior

## R5 [A2]
The system SHALL apply the same client-side overlap validation (a pairwise test that each draft's
`[startDate, endDate]` does not intersect any other draft's `[startDate, endDate]` when both dates
are set) to *all* rows in the dynamically-sized draft list — not only to three fixed rows — and
SHALL disable the dialog's primary save button when any row is invalid.

## R6 [A2]
The system SHALL apply the same client-side within-academic-year validation that the current
dialog enforces (each draft's `startDate` and `endDate` must lie inside the academic year's
`[startDate, endDate]`, when those bounds are set) to every row in the draft list, and SHALL
surface a per-row inline error message identifying the failing bound and the offending date.

## R7 [A3]
WHEN the user closes `QuartersDialogComponent` with `save() === true`, the system SHALL render,
inside the `AÑOS LECTIVOS` tab of `AdminComponent`, a compact horizontal list of period chips
**inline within the same `.admin-row` as the academic-year name** — to the right of the name
and to the left of the actions, visually integrated into the row (not as a separate block) —
with each chip displaying the period's ordinal + name + `startDate → endDate` range (or `—` when
a bound is unset), sourced from the same `Quarter[]` already loaded by
`QuarterService.getAll()`, without requiring the user to reopen the dialog.

## R8 [A3]
WHEN an academic year has zero configured periods (a freshly created year whose defaults were
all deleted, or a year whose backend seed was suppressed), the system SHALL render, in place of
the chip list, a single muted placeholder reading "Sin períodos configurados." followed by an
inline "Configurar trimestres" link (rendered as the existing affordance, not a button) so the
way to add periods is not lost.

## R9 [A3]
WHEN the period chips are rendered for an academic year, the system SHALL order them by
`sequenceNumber` ascending and SHALL prefix each chip with the ordinal numeral followed by a
middle dot (e.g. `1·`, `2·`, `3·`) so the temporal ordering is visible at a glance even when two
adjacent periods share a name prefix.

### Note (user amendment, 2026-08-29)

The original R7–R9 wording specified a "summary panel beneath each academic-year row". After the
first two reviewer passes approved that wording, the user (the spec owner) reviewed the live UI
and asked for the chip list to live **next to the year name, inside the same row**, not as a
separate visual block. R7–R9 above reflect that amendment; the chips now live inside
`.admin-row` between the year name and the action buttons. The implementer and reviewer of this
amended pass must evaluate against the *amended* R7–R9, not the original panel wording.

### Note (user amendment 2, 2026-08-29)

After a brief detour through a 2-3 column grid layout (see the R14 amendment note below — since
reverted), the user settled on the chip list being a **single-column vertical stack, one chip per
line**, not the "horizontal list" of R7's original wording. R7's "compact horizontal list" phrase
is superseded: chips are `display:flex; flex-direction:column`.

Separately, the user reviewed real data where a period's `sequenceNumber` did not match its
chronological `startDate` (e.g. a period numbered 4 that actually starts earliest) and asked for
the chip list's *order* to follow `startDate` ascending instead of `sequenceNumber` ascending.
R9's ordering clause is superseded by this: `quarterRowsFor()` now sorts by `startDate` ascending
(nulls last). The `{{sequenceNumber}}·` ordinal prefix on each chip is UNCHANGED — it still
displays the period's stored sequence number verbatim, so a chip's displayed ordinal and its
position in the list may now legitimately disagree when a period's sequence number and start date
are out of sync in the underlying data. Evaluate future passes against this amended ordering, not
the original sequenceNumber-driven sort.

### Note (user amendment 3, 2026-08-29)

Having the visible ordinal disagree with the visible order (per amendment 2, right above) read as
confusing rather than helpful, so the user asked to drop the `{{sequenceNumber}}·` prefix from
this inline chip entirely — R9's "SHALL prefix each chip with the ordinal numeral" clause is
superseded: the inline chip in `AdminComponent` shows only name + date range, no ordinal. This is
scoped to this one inline chip's rendering only; `Quarter.sequenceNumber` itself is untouched and
still governs backend ordering/uniqueness and the *dialog's* own paper-tab numeral (R13's "Nunito
700 display numeral as the sequence-number anchor" for `QuartersDialogComponent` is unaffected).

Separately, the chip list's container structure changed to fix a staggered-alignment defect: chips
are now wrapped in an inner `.quarter-chip-list` (`flex-direction:column; align-items:flex-start`,
shrink-wrapped to its widest chip) so their left edges line up, and that whole block is centered
within the middle zone via the outer `.admin-row-quarters` (`flex-direction:row;
justify-content:center`). Round 4's plain `align-items:center` on a single flex column (which
centered each chip independently, staggering their left edges since chip widths differ) is
superseded by this two-level structure.

## R10 [A4]
WHEN the dialog's `save()` resolves successfully, the system SHALL replace the cached
`Quarter[]` in `AdminComponent`'s in-memory state with the response of a fresh
`QuarterService.getAll()` call before re-rendering the inline summary panel, so the panel reflects
the just-saved state without a full page reload.

## R11 [A4]
WHEN the dialog's `save()` resolves successfully after the user added or deleted a period, the
system SHALL re-render the inline chip list within the same Angular change-detection tick, so the
chips reflect the just-saved state without a manual page reload or a re-navigation to the `years`
tab.

## R12 [A4]
IF the dialog's `save()` rejects with a backend error — including the 409 from
`UNIQUE(academic_year_id, name)`, the 409 from `UNIQUE(academic_year_id, sequenceNumber)`, the 400
from overlap (backend R14), or the 400 from out-of-range dates — the system SHALL surface the
backend's `err.error.error` message verbatim via `NotificationService.error(...)`, SHALL keep the
dialog open with the failing row highlighted, and SHALL NOT modify the inline summary panel.

## Visual & UX direction

## R13 [A5]
The system SHALL style the rewritten `QuartersDialogComponent` and the new inline period chips in
`AdminComponent` according to the design tokens already defined in `src/styles.css` (the
"Cuaderno de Asistencia" warm-paper palette: `--paper`, `--paper-deep`, `--ink`, `--ink-soft`,
`--muted-strong`, `--accent`, plus the 3-step `--radius-{sm,md,lg}` scale) — explicitly NOT the
generic Material default of unbranded white dialogs with unstyled borderless rows. Two signature
visual elements are defined:
  - **Dialog signature** (per draft period): a "paper-tab" card on `--paper-deep` with a
    `--border-soft` 1px rule, a 4px left-edge stripe tinted with `--accent`, and a Nunito 700
    display numeral as the sequence-number anchor.
  - **Inline chip signature** (per persisted period in the year row): a compact chip on
    `--paper-deep` with a 1px `--border-soft` rule, a 2px left-edge stripe tinted with `--accent`,
    rounded with `--radius-sm`, padding `4px 8px`, Nunito 700 ordinal at 14px, Nunito 600 name at
    13px, Nunito 400 range at 11px.

## R14 [A5]
The system SHALL derive every color, type, and spacing decision for the new inline period chips
and the rewritten dialog from the tokens in `src/styles.css` and the typography already loaded
(`@fontsource/nunito/300–700.css`) — no ad-hoc hex values, no Material default radii, no
unbranded greys. Specifically: chips are arranged in a horizontal flex row with `gap: 8px`,
wrapping to a second line when the row would otherwise overflow; chips share the same Nunito
family as the dialog; the empty-state placeholder uses Nunito 400 / 12px / `var(--muted-strong)`
followed by an inline text "Configurar trimestres" link in `var(--accent)` (underline on hover).
The "Quitar" affordance inside the dialog remains a ghost icon button colored
`var(--muted-strong)` (turning `--accent` on hover) instead of a destructive red.

### Note (user amendment, 2026-08-29)

The "horizontal flex row ... wrapping to a second line" wording above was approved through two
implementation rounds (flex column stack, then a later flex-based re-stack), but the user reviewed
the live app and found the resulting single-column chip list left a large unused gap before the
row's action buttons instead of using the available width. Presented with three layout options,
the user chose a **2-3 column grid**: `.admin-row-quarters` is `display: grid;
grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));` with chips kept content-sized
(`justify-self: start`, no stretching) inside their grid cell — not a horizontal flex row. R14's
"horizontal flex row ... wrapping" clause is superseded by this grid layout; the `gap: 8px` value
and every other token/typography requirement in R13-R14 are unaffected. Evaluate future passes
against this amended layout, not the original flex-row wording.

**Superseded again the same day**: after seeing the grid live, the user asked for the chips to go
back to a single-column vertical stack (see the R7/R9 "amendment 2" note above) — `display: flex;
flex-direction: column; gap: 6px;`, not the grid described just above. The grid interlude above is
kept here for traceability of how the layout evolved, but the *current* required layout is the
vertical stack; do not re-introduce the grid based on this note alone.

## Build & verification

## R15 [A6]
WHEN the implementation is complete, the system SHALL compile under `pnpm run build` with exit
code 0 and SHALL introduce no new build warnings attributable to the modified or new files
(modulo the pre-existing infra warnings logged by `./init.sh` for an empty `verify_command` and
an unset `SUPABASE_URL`, which are unchanged by this feature).
