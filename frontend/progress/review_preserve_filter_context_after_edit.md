# Review — feature 17 `preserve_filter_context_after_edit`

**Verdict:** CHANGES_REQUESTED

## Checkpoints

- C1: [x]
- C2: [x]
- C3: [x]
- C4: [x]
- C5: [x]
- C6: N/A (feature is sdd=0)

## Build

`./node_modules/.bin/ng build --configuration production` — exit 0, no errors.
`./init.sh` — exit 0, environment ready (verify_command intentionally unset; expected `[WARN]` per `docs/verification.md`).
Pre-existing warnings only (login/layout/calendar/justifications styles budgets + `styles.css` `@import` order). None introduced by this change.

## Plan compliance summary

All structural plan items verified:

- `AbsenceSaveResultDialogData.returnTo` field present (`absence-save-result-dialog.component.ts:29`); `editConflict()` passes it in the edit-route `queryParams` (line 194).
- `AbsenceEditComponent.returnTo` field (`absence-edit.component.ts:142`), `sanitizeSameOrigin` helper (lines 148-155), `ngOnInit` reads + sanitizes `returnTo` (lines 161-162), three navigation points (`save` L193, `confirmDelete` L216, `cancel` L226), template back-link binds `[routerLink]="returnTo"` (line 71). Accepted deviation (public, not `private readonly`) documented.
- `Params` imported (`absences.component.ts:3`); `serializeFiltersToQueryParams()` (lines 822-839) omits defaults; all 3 conflict-dialog call sites (L1078, L1161, L1337) do `await router.navigate + capture returnTo + pass in data`; `ngOnInit` (lines 767-820) gates `applyDefaultQuarter()` on `hasUrlDates`, restores all 9 params + `studentFilter` after `onFiltersChange`, no more legacy `queryParams: {}` strip (confirmed via grep).

## Required Changes

### 1. `manualSearch` is wiped on round-trip — restore-after-onFiltersChange missing

**File:** `src/app/features/absences/absences.component.ts`

**Where:**
- `absences.component.ts:798` sets `this.manualSearch = params.get('manualSearch') ?? '';`
- `absences.component.ts:802` then calls `await this.onFiltersChange();`
- `absences.component.ts:843` (inside `onFiltersChange`) clears it back: `this.manualSearch = '';`

**Why this is a bug:** `onFiltersChange()` clears both `studentFilter` AND `manualSearch`. The plan correctly orders the `studentFilter` rehydration AFTER the await, but the `manualSearch` restore is placed BEFORE the await — so the round-trip wipes it. The plan's own `serializeFiltersToQueryParams()` (line 830) writes `manualSearch` into the URL, meaning the round-trip is half-implemented: serialized, but the value gets erased on the way back in.

**Contradicts plan's own smoke step 9** (lines 202-203 of the approved plan):

> 9. En el editor, click "Cancelar" → vuelve a `/inspectors/absences` con tab=Manual (no Listado), `manualSearch` y `course` preservados.

`manualSearch` preservation is an explicit acceptance criterion. The current implementation does not meet it.

**Fix (trivial, mirrors the `studentFilter` pattern already in place):**

In `ngOnInit()` at `absences.component.ts:782-816`, move the `manualSearch` read line from line 798 to AFTER `await this.onFiltersChange();` (i.e. alongside the `studentFilter` rehydration block at lines 804-816). Same shape, same ordering rationale already documented in the plan's "Decisiones de diseño documentadas" (line 150):

> `studentFilter` después de `onFiltersChange`: `onFiltersChange` limpia `studentFilter` (línea 793). Restaurar `studentFilter` después de llamarlo.

The same reasoning applies to `manualSearch`.

## Notes (non-blocking)

- `sanitizeSameOrigin` edge-case handling is sound: empty string is filtered by the `if (returnToParam)` guard at L162; malformed URLs hit the `try/catch` fallback; same-origin check via `parsed.origin === window.location.origin` correctly rejects cross-origin and accepts same-origin paths with hashes/queries. No need for IDN-specific handling since `URL` normalizes.
- `await router.navigate([], { replaceUrl: true })` before reading `this.router.url` correctly avoids the race-condition concern.
- No new packages, no new services — matches plan.
- Style consistent with surrounding code: `inject()`, signals, OnPush, inline template/styles, minimal comments.
- Build is clean; no new warnings introduced.

## Relevant paths

- Approved plan: `/home/rileo/.claude/plans/shiny-chasing-starlight.md`
- Implementer report: `/home/rileo/ai-personal/frontend/progress/impl_preserve_filter_context_after_edit.md`
- Bug site: `/home/rileo/ai-personal/frontend/src/app/features/absences/absences.component.ts` (lines 798, 802, 843)

## Re-review (2026-09-01) — APPROVED

The previously requested change was applied correctly.

Verified:
- `absences.component.ts` `ngOnInit()`: `manualSearch` is no longer assigned before
  `await this.onFiltersChange()` (line 801). It is now assigned at line 803, immediately
  after the await, alongside the `studentFilter` rehydration block — matching the pattern
  `studentFilter` already used.
- `grep -n manualSearch` confirms the only other writer is line 843 (`this.manualSearch = ''`
  inside `onFiltersChange()`, which was the cause of the original wipe), plus the template
  bindings and `serializeFiltersToQueryParams()` (line 830). No other write paths.
- No other behavior touched: the diff shows the single line moved; the rest of the feature
  diff (returnTo plumbing, serializeFiltersToQueryParams, the 3 navigate-before-dialog calls)
  is unchanged from the previous review.
- `./node_modules/.bin/ng build --configuration production` → **exit 0**. Only pre-existing
  bundle/CSS budget warnings (initial bundle 551.74 kB, several component CSS budgets),
  none introduced by this change.

Verdict recorded: `record-review approved --by "reviewer"` (session 27), overwriting the
previous CHANGES_REQUESTED.
