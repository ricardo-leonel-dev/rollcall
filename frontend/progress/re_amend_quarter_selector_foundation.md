# Re-amend of `quarter_selector_foundation` spec — post-backend-validation

> Spec was `spec_ready` (not yet approved). This pass updates the **rationale and assumptions**
> for the defensive handling of partial-date quarters in `R8`–`R11` / `R15` / `R16` / `R19` / `R23`,
> following the `done` + approved backend feature
> `backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados`. No
> requirements, algorithms, file changes, or task counts were altered — only the rationale and one
> closed-out follow-up note.

## Context (why this amendment exists)

The backend now:

1. **Rejects partial-date `POST /api/quarters` and `PUT /api/quarters/:id` bodies** at both the
   controller (`backend/src/controllers/quarter.controller.ts`) and a new private
   `assertValidDates(range)` helper inside the service (`backend/src/services/quarter.service.ts`,
   called from `create` and `update`). HTTP `400`, message exactly:
   `"El período debe tener fecha de inicio y fecha de fin."`.
2. **Soft-deleted every legacy null-dated row** via migration
   `postgres/19_quarters_softdelete_legacy_null_dates.sql` (`deleted_at = NOW()`,
   `is_active = false`; idempotent — second run is a no-op). Verified live:
   `SELECT count(*) FROM quarters WHERE deleted_at IS NULL AND (start_date IS NULL OR end_date IS NULL)`
   returns `0`.

Follow-up the backend report flagged (kept as-is, not a blocker):
`seedQuarters()` in `backend/src/services/quarter.service.ts`, called from
`academic-year.service.ts#create` on every newly created academic year, **still inserts 3 rows
per fresh AY with `startDate: null, endDate: null`** — explicitly identifiable by
`isActive && sequenceNumber in {1, 2, 3} && !startDate && !endDate`. Those rows can be repaired
via a single `PUT` carrying both dates (live-verified by the user), so no one is locked out.

## Changes made

### `specs/quarter_selector_foundation/requirements.md`

- **§ "Note (user amendment, 2026-08-29)" (lines 42–54) — body kept verbatim, last sentence
  re-pointed.** The original user amendment still stands; the trailing sentence that asserted
  "the backend itself has no server-side requirement for both dates being set (tracked separately
  as a proposed backend card, not yet created)" was rewritten to point at the new "Update"
  subsection instead, so the historical decision stays visible while no longer contradicting
  the new reality. *Why:* the original reasoning paragraph is the approved-by-the-user record
  and shouldn't be deleted; only the now-false factual claim needed correcting.
- **§ "Update (post-backend-validation, 2026-08-29)" (new, after the user-amendment block,
  ~lines 56–86)** — bullets covering: (a) the new controller-layer guard and `assertValidDates`
  helper in the service with the exact HTTP 400 + Spanish message; (b) the migration's
  soft-delete behavior and how the existing server-side filter plus the selector's input
  filter exclude legacy null-dated rows "for free"; (c) the residual real-world source
  (`seedQuarters()` output, the 3 just-seeded rows per new AY) with the exact identifiable
  signature; (d) explicit "defensive layer is **not removable**" statement so the next reader
  doesn't conclude the layer can be deleted; (e) the narrowed-reasoning recap: from
  "backend permits + legacy exists" to "`seedQuarters()` output for new AYs while the user is
  mid-edit." *Why:* R23 is added to the protected list (`R8`–`R11`/`R15`/`R16`/`R19`/`R23`) —
  the original user-amendment note only listed `R8`–`R11`/`R15`/`R16`/`R19`, but the Dashboard-side
  no-op (`onQuarterChange` returning early on missing dates) is equally part of the defensive
  layer and was missing from the rationale.

### `specs/quarter_selector_foundation/design.md`

- **Discarded alternative #3, "Update (user amendment, 2026-08-29)" addendum (was lines 358–364) —
  original preserved + "Update (post-backend-validation, 2026-08-29)" appended (~lines 366–394).**
  Mirrors the `requirements.md` update but in the design's voice (forward-looking): rejects the
  reading that this amendment authorizes removing the defensive layer; restates the three
  pieces of new evidence (controller guard, `assertValidDates`, soft-delete migration); pins the
  residual case to `seedQuarters()` with the same identifiable signature; closes with the
  same "do not interpret as authorization to remove" sentence. *Why:* the design's discarded-
  alternatives section is where the implementer and reviewer will look when they ask "do we
  still need this defensive layer?" — putting the narrowed rationale here in addition to
  `requirements.md` doubles the chance the next reader internalizes it.
