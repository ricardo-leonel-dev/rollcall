# Verification — How to prove a feature works

> Golden rule: the agent doesn't say "it works," it proves it. Every feature
> ends with executable evidence, not just claims.

## Current state (read this first)

This project has **no automated test suite** yet (no `*.spec.ts`/`*.test.ts`
files, no test script in `package.json`). `.harness.json`'s `verify_command`
is intentionally left **empty** until a real test framework is added —
`init.sh` will skip verification with a `[WARN]`, not a failure. Until then,
"verified" means Level 1 (build) + Level 3 (manual smoke test) below, not an
automated pass. Say explicitly that a change was build-checked and manually
smoke-tested, not unit-tested.

## Verification Levels

### Level 1 — Build check (mandatory, stands in for unit tests today)

```bash
pnpm run build
```

This runs `tsc` with `strict: true` — it catches type errors across the
whole `src/` tree. It does **not** verify runtime behavior (no DB
connection, no route is actually invoked). Run it after every change before
calling a feature done.

If a real unit test suite is added later, set `.harness.json`'s
`verify_command` to that command and update this section — it then becomes
the mandatory Level 1 check instead of `pnpm run build`.

### Level 2 — Integration check (against the real API + DB)

From the repo root (`ai-personal/`), bring up the full stack:

```bash
docker compose up --build
```

This runs Postgres (schema loaded from `postgres/*.sql` via
`docker-entrypoint-initdb.d`), Redis, `excel-service`, `backend`, and
`frontend` together. Then exercise the changed endpoint for real, e.g.:

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}

curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<seeded-user>","password":"<seeded-password>"}'
```

`seedSuperAdmin()` runs automatically on boot (see `app.ts`) so a superadmin
account always exists after a fresh `docker compose up`. Use the returned
JWT (`Authorization: Bearer <token>`) to hit a protected route and confirm
the response shape matches the relevant `entities/`/service return type —
not a mock.

### Level 3 — Manual Smoke Test (recommended before closing a session)

1. `docker compose up --build`.
2. Log in via the API (above) or through the frontend at `http://localhost`.
3. Exercise the changed resource end-to-end: for a CRUD change, create →
   list (confirm it appears, correctly scoped by `institutionId`/
   `courseIds`) → update → soft-delete (confirm `deletedAt` is set and the
   row drops out of subsequent list calls, not that the row disappears from
   the table). For a background-job change (voice/photo absence), enqueue a
   job and confirm the corresponding row lands in its log table
   (`voice_absence_logs`/equivalent) with `status: 'completed'`.

## Anti-patterns (do not do)

- "I added the feature, it should work." → missing executable proof (at
  minimum, a passing `pnpm run build` plus a described manual/API smoke
  test).
- Claiming "tests pass" when there is no test suite — there isn't one yet;
  say what was actually checked.
- Testing a service function by calling it directly with a mocked
  `AppDataSource` instead of hitting the real endpoint against Postgres.
- Marking a feature `done` when `pnpm run build` fails, or when a soft
  delete leaves the row visible in `findAll`.

## Final Check Before Closing

```bash
./init.sh   # must end with [OK] Environment ready
```

`init.sh`'s verification step will `[WARN]` (not fail) since
`verify_command` is unset — that WARN is expected right now, not a signal to
skip `pnpm run build`. Run it manually and confirm it's clean before logging
out. If it's red, do not close the session as `done` — record the blocker
and set the feature's status to `blocked` instead.
