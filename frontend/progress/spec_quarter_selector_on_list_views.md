# Spec author handoff — quarter_selector_on_list_views (feature 6)

## Outcome

Drafted the 3-file spec for adding the foundation's `<app-quarter-selector />` to the
Absences and Justifications list views, with no modifications to the foundation's
`QuarterContextService` or `QuarterSelectorComponent`. The spec is tight to the title:
exactly two screens get the selector, exactly the same way (same component tag, same
`onQuarterChange` handler shape, same R12 no-op-on-partial-date defensive layer). The
existing per-screen filters (course on both; Listado's date-range / type / student on
Absences) stay independent and combine with the quarter scope via a documented
precedence rule (quarter scope wins when set, manual Listado range otherwise).

The 15 R<n> requirements break down as: A — Absences wiring (R1–R4); B — Justifications
wiring (R5–R8); C — shared scope plumbing (R9–R11); D — partial-date no-op (R12); E —
default + visual continuity (R13); F — build + verification (R14–R15). The 10 T<n> tasks
follow the explore → per-screen template → per-screen handler → per-screen loader →
build → smoke structure, with T5 / T9 acting as the per-screen early sanity smokes that
gate T10's full R15 manual smoke.

## Open questions for the reviewer / human approver

1. **R10's "manual Listado date range as fallback when quarter scope is null" — is that
   the intended UX?** My read of the existing Absences "Listado" panel is that the
   "Desde"/"Hasta" pickers are a "query any custom date range" affordance used by power
   users (e.g. "show me the week before Primer Trimestre"), so the precedence rule
   (quarter scope wins when set, manual range otherwise) preserves both. If the human
   reviewer wants the quarter scope to *always* override the manual range — including
   when the quarter scope is null and the manual range is set, which is the current
   "always" behavior — the spec is correct as written. If they want the inverse
   (manual range always wins), R10 + T4 need a flip. Flagging because the title's
   "mandatory" wording could be read either way; my interpretation is "mandatory that
   the dropdown is present and visible" (R1/R5) — not "mandatory that it overrides
   everything else always".

2. **Should `loadPendingStudents()` (Justifications) carry the quarter scope, or only
   `loadHistorial()`?** R10 says both, on the grounds that "pending students in this
   course for Primer Trimestre" is a meaningful query. If the human reviewer wants
   pending students to keep showing *all* pending absences for the course regardless
   of quarter (the existing behavior), R10 + T8 should narrow to `loadHistorial()`
   only. I picked "both" because the dropdown is page-level and the title says
   "mandatory" — leaving one tab unscoped would feel like a half-measure — but this
   is a judgment call worth flagging.

3. **T10's R15 sub-bullet (iv) — `seedQuarters()` partial-date case.** The "Tia
   Blanquita" test institution's quarters all have full dates (verified by the
   foundation's impl note: "no current Tia Blanquita quarter has a missing date").
   Exercising R12 against real data requires either creating a fresh AY mid-smoke
   (admin-only mutation the smoke-script contract defers to the human reviewer per
   `docs/verification.md` Level 3) or relying on the same code-review-based justification
   the foundation used. T10 explicitly documents this as an acceptable fallback; the
   reviewer should confirm they accept it for this feature too.

## Discarded alternatives considered but not included in the spec

- **Make the Absences selector visible only on the "Listado" panel** (one of my first
  instincts). Rejected per discarded alternative #1 in `design.md` — the title says
  "mandatory", which scopes the whole page (Foto / Manual / Voz / Listado / Historial),
  not one sub-panel. The page-level placement matches the user's mental model.
- **Add a "Limpiar período" button to `QuarterSelectorComponent`.** Rejected per
  discarded alternative #2 — the foundation's contract is frozen (zero inputs), the
  realistic need is "switch to a different quarter" (which the dropdown's option list
  already covers), and `clearFilters()` on Absences is intentionally local to the
  Listado sub-filters (R11).
- **Use a `signal()` + `effect()` reactive read instead of the `(quarterChange)` output
  bridge.** Rejected per discarded alternative #3 — `QuarterContextService` already
  owns the reactive year-switch contract (foundation R5/R18), and the output-driven
  bridge fires exactly once per real user interaction (vs. every signal tick). The
  fields `selQuarterStart`/`selQuarterEnd` are deliberately plain (not signals) for the
  same reason: they are only consumed inside imperative `loadXxx()` methods.
- **Replace the existing Absences "Listado" date pickers with the quarter dropdown.**
  Rejected per discarded alternative #4 — the date pickers support a legitimate
  non-quarter-aligned query workflow ("week before Primer Trimestre"), so removing
  them would break that path. R10's precedence rule keeps both usable.
- **Auto-apply the default quarter's range on first render.** Rejected per discarded
  alternative #5 — same trap the foundation's discarded alternative #1 avoids for
  the Dashboard. R3 / R7 explicitly preserve the existing first-render behavior.
- **Add the selector to Students / Enrollments / Calendar / other views.** Rejected per
  discarded alternative #6 — explicit out-of-scope per the leader's instructions on this
  draft; each view has its own scope semantics and bundling them would multiply design
  decisions without changing the reusable contract.

## State of the repo (this session)

```
$ git status -s specs/ progress/ scope (no src/ touches)

?? specs/quarter_selector_on_list_views/
?? progress/spec_quarter_selector_on_list_views.md
```

No files outside `specs/quarter_selector_on_list_views/` and `progress/` were edited.
No commits were made (the leader commits per the role definition).