- **Discarded alternative #5, "Update (user amendment, 2026-08-29)" addendum (was lines 381–388) —
  closed out and re-headed "Update (revisited, 2026-08-29)".** Replaces the
  "should be revisited in a follow-up amendment … or a small `quarter_selector_foundation`-v2
  feature" sentence with a concrete statement that the referenced backend feature
  (`get_api_quarters_accepts_optional_academic_year_id_filter`) has shipped, the follow-up is
  folded into this same spec, and points at the Revision note at the top of `design.md` plus
  the `QuarterService.getAll(academicYearId?: number)` change in the "Files to touch" table as
  evidence. *Why:* that follow-up sentence was now stale ("should be revisited" → it has been
  revisited, in this same amendment). Leaving it would mislead future readers into expecting
  a separate v2 spec that no longer needs to exist.

### `specs/quarter_selector_foundation/tasks.md`

- **T4 (lines 48–50): one-line note appended** pointing the implementer at the
  `requirements.md` update so they don't misread fixture (v) as testing a frequent production
  case. Wording: "Note (rationale update, 2026-08-29): partial-date quarters in production are
  now narrow — backend rejects them with HTTP 400 and the migration soft-deleted legacy
  null-dated rows. Fixture (v) covers the residual case (only `seedQuarters()` output for
  freshly created AYs). The exclusion filter is **not** removable." *Why:* fixture (v) is
  the only place in `tasks.md` that explicitly exercises the partial-date exclusion, so this
  is the single chokepoint where the implementer could otherwise infer "this happens often in
  production" and try to simplify the algorithm. No task counts or steps changed; only a
  guidance note added. `T8` / `T9` / `T15` were considered and left untouched because they
  describe behavior (R18 year-guard, R19 fallback note, gap-fallback smoke test) that is
  unaffected by the validation change — they do not claim or imply anything about how often
  partial-date quarters occur.

## Considered but deliberately NOT changed

- **The algorithm itself in `computeDefaultQuarter` and R6–R11.** No requirement or code
  trace changes; the partial-date exclusion filter still correctly handles the
  `seedQuarters()`-output residual case, and the rejection of "open-ended" partial dates
  (R11) remains the right call for any row with only one date set.
- **R8–R11 / R15 / R16 / R19 / R23 requirements themselves.** The user amendment the spec was
  built on (`require_full_dates_on_quarters`, frontend) is still unimplemented per the
  backend report, and the defensive layer is explicitly required by the user ("not
  removable") even after backend validation landed. Per the brief: "approved-by-the-user
  decisions … stay as-is."
- **The `Cross-references` block (lines 21–40 in `requirements.md`).** Every fact in it is
  still true (`Quarter.name` is still a free-form `string`; `startDate`/`endDate` are still
  independently nullable at the TS type level because the backend has no contract promising
  non-null in `GET /api/quarters` responses; soft-deleted quarters still don't appear in the
  response). Adding the new validation to this block would muddle two unrelated cross-
  references and add no value over the dedicated "Update" subsection.
- **`T1`–`T3`, `T5`–`T15` except the new T4 note.** None of them claim anything about how
  often partial-date quarters occur; they describe loading, sorting, dropdown rendering,
  guard states, dashboard wiring, or the smoke test. The smoke test (T15) covers a gap
  case (today between two fully-dated quarters), not a partial-date case, so no guidance
  about partial-date frequency is needed there.
- **The Revision note at the top of `requirements.md` / `design.md` ("the backend feature
  `get_api_quarters_accepts_optional_academic_year_id_filter` has shipped …")** — kept as-is.
  That's a separate revision event (year-scoped lookup) from the validation event (date
  validation); folding them together would lose the audit trail.
- **A new spec for `quarter_selector_foundation`-v2** (suggested by the old discard alt #5
  addendum). Folding the year-scoped follow-up into this same spec was the right call — the
  Revision note + file table + `getAll(academicYearId?: number)` snippet already reflect it,
  and creating a v2 spec for already-implemented changes would be paperwork, not substance.

## Files touched

- `/home/rileo/ai-personal/frontend/specs/quarter_selector_foundation/requirements.md`
- `/home/rileo/ai-personal/frontend/specs/quarter_selector_foundation/design.md`
- `/home/rileo/ai-personal/frontend/specs/quarter_selector_foundation/tasks.md`
- This file: `/home/rileo/ai-personal/frontend/progress/re_amend_quarter_selector_foundation.md`

## Commands run / not run

- NOT run: `scripts/harness.sh claim-spec`, `scripts/harness.sh mark-spec-ready`,
  `scripts/harness.sh approve-spec`, `scripts/harness.sh claim`, `scripts/harness.sh set-plan`,
  `scripts/harness.sh append-log`. None of these were touched: the feature is already
  `spec_ready`; this pass only edits spec content. Approval and downstream claim/impl/review
  are for the leader after the human reviews this re-amendment.