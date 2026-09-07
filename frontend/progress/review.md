# Review — feature 25 `citation_overlap_conflict_ui`

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, docs, `CHECKPOINTS.md` all present. `./init.sh` exits 1 due to
  unrelated pre-existing spec-directory failures for two OTHER features (`citations_admin_reasons`,
  `notification_templates_settings_ui` — both marked `done`/`sdd=1` long before this feature) which are
  NOT introduced by this change. `pnpm run build` (Level 1 verification, the actual C1-relevant check per
  `docs/verification.md`) exits 0. C1-relevant doc/infra presence for this feature is complete.
- C2: [ ] ← pre-existing project-wide gap: no automated test suite exists (no `tests/` dir, no `*.spec.ts`,
  no test builder in `angular.json` — `docs/conventions.md` §Tests, `docs/verification.md` §Current state).
  This applies to every prior `done` feature in this project as well; not a regression caused by feature 25.
- C3: [x] — only one file changed (`src/app/features/citations/citation-dialog.component.ts`, +54/-4).
  No new imports beyond reusing an existing util (`formatCitationDateLabelShort` from `citation-date.util.ts`,
  added to the existing import line — no new dependency). No `console.log`/TODOs/`debugger`/`print` in the diff.
  No `Router` import, no `NgModule` (component was already `standalone: true` + `OnPush` + inline template/styles).
  Uses `inject()`, `firstValueFrom`, signals, error path reports through `NotificationService` — all match
  `docs/architecture.md` conventions.
- C4: [ ] ← pre-existing project-wide gap: no automated test framework. Verified directly: `find src/ tests/ -name "*.spec.ts"`
  returns no files; `tests/` directory does not exist; no tests reference `citation-dialog.component.ts`.
  Per `docs/conventions.md` §Tests and `docs/verification.md` §Current state, verification stands on
  `pnpm run build` (Level 1) + manual smoke (Level 3) until a test framework is added. Build verified by
  reviewer (exit 0).
- C5: [N/A] — closure-time checkpoint, evaluated at `log-out`, not at this approval.
- C6: [ ] (partial pass) —
  - Spec files `specs/citation_overlap_conflict_ui/{requirements,design,tasks}.md` exist (confirmed on disk).
  - Requirements use strict EARS with stable `R<n>` ids (13 reqs).
  - All 11 tasks in `tasks.md` are `[x]`; verified each T<n> matches a real diff against `origin/staging`:
    - T1 → `CitationConflictInfo` interface added at :27-35.
    - T2 → `conflict` signal :276 + `lastConflictError` field :277.
    - T3 → `this.conflict.set(null)` at :378.
    - T4 → single shared catch block at :405-412, same path regardless of `isEdit`.
    - T5 → else branch at :411 keeps existing `notify.error`.
    - T6 → `dialogRef.close(true)` only at :404 (success path); catch does not touch listed fields.
    - T7 → `@if (conflict(); as c)` block at :154-166 with title, date/time line, conditional fields.
    - T8 → `.conflict-banner*` CSS at :69-75.
    - T9 → `(ngModelChange)` at :170, :178 + method at :418-420.
    - T10 → no `Router`/`dialog.open` introduced (grep confirms 0).
    - T11 → build exits 0 (re-run by reviewer).
  - **Every `R<n>` is satisfied by the code**: verified directly by reading requirement and code together,
    not taken from the implementer's claim:
    - R1: catch at :405-412 distinguishes `409 + err.error.conflict` from all other errors.
    - R2: `dialogRef.close(true)` only on success at :404; no field reset in either branch of :405-412.
    - R3: `@if (conflict(); as c)` block at :154 (inside `<mat-dialog-content>`); title at :158 = `lastConflictError`;
      no separate `MatDialog`, no `NotificationService` toast in the conflict branch.
    - R4: `formatCitationDateLabelShort(c.date, c.time)` at :160; util re-exported as readonly at :282; the util
      exists at `shared/utils/citation-date.util.ts:26` with the exact `(date, time)` signature.
    - R5: each optional field has its own `@if (c.X)` at :161-164.
    - R6: no `?? '—'`/`Sin datos`/placeholder fallbacks anywhere; only :160 (date/time) renders unconditionally.
    - R7: `else` branch at :411 keeps `notify.error(err?.error?.error ?? 'No se pudo guardar la citación')`.
    - R8: `if (conflict)` branch sets signal + `lastConflictError` and returns; `else` is unreachable from it.
    - R9: single shared catch at :405, no `isEdit`-specific branching inside catch.
    - R10: `this.conflict.set(null)` at :378 before any request work.
    - R11: `onScheduleFieldChanged()` at :418-420, wired to date :170 and time :178 via `(ngModelChange)`.
    - R12: no `Router` import, only existing `dialog.open(...)` calls remain (at :349 remove attachment and :424
      close citation — neither reachable from the conflict path).
    - R13: build exits 0 (re-verified by reviewer). End-to-end manual smoke against `docker compose up`
      NOT performed by implementer — they cited the absence of a live backend/Postgres/Redis in the worktree
      as the operational reason. This is a pre-existing project-wide manual-smoke dependency, not a defect
      in the code change itself; recommend reviewer-or-follow-up smoke against a live stack before this
      feature is closed in production.
  - Last bullet ("Every `R<n>` maps to at least one concrete, currently-passing test"): cannot be `[x]` —
    no test suite exists project-wide.

## Required Changes (if applicable)

None — feature code is correct, complete, and matches spec. The unchecked boxes (C2, C4, partial C6 last bullet)
reflect a pre-existing, project-wide missing test framework that applies to every prior `done` feature in this
repository and is documented as the current state in `docs/conventions.md` §Tests and `docs/verification.md`
§Current state — not a defect introduced by this feature.

## Recommendation to leader

Approve with notes. After `record-review approved`, the implementer should log out and (separately, not blocking
log-out) consider running the R13 manual smoke against `docker compose up -d --build frontend` using a
rector/admin and a teacher login before shipping to production, since the implementer could not exercise that
in the worktree session.