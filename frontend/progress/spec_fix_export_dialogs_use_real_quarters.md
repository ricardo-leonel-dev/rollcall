# Spec drafting progress — `fix_export_dialogs_use_real_quarters`

> Drafted by `spec_author` (`leader -> spec_author`); submitted for human
> review via `mark-spec-ready`. Implements the protocol in `.claude/agents/spec_author.md`.

## Summary

Two export dialogs under
`src/app/features/student-report/{excel-export-dialog.component.ts,export-config-dialog.component.ts}`
compute their trimester pills from an equal-thirds division of the
currently-selected academic year's `startDate`/`endDate` (a synthetic
heuristic that produces `'Primer/Segundo/Tercer trimestre'` labels even
when the institution has 2, 4, or N configured quarters with custom names
like `Q1`, `Q2`, etc., or non-equal date ranges). This spec replaces
that algorithm with a read-only consumption of
`QuarterContextService.quarters()` — the same singleton the foundation
(feature 4) and the list-views integration (feature 6) already use.

The two dialogs keep their existing `mat-datepicker` `Desde`/`Hasta`
inputs as the always-editable source of truth; the pill row now writes
its chosen quarter's `startDate`/`endDate` to those pickers and flips a
small `activeQuarterId` signal for highlight state. Editing the pickers
manually clears the highlight (seed-not-override model — mirrors the
foundation's pill/preset pattern).

For the PDF dialog, the title suffix `FALTAS PRIMER TRIMESTRE` (also
derived from an equal-thirds midpoint) becomes the **real quarter's
configured name** uppercased, or `PERÍODO PERSONALIZADO` when no quarter
is active. The Excel dialog's title is just the file name, so no change
needed there beyond the pill row.

## File inventory

| File | Created | Notes |
|---|---|---|
| `specs/fix_export_dialogs_use_real_quarters/requirements.md` | yes | EARS R1–R18 with cross-references and acceptance-criterion mapping |
| `specs/fix_export_dialogs_use_real_quarters/design.md` | yes | Files-to-touch, equal-thirds-removal annotations, per-dialog integration pattern with exact-change code blocks, 6 discarded alternatives |
| `specs/fix_export_dialogs_use_real_quarters/tasks.md` | yes | T1–T10 ordered checkboxes, full reverse-traceability (R1–R18 → T<n>) |
| `progress/spec_fix_export_dialogs_use_real_quarters.md` | yes | This file |

No other files touched. `QuarterSelectorComponent`,
`QuarterContextService`, `LayoutComponent`, the foundation spec files,
and the `quarter_selector_on_list_views` spec files are all
**unmodified** (verified by `git status` before `mark-spec-ready`).

## Reuse confirmation

- `QuarterContextService.quarters()` is the single data source for both
  dialogs (R1/R4/R8/R9). No new service is introduced.
- `QuarterContextService.defaultQuarterId()` is the single default-source
  (R7/R11). The dialogs read it directly; no recomputation.
- `QuarterContextService`'s reactive year-switch reload (foundation R5)
  flows into both dialogs via the existing signal subscription — no
  extra `effect()` / subscription in either dialog (R3).
- `QuarterSelectorComponent` is **not** rendered in either dialog
  because the export UX uses pills (not a `mat-select`); see
  discarded alternative #1 in `design.md` for the explicit rejection
  and the per-dialog integration pattern for what is consumed instead.
  The foundation contract is not modified.

## Open questions for the human reviewer

1. **PDF title wording for a quarter named `'some mixed-case name'`.**
   R13 prescribes uppercasing + trimming the configured `Quarter.name`
   (so `Primer Trimestre` → `PRIMER TRIMESTRE`, `Q1` → `Q1`,
   `Q3 2026` → `Q3 2026`). The pre-existing PDF had always emitted
   `PRIMER/SEGUNDO/TERCER TRIMESTRE` (always uppercase, always Spanish).
   If the institution's configured quarter is named
   `'sin fechas (parcial)'` (literal Spanish lowercase), R13 would
   render `SIN FECHAS (PARCIAL)` in the title. That's defensible
   uppercasing, but worth confirming during human review if the user
   has an opinion on either: (a) keeping the `.toUpperCase()` for any
   configured name, or (b) rendering the configured name verbatim
   without uppercasing. The implementer can be told either way at
   implementation time; the spec is permissive (current R13 wording
   allows `.toUpperCase()` to be replaced with a direct return).

2. **Pill row empty-state copy.** R2 prescribes the wording
   `"No hay períodos con fechas configuradas para este año lectivo.
   Define los períodos en el módulo de administración o usa los
   selectores de fecha para establecer el rango manualmente."`.
   This is consistent with the foundation's
   `.quarter-selector-note` family but mentions the admin module
   by name. If the user prefers a shorter message (e.g. just
   `"No hay períodos con fechas. Define los períodos o usa los
   selectores de fecha."`), R2's wording can be amended before
   approval; both dialogs share the same copy.

3. **`partial-date` defensive layer handling.** R15 filters
   partial-date quarters out of the pill row entirely. The
   alternative "show them as disabled pills" was considered and
   discarded (see "Considered but not included" #1 below). Worth
   confirming during human review because the disabled-pills
   variant has a small UX advantage: the user can SEE the
   empty/quasi-configured quarters and is not surprised when they
   later get filled in. The filter variant is what the spec lands
   on for symmetry with the foundation's R11 ("partial-date
   quarters remain available for *manual* selection"; in the
   export context, there's no manual selection that would benefit
   from seeing partial-date quarters, so the filter variant
   applies).

## Considered but not included

1. **Render partial-date quarters as disabled pills in the pill row.**
   Considered for R15: an `@if (q.startDate && q.endDate) { …
   enabled pill } @else { … disabled pill with a "(fechas
   pendientes)" subtitle }` shape. Rejected because: (a) the
   disabled pill would never be clickable (no dates to apply), so
   it's purely visual; (b) the foundation's R11 explicitly says
   partial-date quarters are kept in `quarters()` for *manual*
   selection — but the export pill row is not a manual-selection
   surface (the pickers are), so showing a non-functional affordance
   gives the user nothing actionable; (c) it widens the visual
   layout for no behavioral gain. R15's "filter out" was simpler
   and the empty-state note (R2) tells the user the pickers are
   still available.

2. **Add a "Clear quarter scope" button alongside the pill row.**
   Rejected as YAGNI: today there is no parallel "clear" button
   because users who want a custom range just edit the pickers
   (R14 already clears the highlight on edit). Adding a button
   duplicates the affordance. If a follow-up needs it (e.g. for
   scanability), it's a small additive change.

3. **Render the pill row as a `mat-button-toggle-group` instead of
   bespoke `<button class="period-pill">` elements.** Rejected
   because the pre-existing pill styling is bespoke and Material's
   toggle group ships a different visual model (filled background,
   rounded, with Material elevation). Re-styling a toggle group to
   look like the existing pills would be more code than fixing the
   bug.

## Verification status

- `pnpm run build`: not run by the `spec_author` (implementation is
  out of scope). T7 of `tasks.md` runs it.
- `git status` against session start: only the 4 files listed in the
  file inventory above were created by the draft (verified before
  `mark-spec-ready`).
- R count: 18. T count: 10. Reverse-traceability covers every R.
- No hex colors introduced in any spec file (`grep` confirms).
