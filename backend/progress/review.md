# Review — feature 16 citation_reasons_read_access_follows_citation_permission

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, all four docs (`docs/architecture.md`,
  `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md`) present and populated.
  `./init.sh` exits 0 (only the baseline `[WARN] No verify_command configured` and the
  best-effort `[WARN] $SUPABASE_URL/$SUPABASE_ANON_KEY not set` — both pre-existing and
  documented as expected).
- C2: [x] — exactly one `in_progress` feature (#16); the open session #27 reflects the
  current implementer work (matches `progress/impl_016-*.md`). Per the established
  pattern set by features #10 and #13 (cited explicitly in `progress/review.md` for
  feature #13), "passing tests" for `sdd=1` features in this repo is satisfied by
  `pnpm run build` + manual smoke test with verbatim request/response capture — applied
  consistently here. No automated test framework is wired up for the changed code path
  (the partial infrastructure in `tests/notification-templates.test.ts` requires a live
  Postgres + Redis and is not registered in `package.json`'s scripts — `docs/conventions.md`
  still states "no `*.spec.ts`/`*.test.ts` files and no test script in `package.json`",
  and `.harness.json`'s `verify_command` is empty by design).
- C3: [x] — diff is purely additive: one new exported function `requireAnyPermission` in
  `src/middleware/role.middleware.ts` (lines 43–75) plus one new `Check` type alias
  (line 7) and one new `In` import (line 2). The existing `requirePermission` function
  and its 12+ call sites across `src/controllers/*` are byte-for-byte untouched
  (confirmed by `grep -n "requirePermission(" src/controllers/` — all 12 controllers
  continue to use `requirePermission(R, ...)` or `requirePermission('resource', action)`
  unchanged). The route wiring change is one line in
  `src/controllers/citation-reason.controller.ts:11`. No new top-level `src/` folder,
  no new dependency added (TypeORM `In` operator is already in the dependency tree per
  `package.json`), no controller logic moved into a service or vice-versa, no
  `console.log`/`print`/TODO added. `docs/architecture.md` controller-vs-service and
  middleware-abstraction rules honored.
- C4: [x] (per the project's no-test-framework convention, same justification as the
  reviewer for #13) — `pnpm run build` exits 0 with no TypeScript diagnostics.
  Static diff against `specs/citation_reasons_read_access_follows_citation_permission/design.md`'s
  "`requireAnyPermission` shape" section (lines 29–65 of design.md) is byte-for-byte
  identical for `requireAnyPermission`'s body (compare lines 43–75 of the new
  `src/middleware/role.middleware.ts` against lines 32–64 of design.md — same 401 guard
  with the same body, same superadmin bypass, same `[...new Set(checks.map(c => c.resource))]`
  deduplication, same `repo.find({ where: { roleId, resource: In(resources) } })` query,
  same `byResource` `Map`, same `checks.some(...)` ternary chain over `canRead`/`canCreate`/
  `canUpdate`/`canDelete`, same 403 body `'Sin permisos para este recurso'`). Static diff
  against design.md's "Route wiring" section is byte-for-byte identical for
  `citation-reason.controller.ts:11` (same three checks in the same order).
  Live HTTP smoke tests covering R7, R8, R9, R10, R11, R12, R13, R14, R16 are captured
  verbatim in `progress/impl_016-citation_reasons_read_access_follows_citation_permission.md`
  T4–T9 sections with before/after `role_permissions` SELECTs and the exact request/response
  bodies for each scenario (including the 403 body verbatim match on T7 and T8's three
  write-operation 403s). The reviewer did not independently re-execute the live API
  smoke tests in this session — the worktree's `docker-compose.yml` is byte-identical
  to the user's main running stack (same container names, same host ports), so an
  isolated `docker compose up -d` from this worktree would collide with the running
  stack, and the auto-mode classifier denies any attempt to overwrite files under the
  user's main `/home/rileo/ai-personal/backend/` mount. The same limitation was
  acknowledged and accepted by the reviewer for feature #13.
- C5: [x] — session #27 is still open at review time; this checkpoint fires at `log-out`,
  not at approval. No stray untracked files in `backend/` that aren't session-harness
  artifacts (`.claude`, `.codex`, `scripts`, `state/`, `progress/impl_016-*.md`,
  `specs/citation_reasons_read_access_follows_citation_permission/*` — all expected).
  `git status` against `origin/feature/15-citation-guardian-conflict-validation` shows
  only the two expected commits ahead of `7f85c32` (`3694803` WIP + `49083c4` feat).
- C6: [x] (sdd=1) — `specs/citation_reasons_read_access_follows_citation_permission/
  {requirements.md,design.md,tasks.md}` all present on disk and git-tracked (staged in
  commit `49083c4` per the implementer's handoff). `requirements.md` uses strict EARS
  syntax (`The system SHALL provide...` for R1, `WHEN ... SHALL respond ... and SHALL NOT
  query ...` for R2/R3/R4/R14, `IF ... THEN ... SHALL respond ... and SHALL NOT call ...`
  for R5/R10) with stable R1–R16 ids. All 10 tasks in `tasks.md` are `[x]` (verified by
  `grep -c "^- \[x\]" = 10`, `grep -c "^- \[ \]" = 0`). Every `R<n>` → test traceability
  claim in `progress/impl_016-*.md` was spot-verified by reading the matching code:
  - **R1** — `src/middleware/role.middleware.ts:7` (`type Check = ...`) + line 43
    (`export function requireAnyPermission(checks: Check[])`) + line 2 (`import { In }
    from 'typeorm'`). ✓
  - **R2** — lines 45–48 (`if (!req.user) { res.status(401).json({ error: 'No
    autenticado' }); return; }`). ✓ (And exercised by every smoke test — the JWT
    decoding path is shared with `requirePermission`.)
  - **R3** — line 50 (`if (req.user.roleName === 'superadmin') { next(); return; }`).
    Verified end-to-end by T9. ✓
  - **R4** — lines 52–66 (deduplicated `repo.find(... In(resources))` + `checks.some(...)`
    over `canRead`/`canCreate`/`canUpdate`/`canDelete`). Verified end-to-end by T4
    (citaciones:read match), T5 (citaciones:can_create match), T6 (citation-reasons:read
    match). ✓
  - **R5** — lines 68–71 (`res.status(403).json({ error: 'Sin permisos para este
    recurso' })`). Body verbatim match on T7. ✓
  - **R6** — `src/controllers/citation-reason.controller.ts:11` uses
    `requireAnyPermission([{ resource: 'citaciones', action: 'read' }, { resource:
    'citaciones', action: 'create' }, { resource: R, action: 'read' }])` — matches
    design.md "Route wiring" byte-for-byte. ✓
  - **R7, R8, R9, R10, R14** — covered by T4, T5, T6, T7, T9 smoke tests with captured
    request/response. ✓
  - **R11, R12, R13** — `citation-reason.controller.ts:12–14` still call
    `requirePermission(R, 'create'|'update'|'delete')` unchanged; smoke-verified by T8's
    three 403 responses for the same role. ✓
  - **R15** — `pnpm run build` exits 0 with no new TS errors attributable to either
    edited file (no output from `tsc`). ✓

## Verification performed (the reviewer's own, not the implementer's prose)

### Static diff — middleware body vs design.md

The `requireAnyPermission` body at `src/middleware/role.middleware.ts:43–75` was
compared character-by-character against `specs/citation_reasons_read_access_follows_
citation_permission/design.md` lines 32–64. Every line corresponds:

- Line 43: `export function requireAnyPermission(checks: Check[]) {` ↔ design line 32.
- Lines 44–48: 401 unauthenticated guard ↔ design lines 33–37.
- Line 50: `if (req.user.roleName === 'superadmin') { next(); return; }` ↔ design line 39.
- Line 52: `const resources = [...new Set(checks.map(c => c.resource))];` ↔ design line 41.
- Lines 53–56: `repo.find({ where: { roleId: req.user.roleId, resource: In(resources) } })`
  ↔ design lines 42–45.
- Line 57: `const byResource = new Map(perms.map(p => [p.resource, p]));` ↔ design line 46.
- Lines 59–66: `checks.some(({ resource, action }) => { ... })` with the same
  ternary chain (`action === 'read' ? perm.canRead : ... perm.canDelete`) ↔ design
  lines 48–55.
- Lines 68–71: 403 `'Sin permisos para este recurso'` ↔ design lines 57–60.
- Line 73: `next();` ↔ design line 62.

Identical. No re-interpretation, no drift, no surprise.

### Static diff — route wiring vs design.md

`src/controllers/citation-reason.controller.ts:11`:

```ts
router.get('/', requireAnyPermission([
  { resource: 'citaciones', action: 'read' },
  { resource: 'citaciones', action: 'create' },
  { resource: R, action: 'read' },
]), async (req, res) => res.json(await svc.findAll(req.institutionId!, req.courseIds ?? null)));
```

matches design.md lines 87–91 byte-for-byte (the action order is identical:
`citaciones:read, citaciones:create, citation-reasons:read`).

`POST`/`PUT`/`DELETE` lines (12–14) are unchanged from the pre-feature version
(`requirePermission(R, 'create'|'update'|'delete')`), confirming R11/R12/R13 by code
inspection alone (further confirmed by T8's three captured 403s with body `{"error":"Sin
permisos para este recurso"}`).

### Build verification

```
$ cd backend && pnpm run build
$ tsc
EXIT=0
```

No TS diagnostics. `dist/middleware/role.middleware.js` and
`dist/controllers/citation-reason.controller.js` regenerate cleanly.

### `requirePermission` call-site audit

`grep -rn "requirePermission(" src/controllers/ src/middleware/` (excluding the
`import { requirePermission } from '../middleware/role.middleware'` lines and the
`requireAnyPermission` line) returns 50+ call sites across 12 controllers — every one
of them still passing the same `(resource, action)` pair shape. Only
`citation-reason.controller.ts:11` was reworked to use the new OR-permission
middleware; the rest of the codebase is untouched.

### Init verification

```
$ cd backend && bash init.sh
── 1. Checking prerequisites ──
[OK] sqlite3 available
[OK] jq available
── 2. Checking harness state ──
[OK] .harness.json found
[OK] harness.db found
[OK] Found docs/architecture.md
[OK] Found docs/conventions.md
[OK] Found docs/verification.md
[OK] Found CHECKPOINTS.md
── 3. Checking SDD spec files ──
[OK] all sdd=1 features have their spec files on disk
── 4. Running verification command ──
[WARN] No verify_command configured in .harness.json — skipping
── 5. Regenerating markdown snapshot ──
[OK] snapshot regenerated at state
── 6. Syncing Postgres/Supabase mirror (best-effort) ──
[WARN] $SUPABASE_URL / $SUPABASE_ANON_KEY not set — skipping mirror sync
── 7. Summary ──
[OK] Environment ready. You can start working.
```

Both `[WARN]`s are pre-existing baseline ones (empty `verify_command`, unset
`SUPABASE_URL`) — explicitly called out as expected in `docs/verification.md`'s
"Current state" section and in `progress/impl_016-*.md` T10.

## Notes (informational, not blocking)

1. **Test-user password collateral (carried through from the implementer's T4–T8 smoke
   tests).** To exercise the OR-permission scenarios against the live stack, the
   implementer temporarily set known passwords on two pre-existing test users —
   `pbastidas` (id=2, role 3, `inspector de apoyo`) and `test_multer_reg` (id=82, role
   4, `teacher`). The backup-temp-table snapshot was created *after* the test hash had
   already been written (a BEGIN/COMMIT ordering mistake), so the original bcrypt
   hashes were overwritten and lost. Both users are left with `TestPass2026!` as their
   current password. `role_permissions` for role 3 was correctly reverted (final state
   verified by diff against `/tmp/role3_perms_before.txt`, whitespace-only). This is a
   workflow issue with manual smoke tests against a shared DB, not a code defect — the
   implementer flagged it transparently. If the next dev session needs the original
   passwords, both users can be reset via `POST /api/users/:id/password` or
   re-created.

2. **WIP commit `3694803` preserved.** Per the implementer's note, this commit contains
   the T1+T2+T3 work from an interrupted earlier run and is byte-identical to what a
   fresh re-derivation produces (verified by the implementer: re-writing both files from
   design.md produced no diff against HEAD after the trailing-newline fix-up). Keeping
   it as the single source-of-truth implementation commit avoided adding redundant
   empty-diff commits on top. Acceptable per the user's explicit directive.

3. **No live HTTP smoke was independently re-executed by the reviewer** — same
   worktree-vs-running-stack collision acknowledged by the reviewer for feature #13
   (the worktree's `docker-compose.yml` is byte-identical to the user's main running
   stack, so `docker compose up -d` from this worktree cannot bring up an isolated
   stack; the auto-mode classifier denies overwriting the running backend's mounted
   source or `docker restart backend` to pick up the worktree's compiled `dist/`).
   The static diff and the implementer's captured verbatim request/response provide
   sufficient evidence at the level this repo's established verification model
   (features #7, #9, #10, #13, #14, #15) accepts.

4. **`docs/conventions.md` and `docs/verification.md` are now slightly stale** — they
   still claim "no `*.spec.ts`/`*.test.ts` files" / "no automated test suite", but
   `tests/notification-templates.test.ts` exists (added with feature #8). It uses
   `node:test` and depends on a live Postgres + Redis run, so it doesn't constitute a
   working test framework that this feature could have plugged into without
   significant new infrastructure work. Worth updating both docs and wiring
   `.harness.json`'s `verify_command` to `tests/run.sh` once the test infra is
   stable enough to be the default verification path. Not blocking for this feature.

## Required Changes

None. The code, the build, the static diff against the spec, the `requirePermission`
call-site audit, the init.sh run, the spec traceability, and the documented live
smoke-test evidence all line up.
