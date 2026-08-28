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

From the repo root (`ai-personal/`), bring up the full stack so `/api/...`
calls actually resolve through nginx to the backend:

```bash
docker compose up --build
```

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
