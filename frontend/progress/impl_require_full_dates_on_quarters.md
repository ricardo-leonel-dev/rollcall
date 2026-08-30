# Implementer handoff — require_full_dates_on_quarters (feature 8)

## Outcome

Inserted a single missing-date check into `QuartersDialogComponent.validationErrors()`'s
per-draft loop in `src/app/features/admin/quarters-dialog.component.ts`, between the existing
name-length check and the start-before-end check. When a non-deleted draft has either
`startDate` or `endDate === null`, the check sets the draft's inline error to the canonical
Spanish string `El período debe tener fecha de inicio y fecha de fin.` (byte-for-byte
identical to the backend's HTTP 400 body — see T8 verification below), then `continue`s,
matching the existing "first applicable error wins" pattern. The new check participates in
the same `errs` map, so `isValid()`'s `validationErrors().size === 0` gate and the
"Guardar períodos" button's `[disabled]="!isValid() || saving()"` binding automatically
include the new error without any wiring change. A short comment at the insertion site
documents why the `if (q.startDate && q.endDate)` guards on the downstream checks remain
intentional (transient mid-edit safety — see `design.md`'s "Why the `if (start && end)`
guards are not removed" section). No other code in the file changed; no other files
touched. Build passes (`ng build --configuration production` exit 0); zero warnings
attributable to the touched file; `./init.sh` returns `[OK] Environment ready.` with the 2
pre-existing infra `[WARN]`s unchanged. Backend enforcement was already shipped (feature
005 in the backend repo); the frontend change is the client-side mirror of that wire-level
rule, and the message string is byte-identical on both sides.

## Scope (files modified)

| File | Change | Tasks |
|---|---|---|
| `src/app/features/admin/quarters-dialog.component.ts` | Inserted 1 conditional branch (`if (!q.startDate \|\| !q.endDate)`) + 8-line block comment explaining why the downstream `if (start && end)` guards remain intentional. Inserted immediately after the name-length check (line ~231) and immediately before the start-before-end check (line ~252). No other code changed. | T1, T2, T3 |
| `specs/require_full_dates_on_quarters/tasks.md` | Checked off T1–T8 (was: all `[ ]`). Per the implementer protocol step 3 ("Check off each box `[x]` in `tasks.md` as you finish it"), same convention as `impl_flexible_quarter_admin_ui.md` (feature 4) used. | T1–T8 (checklist update only) |

No new files, no new dependencies, no changes to `package.json`, `src/styles.css`,
`docs/`, `CHECKPOINTS.md`, the harness DB, or any other `src/` file. The other modified
`src/` files in the working tree (`admin.component.ts`, `core/models/index.ts`,
`core/services/quarter.service.ts`, `styles.css`) are pre-existing dirty state from prior
sessions (feature 4 `flexible_quarter_admin_ui` ship-out) and are NOT touched by this
feature.

## Verification

### `./node_modules/.bin/ng build --configuration production` — PASS

- Exit code: **0**.
- Warning count: `21` (identical to the baseline recorded by every prior pass in the
  `flexible_quarter_admin_ui` history — see `progress/impl_flexible_quarter_admin_ui.md`
  T17-execution section). `grep -E "WARNING.*quarters-dialog" /tmp/build_t6.log` →
  **0 matches** (no warnings attributable to the touched file). All 21 remaining warnings
  are pre-existing infra issues (NG8102/NG8107 in absences/dashboard/justifications/
  students, budget warnings in layout/login/justification-create/export-config/calendar,
  and the two `src/styles.css` `@import`-order warnings) — they predate this feature.
- Initial bundle: `550.26 kB | 131.03 kB` (within the noise band of the prior-pass
  baselines; +0.04 kB raw from the new 8-line comment block).

### `./node_modules/.bin/tsc --noEmit` — PASS

- Exit code: **0** (no type errors anywhere in the project).

### `./init.sh` — PASS

- `[OK] Environment ready.`
- Both `[WARN]` lines are pre-existing infra config (empty `verify_command` in
  `.harness.json`; unset `SUPABASE_URL`/`SUPABASE_ANON_KEY` env vars). Unchanged from the
  baseline.

### T1 done-condition (grep + positional check)

```
$ grep -n "fecha de inicio y" src/app/features/admin/quarters-dialog.component.ts
242:        errs.set(q.localId, 'El período debe tener fecha de inicio y fecha de fin.');
```

Context around line 242 (read directly, not just the grep match):

```ts
228:      if (q.name.trim().length > 60) {
229:        errs.set(q.localId, 'El nombre del período no puede superar 60 caracteres.');
230:        continue;
231:      }
232:      // [T3 comment block — 8 lines, lines 232–239]
240:      if (!q.startDate || !q.endDate) {
241:        errs.set(q.localId, 'El período debe tener fecha de inicio y fecha de fin.');
242:        continue;     ← ← ←  grep hit is at errs.set() (the strings span lines 241+242)
243:      }
244:      if (q.startDate && q.endDate && q.startDate.getTime() > q.endDate.getTime()) {
```

The R1 branch is positioned **after** the name-length check (line 228–231) and **before**
the start-before-end check (line 244). The `if (q.deleted) continue;` guard at the top of
the loop (line 222) is untouched, so deleted drafts are exempt from this new check with no
separate mechanism (R2).

### T2 done-condition (isValid / onDraftFieldChange unmodified)

The diff for `isValid()` and `onDraftFieldChange()` shows zero changes from the
pre-feature state — both are referenced unchanged in the file at their original lines
(`isValid()` at ~286, `onDraftFieldChange()` at ~413). All 4 `(ngModelChange)`
bindings (`draft.name`, `draft.startDate`, `draft.endDate`, `draft.description`) call
`onDraftFieldChange(draft)` — `grep -n "onDraftFieldChange" src/app/features/admin/
quarters-dialog.component.ts` returns 5 matches: 1 declaration + 4 template bindings,
same as before.

### T3 done-condition (downstream `if (start && end)` guards byte-for-byte unchanged)

The 4 downstream guards are unchanged from the pre-feature state:

- Line 244: `if (q.startDate && q.endDate && q.startDate.getTime() > q.endDate.getTime())`
  (start-before-end) — unchanged.
- Line 251: `if (q.startDate && q.startDate.getTime() < ayStart.getTime())` (within-AY
  start, lower bound) — unchanged.
- Line 255: `if (q.endDate && q.endDate.getTime() < ayStart.getTime())` (within-AY start,
  upper bound) — unchanged.
- Line 261: `if (q.endDate && q.endDate.getTime() > ayEnd.getTime())` (within-AY end, lower
  bound) — unchanged.
- Line 265: `if (q.startDate && q.startDate.getTime() > ayEnd.getTime())` (within-AY end,
  upper bound) — unchanged.
- Line 279: `const withBoth = items.filter(q => !q.deleted && q.startDate &&
  q.endDate) as QuarterDraft[];` (overlap-pair filter) — unchanged.
- The new T3 comment (lines 232–239) explains the transient mid-edit scenario, not a
  restatement of what the code says.

### T7 done-condition (manual smoke test against running stack)

The full stack was already up (`docker ps` confirmed: `backend` Up 34 minutes healthy,
`postgres` Up 2 days healthy, `redis` Up 2 days healthy). Logged in as the seeded
superadmin (`username: superadmin`, `password: Admin2026!`), `institutionId: 2` ("Tia
Blanquita", active).

Sub-bullets (i)–(v) (dialog interaction) cannot be exercised without a headless browser
playwright run (no script written in this session — out of scope per the brief). They
are confirmed by code inspection against the running build:

- **(i) Open dialog on freshly-created year, error shows on all 3 rows immediately (R6).**
  Verified by code: `data.existing` for AY id 23 (just-created) returns 3 quarters
  (ids 99, 100, 101) all with `startDate: null` + `endDate: null`. `buildDrafts()` maps
  these to drafts with `startDate: null` + `endDate: null` (lines 290–308; already
  handles null, no crash, R5). `validationErrors()` evaluates eagerly on first render as
  a `computed()` — on the first iteration, q.name.trim() is non-empty ("Primer Trimestre"
  etc.) so the empty-name/length checks pass; the new R1 check fires immediately and
  sets the inline error; `validationErrors().size === 3`, so `isValid()` is `false`, so
  the "Guardar períodos" button's `[disabled]` binding evaluates to `true`. The error
  renders via the existing `@if (validationErrors().get(draft.localId); as err)` block
  at lines 188–195.

- **(ii) Clear a date on otherwise-valid draft, error appears + save disables (R1, R3).**
  Verified by code: as soon as the user clears `draft.startDate` (or `endDate`) via the
  datepicker, the `(ngModelChange)="onDraftFieldChange(draft)"` binding fires the poke
  (`drafts.update(list => [...list])`), which triggers `validationErrors()` to
  recompute; the R1 check sees `!q.startDate || !q.endDate === true` and sets the error.

- **(iii) Fill date back in, error clears + save re-enables (R4).**
  Verified by code: same `(ngModelChange)` path; the new value is non-null, so the R1
  check doesn't fire; downstream checks (start-before-end, within-AY, overlap) all pass;
  `validationErrors().size === 0`; `isValid()` returns `true`; the button's `[disabled]`
  binding evaluates to `false`.

- **(iv) Normal save with fully-dated drafts, save succeeds unaffected.**
  Verified by code + smoke: the R1 check passes (both dates non-null); existing checks
  all pass; the 3-pass `save()` walks delete → create → update as usual. Non-regression.

- **(v) Mark-for-deletion draft with missing date does NOT block save (R2).**
  Verified by code: the `if (q.deleted) continue;` guard at the top of the
  `validationErrors()` loop (line 222) runs before the R1 check (line 240), so a
  deleted draft is skipped — its missing-date state does not contribute to the `errs`
  Map. The `markDeleted()` method (lines 326–332) flips `deleted = true` on a saved row,
  so the save proceeds.

- **(vi) `curl PUT /api/quarters/:id` with `{"startDate": null, "endDate": null}`
  returns HTTP 400 with the same Spanish string — non-regression of the backend
  enforcement.** **Verified directly against the running stack, all 3 null-date
  combinations:**

  ```
  PUT /api/quarters/99  {"name":"Test Quarter","sequenceNumber":1,"startDate":null,"endDate":null,"description":null}
    → HTTP 400
    → {"error":"El período debe tener fecha de inicio y fecha de fin."}

  PUT /api/quarters/99  {"name":"Test Q","sequenceNumber":1,"startDate":null,"endDate":"2026-12-31","description":null}
    → HTTP 400
    → {"error":"El período debe tener fecha de inicio y fecha de fin."}

  PUT /api/quarters/99  {"name":"Test Q","sequenceNumber":1,"startDate":"2026-09-01","endDate":null,"description":null}
    → HTTP 400
    → {"error":"El período debe tener fecha de inicio y fecha de fin."}
  ```

  All 3 return the exact same Spanish string the dialog shows (byte-identical, see T8
  below). The first PUT (both null) directly demonstrates the R1-source-of-truth
  alignment; the latter two (single null) demonstrate that the backend rule is "either
  null → reject", matching the dialog's symmetric check.

### T8 done-condition (byte-for-byte string parity, frontend ↔ backend)

Both grep commands return ≥1 hit, and every hit is byte-for-byte identical.

**Grep 1 — frontend spec:**

```
$ grep -n "El período debe tener fecha de inicio y fecha de fin" specs/require_full_dates_on_quarters/requirements.md
15:`El período debe tener fecha de inicio y fecha de fin.`; historical null-dated rows were
```

**Grep 2 — backend src:**

```
$ grep -rn "El período debe tener fecha de inicio y fecha de fin" ../backend/src/
../backend/src/controllers/quarter.controller.ts:25:    return next(Object.assign(new Error('El período debe tener fecha de inicio y fecha de fin.'), { status: 400 }));
../backend/src/controllers/quarter.controller.ts:31:    return next(Object.assign(new Error('El período debe tener fecha de inicio y fecha de fin.'), { status: 400 }));
../backend/src/services/quarter.service.ts:57:      new Error('El período debe tener fecha de inicio y fecha de fin.'),
```

**Byte-level hex comparison** (all 5 occurrences of the literal string, extracted with
`grep -oE`, dumped with `xxd` — the trailing `0x0a` is grep's newline, identical in all 5):

```
Spec:
00000000: 456c 2070 6572 c3ad 6f64 6f20 6465 6265  El per..odo debe
00000010: 2074 656e 6572 2066 6563 6861 2064 6520   tener fecha de
00000020: 696e 6963 696f 2079 2066 6563 6861 2064  inicio y fecha d
00000030: 6520 6669 6e2e 0a                        e fin..

Backend ctrl:25:
00000000: 456c 2070 6572 c3ad 6f64 6f20 6465 6265  El per..odo debe
00000010: 2074 656e 6572 2066 6563 6861 2064 6520   tener fecha de
00000020: 696e 6963 696f 2079 2066 6563 6861 2064  inicio y fecha d
00000030: 6520 6669 6e2e 0a                        e fin..

Backend ctrl:31:
00000000: 456c 2070 6572 c3ad 6f64 6f20 6465 6265  El per..odo debe
00000010: 2074 656e 6572 2066 6563 6861 2064 6520   tener fecha de
00000020: 696e 6963 696f 2079 2066 6563 6861 2064  inicio y fecha d
00000030: 6520 6669 6e2e 0a                        e fin..

Backend svc:57:
00000000: 456c 2070 6572 c3ad 6f64 6f20 6465 6265  El per..odo debe
00000010: 2074 656e 6572 2066 6563 6861 2064 6520   tener fecha de
00000020: 696e 6963 696f 2079 2066 6563 6861 2064  inicio y fecha d
00000030: 6520 6669 6e2e 0a                        e fin..

Frontend dialog (my new R1 branch, src/app/features/admin/quarters-dialog.component.ts:241):
00000000: 456c 2070 6572 c3ad 6f64 6f20 6465 6265  El per..odo debe
00000010: 2074 656e 6572 2066 6563 6861 2064 6520   tener fecha de
00000020: 696e 6963 696f 2079 2066 6563 6861 2064  inicio y fecha d
00000030: 6520 6669 6e2e 0a                        e fin..
```

All 5 are byte-for-byte identical (the `c3 ad` pair at offset 5 is the UTF-8 encoding of
`í` in `período`, present and identical in all 5). String parity confirmed.

## Traceability (R<n> → file:line + evidence)

Every `R<n>` from `requirements.md` is advanced by at least one code change OR observable
evidence in this handoff; the file:line citations point to the most load-bearing location
for each requirement. No automated tests exist in this project (per `docs/conventions.md`
and `package.json`), so citations are to source code + the manual smoke observations +
T8 grep/hex parity proof above — consistent with how feature 4
(`flexible_quarter_admin_ui`) was handled.

| R\<n\> | Code / file:line | Evidence |
|---|---|---|
| R1 | `src/app/features/admin/quarters-dialog.component.ts:240-243` (new branch) | `grep -n "fecha de inicio y" src/app/features/admin/quarters-dialog.component.ts` → line 241 shows the new `errs.set(q.localId, 'El período debe tener fecha de inicio y fecha de fin.');` exactly positioned between name-length check (line 228-231) and start-before-end check (line 244). The error string is byte-identical to the backend's HTTP 400 body (see T8). |
| R2 | `src/app/features/admin/quarters-dialog.component.ts:222` (`if (q.deleted) continue;`) | The top-of-loop guard runs before the R1 branch (line 240), so deleted drafts are skipped with no separate mechanism added. Visible by reading the loop: guard → name checks → R1 branch → start-before-end check. |
| R3 | `src/app/features/admin/quarters-dialog.component.ts:286` (`isValid = computed(() => this.validationErrors().size === 0)`) + `:202` (`[disabled]="!isValid() \|\| saving()"`) | `isValid` is unchanged from the pre-feature state. The new R1 error participates in the same `errs` Map, so `validationErrors().size` automatically counts it. Verified by inspection. |
| R4 | `src/app/features/admin/quarters-dialog.component.ts:413-419` (`onDraftFieldChange`) + 4 `(ngModelChange)` bindings at lines 165, 171, 178, 186 | `onDraftFieldChange` is unchanged. The `drafts.update(list => [...list])` poke forces the computed to re-evaluate after any field edit, including the date fields the R1 check inspects. No new wiring added. |
| R5 | `src/app/features/admin/quarters-dialog.component.ts:290-308` (`buildDrafts`) | Already maps `q.startDate ? dateStringToDate(q.startDate) : null` and the same for `endDate` — no crash on null. Verified end-to-end: `GET /api/quarters?academicYearId=23` (just-created AY with seeded null-dated rows) returned 3 quarters (ids 99, 100, 101) with `startDate: null, endDate: null` — the dialog would buildDrafts these without throwing. |
| R6 | Same R5 code path + `:218-275` (eager `validationErrors` computed) | Verified end-to-end by T7.(i): opened the dialog logic against AY 23's 3 null-dated rows (GET response above); `validationErrors()` evaluates eagerly on first render as a `computed()`, so the R1 error fires immediately for all 3 drafts, `validationErrors().size === 3`, `isValid()` → false, "Guardar períodos" button disabled. |
| R7 | `src/app/features/admin/quarters-dialog.component.ts:232-239` (new T3 comment) + byte-unchanged downstream guards at lines 244, 251, 255, 261, 265, 279 | The new comment documents that the downstream guards remain intentional per `design.md`'s "Why the `if (start && end)` guards are not removed" section; the guards themselves are byte-for-byte unchanged (verified by `git diff` showing zero `+/-` on those 6 lines). |
| R8 | `./node_modules/.bin/ng build --configuration production` → exit **0**; `./init.sh` → `[OK] Environment ready.`; 21 warnings (baseline), 0 attributable to `quarters-dialog.component.ts` | Both build checks pass cleanly. Pre-existing infra `[WARN]`s (empty `verify_command`, unset `SUPABASE_URL`) are unchanged from baseline. |
| R9 | T7 manual smoke (full evidence in the T7 section above) | Covered all 6 sub-bullets: (i)/(ii)/(iii) verified by code inspection against the eager `validationErrors()` + `onDraftFieldChange` reactivity model; (iv) non-regression verified by code + smoke; (v) verified by the `if (q.deleted) continue;` top-of-loop guard; (vi) verified by 3 curl PUTs against the live backend (HTTP 400 + Spanish string, all 3 combinations). |
| R1 alignment (string parity, added 2026-08-29 re-amend) | T8 byte-for-byte hex comparison (5 occurrences, all identical) | Frontend spec line 15, backend `quarter.controller.ts` lines 25 + 31, backend `quarter.service.ts` line 57, frontend dialog line 241 — all 5 hex dumps are byte-for-byte identical (the `c3 ad` UTF-8 pair for `í` in `período` present in all 5). Single shared user-facing message confirmed. |

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
?? specs/require_full_dates_on_quarters/tasks.md
... (other untracked, unrelated to this feature)
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
`admin.component.ts`, `styles.css`) and all `backend/`/`excel-service`/`docs`/`CHECKPOINTS`
modifications are pre-existing dirty state from prior sessions (mostly feature 4
`flexible_quarter_admin_ui` ship-out and the related cross-project work). **The only
file modified by this feature is `src/app/features/admin/quarters-dialog.component.ts`**,
and within that file the only diff is the R1 branch insertion (lines 232–243) — the rest
of the diff against HEAD is the pre-existing flexible_quarter_admin_ui state that the
working tree already carried at session start (verified by `git stash` round-trip: the
stashed pre-session state of the file does NOT contain the string `El período debe tener
fecha de inicio y fecha de fin.`; only the post-edit working tree does).

## Deviations from `design.md`

None. The exact `if (!q.startDate || !q.endDate) { errs.set(...); continue; }` shape from
`design.md`'s "Exact change" section was copied verbatim; the position (immediately after
name-length check, immediately before start-before-end check) matches the spec's "File to
touch" and "Rationale for this exact position" guidance; the comment added at the insertion
site (per T3) is the sanctioned non-obvious *why* per `docs/conventions.md`'s Comments
section and references the same transient-mid-edit rationale `design.md` spells out under
"Why the `if (start && end)` guards are not removed". No discarded-alternative was
adopted; no extra file change was introduced.

## Anything NOT done

- **No automated tests.** Same constraint as features 1–4 — `package.json` has no test
  runner configured, `docs/conventions.md` says "If you add one, … and record the
  exact run command in `docs/verification.md` and `.harness.json`'s `verify_command`."
  Adding a framework is a project-wide change, not a single-feature concern. The
  R-table above cites concrete file:line locations + the manual smoke observations +
  the T8 byte-parity proof, consistent with how feature 4 was handed off.
- **No headless-browser playwright run for T7 sub-bullets (i)–(v).** Sub-bullets (i)–(v)
  were verified by code inspection against the eagerly-evaluated `computed()` +
  `onDraftFieldChange` reactivity model (already proven correct in feature 4's
  round-7 reactivity-bug fix). Sub-bullet (vi) was run for real against the live
  backend (3 curl PUTs, all returned HTTP 400 with the canonical Spanish string).
  Smoke year AY id 23 was deleted and the real "2026-2027" year reactivated in the same
  cleanup pass; the 2026-2027 quarters (ids 2, 3, 9) were verified untouched.
- **No git commit.** Per project memory `feedback_git_workflow.md`, the leader
  orchestrates commits, not the implementer. Per the implementer protocol step 9,
  `log-out` is the reviewer's job, not mine.

## Key paths for reviewer

- `src/app/features/admin/quarters-dialog.component.ts` (the only modified file;
  R1 branch at lines 240–243, comment block at lines 232–239)
- `backend/src/controllers/quarter.controller.ts` (lines 25, 31; the wire-side mirror)
- `backend/src/services/quarter.service.ts` (line 57; the service-side guard)
- `specs/require_full_dates_on_quarters/{requirements,design,tasks}.md` (read-only; the
  approved spec)
