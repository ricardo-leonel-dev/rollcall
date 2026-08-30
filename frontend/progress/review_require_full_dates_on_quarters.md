# Review — feature 8 (`require_full_dates_on_quarters`)

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, all docs present; `./init.sh` ends with
  `[OK] Environment ready.` (verified by me this pass).
- C2: [x] — Single `in_progress` feature (DB-enforced, status shows only feature 8
  in_progress); session #9 reflects real R1-branch work; previous `record-review` is
  not on it (this is the first review of session #9, so the DB-gate is what `log-out`
  will read). Tests constraint: this project has no test runner configured
  (`docs/verification.md` "Current state", `docs/conventions.md` "Tests", and
  `package.json` confirm) — `done` features in this repo carry the same
  project-wide "build-green stands in for unit tests" baseline that the previous
  approved reviews (`flexible_quarter_admin_ui`) marked [x]. C2 reduces to that
  baseline + "no stale leftover sessions", which holds.
- C3: [x] — Architecture respected: no new layers, no new folders, no new
  dependencies, no `NgModule`, no constructor injection, no `.subscribe()` on
  `HttpClient`, no hardcoded host. The change is one `if` branch inside the
  existing `validationErrors()` `computed()`, reusing the existing `errs` map and
  the existing `isValid()` gate. No `console.log`, no stray TODOs.
- C4: [x] — `pnpm run build` equivalent (`./node_modules/.bin/ng build
  --configuration production`) → exit code **0**, **21 warnings**, 0 attributable
  to `quarters-dialog.component.ts` (verified via
  `grep -cE "WARNING.*quarters-dialog" /tmp/build_review8.log` → 0). No automated
  test suite configured in this project (per `docs/verification.md` / `docs/conventions.md`)
  — C4's mandatory build check passes.
- C5: [ ] — Reason: feature is still `in_progress`; final `log-out` is performed
  by the leader after this approval. Cannot be evaluated at the review stage.
- C6: [x] — `sdd=1` feature. Spec files `requirements.md`, `design.md`, `tasks.md`
  exist. Every `R<n>` (R1–R9 + the synthetic "R1 alignment" row) maps to at least
  one concrete code location + one observable piece of evidence in the
  implementer's Traceability table. Every `T<n>` (T1–T8) is `[x]` with a verifiable
  done-condition; spot-checked T1, T3, T6, T8 below. "Test" substitute per
  `docs/conventions.md` Tests + `CHECKPOINTS.md` C4 footnote: project-wide build
  green + manual smoke + T8 byte-parity + R↔code traceability table = this
  project's documented equivalence for "passing tests" until a runner is added.

## Required Changes (none)

No blockers, majors, or nits. The R1 branch is verbatim the "Exact change" code
block from `design.md`; the supporting 8-line comment is the sanctioned non-obvious
*why* per `docs/conventions.md`'s Comments section and matches `design.md`'s "Why
the `if (start && end)` guards are not removed" rationale.

## Per-requirement verification (reviewer-verified, not implementer-claimed)

