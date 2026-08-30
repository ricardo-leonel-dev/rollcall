# Verification — How to prove a feature works

> Golden rule: the agent doesn't say "it works," it proves it. Every feature
> ends with executable evidence, not just claims.

## Current state (read this first)

This project has **no automated test suite** yet (no `*.spec.ts`, no test
builder in `angular.json`, no Karma/Jasmine/Jest/Playwright dependency).
`.harness.json`'s `verify_command` is intentionally left **empty** until a
real test framework is added — `init.sh` will skip verification with a
`[WARN]`, not a failure. Until then, "verified" means Level 1 (build) +
Level 3 (manual smoke test) below, not an automated pass. Don't claim a
feature is fully verified on build success alone — say explicitly that it
was build-checked and manually smoke-tested, not unit-tested.

## Verification Levels

### Level 1 — Build check (mandatory, stands in for unit tests today)

```bash
pnpm run build
```

This runs `ng build --configuration production` with `strict: true` and
`strictTemplates: true` — it catches type errors, template binding errors,
and unused-import issues across the whole app. It does **not** verify
runtime behavior. Run it after every change before calling a feature done.

If a real unit test suite is added later, set `.harness.json`'s
`verify_command` to that command (e.g. `pnpm test`) and update this section
— it then becomes the mandatory Level 1 check instead of `pnpm run build`.

### Level 2 — Integration check (against the real backend)

**Before assuming Level 2/3 aren't possible, run `docker ps`.** The dev stack
is frequently already up on this same host (the same shell an implementer or
reviewer subagent runs in — not a sandboxed environment without docker) —
look for `frontend` (port 80), `backend` (port 3000), `excel-service`,
`postgres`, and `redis` containers. Don't defer a Level 2/3 task with "no
docker compose in this sandbox" without checking first; that was a real
outcome once (feature `flexible_quarter_admin_ui`'s T17, deferred across 5
review rounds on that assumption before someone actually ran `docker ps`).
If a fresh stack is genuinely needed, `docker compose up --build` from the
repo root (`ai-personal/`) brings it up so `/api/...` calls actually resolve
through nginx to the backend:

```bash
docker compose up --build
```

If the stack is already running, skip straight to exercising it. Playwright
is already a devDependency (`scripts/visual-smoke.mjs` uses it for the
mocked Level 4 check below) — for a Level 3 functional smoke, write a
one-off script in the same style that drives a real headless Chromium
against the **real** running stack (no `page.route()` mocking) instead of
doing the smoke by hand. If existing data would be mutated by the test
(e.g. a real academic year a user is actively reviewing), scope the test to
a disposable record created and torn down within the same run — never
mutate real data without the user's explicit go-ahead.

Then hit `http://localhost` and exercise the feature's actual HTTP calls
(Network tab or backend logs) against a real (or seeded) database — not a
mock. For a change confined to one route/component, at minimum confirm the
request/response shape matches the `core/models/index.ts` interfaces it
depends on.

### Level 3 — Manual Smoke Test (recommended before closing a session)

1. `docker compose up --build` (or point `ng serve` at a already-running
   backend if one is up).
2. Log in at `/login` with a real test account.
3. Navigate to the module the change touched (e.g. `/inspectors/absences`,
   `/students/manage`) and confirm: the guard (`moduleGuard`) allows access
   for a role that has the permission and redirects to `/home` for one that
   doesn't; the page loads data from the backend without a console error;
   any mutation (create/edit/delete) shows a `NotificationService` toast and
   is reflected without a manual page reload.

## Level 4 — Visual smoke (recommended for UI features)

For any change that touches rendered HTML (layout, spacing, colors,
typography, hover/focus states), run the automated visual smoke before
declaring the feature done. The smoke builds the production bundle, serves
it locally, opens a headless Chromium against the relevant page, mocks the
backend with fixture data via route interception, captures a screenshot +
DOM/computed-style report, and exits — the implementer and reviewer both
attach the artifacts to their session logs.

```bash
pnpm run build                                     # one-time per pass
VISUAL_FEATURE=<feature-slug> node scripts/visual-smoke.mjs
# → progress/visual_<feature-slug>.png   (screenshot)
# → progress/visual_<feature-slug>.json   (DOM + computed-style report)
```

The smoke is intentionally **mock-only**: it covers visual / layout
correctness against fake data, not functional correctness against the real
backend. Functional coverage stays in Level 3 (manual smoke against
`docker compose up`) — Level 4 exists so that "does it look right" doesn't
have to wait for a full backend round-trip on every iteration.

When to run it:

- **Implementer**: after the code change, before declaring done. Compare the
  screenshot against the visual direction in `design.md`; if the layout
  reads wrong, fix and re-shoot — don't hand off a screenshot you haven't
  eyeballed yourself.
- **Reviewer**: as part of the review pass, attach the screenshot to
  `progress/review_<feature>.md` and cross-check it against the spec's
  visual direction. A reviewer who hasn't opened the screenshot hasn't
  finished.
- **Leader (orchestrator)**: between passes, when the user reports a visual
  defect. Re-shoot before deciding whether the implementer needs another
  pass — sometimes the issue is already fixed and the user is looking at a
  stale image.

When NOT to run it:

- Backend-only or service-only changes that don't touch a component
  template.
- Spec / docs / `progress/` / harness-internal changes.
- T17-style end-to-end checks — those still go through Level 3 against
  `docker compose up`. Level 4 is a layout check, not a functional one.

Fixtures (mock data) live inside `scripts/visual-smoke.mjs` and currently
cover: `api/academic-years`, `api/quarters`, `api/users`, `api/roles`,
`api/courses`, `api/institutions`, `api/auth/login`, `api/auth/me`. When
adding a new feature that introduces a new endpoint, extend the `mockApi`
function in the same file — don't let the smoke fall back to an empty
`{}` for a new endpoint without thinking about it.

## Anti-patterns (do not do)

- "I added the feature, it should work." → missing executable proof (at
  minimum, a passing `pnpm run build` plus a described manual smoke test).
- Claiming "tests pass" when there is no test suite — there isn't one yet;
  say what was actually checked.
- Mocking the backend response type without ever hitting the real
  `/api/...` endpoint at least once through `docker compose up`.
- Marking a feature `done` when `pnpm run build` fails.

## Final Check Before Closing

```bash
./init.sh   # must end with [OK] Environment ready
```

`init.sh`'s verification step will `[WARN]` (not fail) since
`verify_command` is unset — that WARN is expected right now, not a signal to
ignore `pnpm run build` failures. Run `pnpm run build` manually and confirm
it's clean before logging out. If it's red, do not close the session as
`done` — record the blocker and set the feature's status to `blocked`
instead.
