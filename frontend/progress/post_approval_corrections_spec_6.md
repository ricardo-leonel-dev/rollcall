# Post-approval corrections — Spec 6 (`quarter_selector_on_list_views`)

**Date:** 2026-08-30
**Actor:** leader (Ricardo Aguilar authorized directly, AGENTS.md §7)
**Trigger:** `attendance_backend` feature `backend_acepta_date_from_date_to_en_get_api_justifications` shipped; the spec had been approved by Ricardo Aguilar before the backend landed, so 4 places in the spec still described the backend as "may not support" / "verify during T10" / "if unsupported, extend backend spec" — all stale.

## Changes (4 surgical edits)

| File | Lines | Before | After |
|---|---|---|---|
| `design.md` | 17 (Files-to-touch table) | "verify `/api/justifications` accepts the params during T10" | "backend support is in `attendance_backend` feature `backend_acepta_date_from_date_to_en_get_api_justifications` (shipped 2026-08-30, see R10)" |
| `design.md` | 239–243 (paragraph after the per-loader code block) | "For `loadHistorial()` specifically, the implementer SHALL verify during T10... If it does not, R10's documented options apply..." | Full description of the shipped backend's filter mechanism (`EXISTS (...)`), gated injection (round-1/round-2 fix rationale), and T10 smoke-check pointer |
| `tasks.md` | 148–167 (T8 first sub-bullet) | "First, verify the backend ... if it does not, document the gap per R10's documented options" | Two-line trivial smoke: full set without params, smaller set with narrow range; explicit "no gap to document — backend support is shipped" |
| `requirements.md` | 272–278 (R10 contingency paragraph) | "the implementer SHALL verify during T10 ... if it does not, the implementer SHALL either (a) extend the backend spec to add support before this feature ships, or (b) document in `progress/...` why the filter is omitted..." | Same filter-mechanism description as design.md, including the round-1/round-2 gating rationale and the 400 error contract |

## What did NOT change

- The R-numbering (15 R's), T-numbering (10 T's), and reverse-traceability table — unchanged.
- The cross-references block at the top of `requirements.md` (the user-amendment note about partial dates, the `attendance_backend` validation feature, etc.) — unchanged.
- The "Reuse, don't reimplement" constraint on `QuarterSelectorComponent` / `QuarterContextService` — unchanged.
- The implementation-path notes flagged by spec_author (same-quarter guard read path, `dateToDateString(null)` edge case) — unchanged.
- Approval status: still `approved` by Ricardo Aguilar. These edits are post-approval corrections, not a new draft — no `re-approve-spec` called.

## Audit trail

- Pre-edit grep: all 4 patterns returned ≥ 1 match each.
- Post-edit grep: 0/0/0/0 matches.
- New references: 4 occurrences of `backend_acepta_date_from_date_to_en_get_api_justifications` across the 3 files.

## Side note for the next session

When `check-blockers` unblocks feature 6 (after `attendance_backend` log-out pushes Notion `Status=Done` for the backend card, and the next frontend session reads the BLOCKED_ON note pointing to it), the implementer will see the corrected spec — T8 is now a trivial smoke check, not a discovery exercise. Time-to-implementation for feature 6 should be noticeably shorter than it would have been with the contingency language.
