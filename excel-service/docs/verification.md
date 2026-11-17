# Verification — How to prove a feature works

> Golden rule: the agent doesn't say "it works," it proves it. Every feature
> ends with executable evidence, not just claims.

## Current state (read this first)

This project **has an automated test suite** (`export_test.go`, run with
`go test ./...`). It covers the pure helpers and the workbook writing
(`processCourse`) against the real `plantilla_asistencia.xlsx`; it does not
touch the database — the SQL that only Postgres can answer is checked with
the Level 2 integration pass below.

`.harness.json`'s `verify_command` is intentionally left **empty**: `init.sh`
still skips its own verification step with a `[WARN]`, not a failure. Run
`go test ./...` yourself as part of Level 1 — a green `go build` alone does
not prove the change works. Say explicitly which of the levels below a
change was checked against.

## Verification Levels

### Level 1 — Build check + unit tests (mandatory)

```bash
go build ./...
gofmt -l .        # must print nothing
go vet ./...      # must print nothing
go test ./...     # must print "ok"
```

`go build` catches compile errors; `gofmt -l .`/`go vet ./...` catch
formatting drift and common correctness issues (neither should ever be
skipped — both are cheap and currently clean). `go test ./...` runs the
suite in `export_test.go`: the pure helpers and the workbook writing, with
the real template as the fixture. None of this exercises the database (no
DB connection, no HTTP request is actually made).

### Level 2 — Integration check (against the real DB + template)

From the repo root (`ai-personal/`):

```bash
docker compose up --build
```

This brings up Postgres (seeded via `postgres/*.sql`), `excel-service`, and
the rest of the stack. Then hit the real endpoint with real ids from the
seeded/test data:

```bash
curl -o /tmp/out.xlsx \
  "http://localhost:8002/export/excel?institution_id=1&course_ids=1&academic_year_id=1&date_from=2026-01-01&date_to=2026-01-31"
file /tmp/out.xlsx   # should report a valid Zip/xlsx, not an HTML error page
```

Confirm: the response has `Content-Type:
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, the
file opens cleanly in Excel/LibreOffice without an "update links" or
"repair" prompt (that's what `stripExternalLinks` exists to prevent), and
the attendance data actually matches what's in Postgres for that
course/date range — not just that a file came back.

### Level 3 — Manual Smoke Test (recommended before closing a session)

1. `docker compose up --build`.
2. Trigger an export the real way, through the `backend` (which is what
   actually calls this service in production) — e.g. via the frontend's
   student-report export flow, or directly:
   ```bash
   curl -o /tmp/out.xlsx "http://localhost:3000/api/export/excel?...&<same params>"
   ```
3. Open the resulting `.xlsx` and eyeball it: correct course/grade/shift
   header, correct date columns for the requested range, absence marks in
   the right rows, signature block filled in if `signers` was passed.
4. For a multi-course export, confirm every course landed on its own sheet
   in the merged workbook (`mergeWorkbooks`), not just the first one.
5. Confirm no `temp_*.xlsx` files were left behind in the container's
   `OUTPUT_DIR` after the request completes (the handler removes them via
   `defer` — a leftover temp file on a successful request is a bug).

## Anti-patterns (do not do)

- "I added the feature, it should work." → missing executable proof (at
  minimum, clean `go build`/`gofmt`/`go vet`/`go test`, plus a described
  manual export against real data).
- Claiming "tests pass" without pasting the `go test ./...` result, or
  claiming a database behaviour was tested when only the pure helpers were.
- Checking only the HTTP status code of `/export/excel` without opening the
  resulting file — a 200 with a corrupted or empty workbook is still a bug.
- Marking a feature `done` when `go vet ./...` or `gofmt -l .` reports
  anything.

## Final Check Before Closing

```bash
./init.sh   # must end with [OK] Environment ready
```

`init.sh`'s verification step will `[WARN]` (not fail) since
`verify_command` is unset — that WARN is expected right now, not a signal to
skip `go build ./...`/`gofmt -l .`/`go vet ./...`/`go test ./...`. Run them
manually and confirm they're clean before logging out. If any is red, do
not close the session as `done` — record the blocker and set the feature's
status to `blocked` instead.