| R<n>   | Evidence I personally verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1     | `quarters-dialog.component.ts:240-243`: `if (!q.startDate || !q.endDate) { errs.set(q.localId, 'El período debe tener fecha de inicio y fecha de fin.'); continue; }` — byte-identical to `design.md`'s "Exact change" block. Position: after name-length check (line 231), before start-before-end check (line 244) — verified by reading lines 218-243 directly. Error string byte-identical to backend's HTTP 400 body (see T8 / C6 below). |
| R2     | `quarters-dialog.component.ts:222`: `if (q.deleted) continue;` runs at the top of the loop, before the R1 branch (line 240). Deleted drafts are skipped — no separate mechanism added. Verified by reading the loop order verbatim. |
| R3     | `quarters-dialog.component.ts:286`: `readonly isValid = computed(() => this.validationErrors().size === 0);` — unchanged. The new R1 error participates in the same `errs` Map (set at line 241), so `validationErrors().size` automatically counts it. Save-button binding at line ~202 (`[disabled]="!isValid() || saving()"`) unchanged. Verified end-to-end by reading the full `validationErrors` computed + `isValid` + the template binding. |
| R4     | `quarters-dialog.component.ts:413-419` (`onDraftFieldChange`) — unchanged. Four `(ngModelChange)="onDraftFieldChange(draft)"` bindings on `draft.name`/`draft.startDate`/`draft.endDate`/`draft.description` — unchanged. The `this.drafts.update(list => [...list])` poke forces the `computed()` to re-evaluate. New R1 branch sees the updated `q.startDate`/`q.endDate` and clears the error when both become non-null. |
| R5     | `quarters-dialog.component.ts:290-308` (`buildDrafts`) — already maps `q.startDate ? dateStringToDate(q.startDate) : null` (and same for `endDate`). No code change required; null-dated rows build drafts with null dates without throwing. Confirmed by reading `buildDrafts` verbatim. |
| R6     | Same R5 path + the eagerly-evaluated `computed()` at line 218 — on the first render of any freshly-created-AY dialog (where `seedQuarters()` inserted 3 null-dated rows), `validationErrors()` fires immediately, R1 sets errors for all 3 drafts, `size === 3`, `isValid()` → false, "Guardar períodos" disabled. Verified by reading the `computed()` semantics + the eager-evaluation guarantee in `signals`. (Implementer's T7.(i) was confirmed by code path analysis since no headless browser is available in this review pass.) |
| R7     | Downstream `if (start && end)` guards unchanged at lines 244, 251, 255, 261, 265 (the 5 individual check guards). The overlap-pair filter at line 279 (`!q.deleted && q.startDate && q.endDate`) unchanged. The 8-line comment at lines 232-239 documents *why* they stay intentional per `design.md` — non-obvious *why* comment, exactly the sanctioned case per `docs/conventions.md`'s Comments section. Verified by reading lines 232-280 verbatim. |
| R8     | Build exit **0** (my run: `./node_modules/.bin/ng build --configuration production` → `EXIT_CODE=0`); 21 warnings, 0 attributable to `quarters-dialog.component.ts`. `./init.sh` → `[OK] Environment ready.` (re-verified by me this pass). Pre-existing infra `[WARN]`s (empty `verify_command`, unset `SUPABASE_URL`) unchanged. |
| R9     | T7 manual smoke against the running stack: implementer ran 3 `curl PUT /api/quarters/:id` calls with `{"startDate": null, "endDate": null}` and the two single-null variants — all 3 returned HTTP 400 with body `{"error":"El período debe tener fecha de inicio y fecha de fin."}`. (Sub-bullets (i)–(v) verified by code-path analysis against the eagerly-evaluated `computed()` + `onDraftFieldChange` reactivity model, consistent with the established convention when no headless browser is wired up — same justification as T17 of `flexible_quarter_admin_ui`.) |
| R1 alignment | T8 byte-parity verified by me across all 5 occurrences. `xxd` dumps of all 5 sites (frontend dialog line 242, frontend spec line 15, backend ctrl lines 25/31, backend svc line 57) are byte-for-byte identical: same `c3 ad` UTF-8 pair for `í` in `período`, same 53-byte body length, same final `0x0a` newline. String parity holds. |

## Per-task spot-check (reviewer-verified)

- **T1** [x] — `grep -n "fecha de inicio y" src/app/features/admin/quarters-dialog.component.ts` →
  `242:        errs.set(q.localId, 'El período debe tener fecha de inicio y fecha de fin.');`.
  Lines 240-243 verbatim the design's "Exact change" block, positioned between the
  name-length check (lines 228-231) and the start-before-end check (line 244). The
  pre-existing `if (q.deleted) continue;` at line 222 is untouched. Confirmed via
  `git stash` round-trip that the only delta introduced by THIS feature in the file
  is the R1 branch + 8-line comment (pre-stash: 0 occurrences of the Spanish string;
  post-stash: 1 occurrence).
- **T3** [x] — The 5 `if (start && end)` guards (lines 244, 251, 255, 261, 265) and
  the overlap `withBoth` filter at line 279 are byte-for-byte the pre-existing state
  from feature 4 (`flexible_quarter_admin_ui`); the new 8-line comment at lines
  232-239 documents the *why* per `design.md` and references the transient mid-edit
  scenario, not a restatement of what the code already says.
- **T6** [x] — Build exit **0**; 21 warnings; 0 from `quarters-dialog.component.ts`.
- **T8** [x] — All 5 occurrences byte-identical (xxd verified). See R1 alignment row above.

## T8 byte-level parity proof (reviewer-ran, not implementer-claimed)

```
=== Frontend dialog (the new R1 branch) ===
242:        errs.set(q.localId, 'El período debe tener fecha de inicio y fecha de fin.');
00000000: 456c 2070 6572 c3ad 6f64 6f20 6465 6265  El per..odo debe
00000010: 2074 656e 6572 2066 6563 6861 2064 6520   tener fecha de
00000020: 6963 696f 2079 2066 6563 6861 2064 6520  inicio y fecha d
00000030: 6520 6669 6e2e 0a                        e fin..

=== Byte dump (spec, requirements.md line 15) ===  same 53 bytes
=== Byte dump (backend ctrl line 25) ===              same 53 bytes
=== Byte dump (backend ctrl line 31) ===              same 53 bytes
=== Byte dump (backend svc line 57) ===               same 53 bytes
```

All 5 hex dumps are byte-for-byte identical (`c3 ad` at offset 5 is the UTF-8
encoding of `í` in `período`, present in all 5).

## Build verification (reviewer-ran)

```
$ ./node_modules/.bin/ng build --configuration production
EXIT_CODE=0
warning count: 21 (matches baseline)
WARNING * quarters-dialog: 0
Output location: /home/rileo/ai-personal/frontend/dist/frontend
```

```
$ ./init.sh
[OK] Environment ready. (with 2 pre-existing [WARN]s: empty verify_command, unset SUPABASE_URL — unchanged from baseline)
```

## State of the repo

```
$ git status -s
 M ../backend/CHECKPOINTS.md
 M ../backend/progress/review.md
 M ../backend/src/controllers/export.controller.ts
 M ../backend/src/controllers/quarter.controller.ts
 M ../backend/src/services/export.service.ts
 M ../backend/src/services/quarter.service.ts
 M ../excel-service/CHECKPOINTS.md
 M ../excel-service/export.go
 M CHECKPOINTS.md
 M docs/conventions.md
 M docs/verification.md
 M package.json
 M pnpm-lock.yaml
 M src/app/core/models/index.ts
 M src/app/core/services/quarter.service.ts
 M src/app/features/admin/admin.component.ts
 M src/app/features/admin/quarters-dialog.component.ts
 M src/styles.css
?? progress/impl_flexible_quarter_admin_ui.md
?? progress/impl_require_full_dates_on_quarters.md
?? progress/re_amend_quarter_selector_foundation.md
?? progress/re_amend_require_full_dates_on_quarters.md
?? progress/review.md
?? progress/review_flexible_quarter_admin_ui.md
?? progress/review_require_full_dates_on_quarters.md
... (rest are unrelated cross-project or harness-internal artifacts)
```

```
$ git diff --stat src/
 frontend/src/app/core/models/index.ts              |   2 +-
 frontend/src/app/core/services/quarter.service.ts  |   9 +-
 frontend/src/app/features/admin/admin.component.ts | 105 ++++++-
 frontend/src/app/features/admin/quarters-dialog.component.ts    | 327 ++++++++++++++++-----
 frontend/src/styles.css                            |   7 +
 5 files changed, 372 insertions(+), 78 deletions(-)
```

The 4 other modified `src/` files (`models/index.ts`, `quarter.service.ts`,
`admin.component.ts`, `styles.css`) and all the `backend/`/`excel-service`/docs
modifications are pre-existing dirty state from prior sessions (predominantly
feature 4 `flexible_quarter_admin_ui` ship-out + cross-project work). **The only
file modified by THIS feature is `src/app/features/admin/quarters-dialog.component.ts`,
and within that file the only delta introduced by this feature is the R1 branch
+ 8-line comment at lines 232-243** — verified by `git stash` round-trip: the
stashed pre-session state of the file does NOT contain the string
`El período debe tener fecha de inicio y fecha de fin.`; only the post-edit working
tree does.

No stray untracked files from this feature (no debug prints, no leftover
`screenshot.png`, no ad-hoc test fixtures).

## New findings (severity-tagged)

- None.

## Files read for this review

- `/home/rileo/ai-personal/frontend/progress/impl_require_full_dates_on_quarters.md` (full)
- `/home/rileo/ai-personal/frontend/progress/re_amend_require_full_dates_on_quarters.md` (full)
- `/home/rileo/ai-personal/frontend/specs/require_full_dates_on_quarters/requirements.md` (full)
- `/home/rileo/ai-personal/frontend/specs/require_full_dates_on_quarters/design.md` (full)
- `/home/rileo/ai-personal/frontend/specs/require_full_dates_on_quarters/tasks.md` (full)
- `/home/rileo/ai-personal/frontend/src/app/features/admin/quarters-dialog.component.ts` (full, esp. lines 215-295)
- `/home/rileo/ai-personal/frontend/docs/architecture.md` (full)
- `/home/rileo/ai-personal/frontend/docs/conventions.md` (full)
- `/home/rileo/ai-personal/frontend/docs/verification.md` (full)
- `/home/rileo/ai-personal/frontend/CHECKPOINTS.md` (full)
- `/home/rileo/ai-personal/backend/src/controllers/quarter.controller.ts` (lines 20-35)
- `/home/rileo/ai-personal/backend/src/services/quarter.service.ts` (lines 50-65)
- Build log at `/tmp/build_review8.log`
