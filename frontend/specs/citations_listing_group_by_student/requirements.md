# Requirements — Cap citations-per-student pills, reveal the rest on hover/tap

Scope: **frontend-only** (`attendance_frontend`). File affected: `src/app/features/citations/citations.component.ts`
(template, styles, and component class only — no route, model, or backend contract changes). No other file in
`src/app` needs to change for this feature.

## Context (read before reviewing)

`CitationsComponent`'s "Citaciones el:" column (built in feature #20 `citations_listing_page`, later touched by
#24/#25/#27/#28) currently renders **every** one of a roster row's quarter-scoped citations
(`scopedCitations(row)`) as a wrapping `.pill` badge, with no cap. Per the feature card (`state/features/026-
citations_listing_group_by_student.md`), this breaks the page's visual rhythm once a student accumulates several
citations in one quarter. This feature caps the default rendering to the single most recent scoped citation and
adds a "+N" control that reveals the rest on hover (or an equivalent tap/click affordance, since hover doesn't
exist on touch devices). No hover-to-reveal pattern exists anywhere else in this codebase — the design in
`design.md` describes exactly how it is built, reusing Angular Material's `MatMenu`/`MatMenuTrigger` (already
imported in this component for the existing "more actions" row menu) instead of inventing a bespoke overlay.

This feature does **not** change: the quarter-scoping logic itself (`scopedCitations`, `onQuarterChange`,
`applyDefaultQuarter`), the target-citation resolution used by the WhatsApp/delete actions
(`resolveTargetCitation`), or the "Ver historial completo" dialog (`openHistory`/`CitationHistoryDialogComponent`),
which continues to show the row's full, unscoped citation history exactly as before.

## Default rendering: most-recent-only

## R1
WHILE a roster row has one or more scoped citations (`scopedCitations(row).length >= 1`), the system SHALL render,
by default, exactly one pill in that row's "Citaciones el:" cell: the most recent scoped citation, per the
ordering rule in R12.

## R2
WHERE a roster row's scoped citations count is greater than 1, the system SHALL render, alongside the pill from
R1, a "+N" indicator control, where N equals `scopedCitations(row).length - 1`.

## R3
WHERE a roster row's scoped citations count is exactly 1, the system SHALL NOT render the "+N" indicator control
described in R2.

## R4
WHILE a roster row's scoped citations list is empty, the system SHALL continue to render the em dash `—`
placeholder in that row's "Citaciones el:" cell exactly as before this feature, and SHALL NOT render the "+N"
indicator control.

## Reveal affordance ("+N")

## R5
WHEN the pointer enters the "+N" indicator control of a row whose scoped citations count is greater than 1, the
system SHALL open a menu panel listing that row's remaining scoped citations (every scoped citation except the one
rendered by R1), each rendered as its own pill using the same pending/closed styling as the visible pill (R19 of
`citations_listing_page`'s existing `pillStyle`).

## R6
WHEN the pointer leaves both the "+N" indicator control and its opened menu panel (R5), without re-entering
either, the system SHALL close that menu panel.

## R7
WHEN the "+N" indicator control is clicked, the system SHALL open (or, if already open, close) the same menu panel
described in R5 — this is the touch/keyboard-accessible equivalent of the hover affordance in R5, since pointer-
hover events do not fire on touch devices.

## R8
IF the "+N" indicator control is clicked or hovered THEN the system SHALL NOT invoke the citation-detail handler
(`onPillClick`, R10/R11) for that interaction — clicking/hovering "+N" only opens or closes the menu panel, it is
never treated as clicking a citation.

## R9
The system SHALL order the citations rendered inside the menu panel (R5) using the same most-recent-first
ordering rule as R1/R12, excluding only the single citation already visible per R1.

## Clicking a citation still opens its detail

## R10
WHEN the visible pill rendered by R1 is clicked, the system SHALL invoke the existing citation-detail handler
(`onPillClick`) for that citation — unchanged from this component's current per-pill click behavior.

## R11
WHEN any citation rendered inside the menu panel (R5/R9) is clicked, the system SHALL invoke the same
citation-detail handler (`onPillClick`) for that citation, opening the same detail view R10 would open for it.

## Ordering rule

## R12
The system SHALL determine "most recent" for R1 and R9 by comparing each scoped citation's `date` (`YYYY-MM-DD`)
concatenated with its `time` (`HH:MM`, 24-hour) as a string, in descending lexicographic order — independent of
whatever order `GET /api/citations` happens to return that row's `citations` array in.

## Unaffected behavior

## R13
The system SHALL NOT change "Ver historial completo": it SHALL continue to list every citation in a row's full,
quarter-unscoped `citations` array, exactly as before this feature.

## R14
The system SHALL NOT change the target-citation resolution logic (`resolveTargetCitation`) used by the WhatsApp
and delete actions — that resolution remains based on pending-status priority (first `status === 'pending'`, else
`citations[0]`) and is independent of which citation R1 selects as "most recent" for display.

## Build & verification

## R15
The system SHALL compile with zero new TypeScript/template errors introduced by this feature (`pnpm run build`
exits `0`).

## R16
Per `docs/verification.md`, this project has no automated test suite — verification SHALL be manual against the
running stack (`docker compose up -d --build frontend`), covering: a student row with exactly one scoped citation
renders that single pill with no "+N" control; a student row with two or more scoped citations renders only the
most recent pill plus a "+N" control showing the correct count; hovering the "+N" control reveals the remaining
citations in most-recent-first order and moving the pointer away closes it again; clicking the "+N" control on a
touch-simulated view (or via click instead of hover) toggles the same panel open/closed; clicking the visible pill
and clicking a revealed citation both open the same citation-detail view that clicking a pill opened before this
feature; a student row with no scoped citations still renders `—` with no "+N" control; "Ver historial completo"
still lists every citation for the student regardless of the active quarter scope; and the WhatsApp/delete actions
still target the same citation they targeted before this feature.
