# Architecture — What does "doing a good job" mean here?

> This document defines the quality bar for this project. The reviewer agent
> evaluates code against this file. If it's not here, it's not a requirement.

## Principles

1. **Layers.** This is a small, single-package Go service — everything is
   `package main` at the repo root, split by concern into flat files (no
   subpackages):
   - `main.go` — process wiring only: builds the DB pool, ensures
     `OUTPUT_DIR`/the template file exist, registers the two HTTP routes
     (`GET /health`, `GET /export/excel`), starts `http.ListenAndServe`.
   - `db.go` — `newPool(ctx)`, the single `pgxpool.Pool` constructor (schema
     applied as a connection-level `search_path` startup parameter, not a
     per-query `SET`).
   - `export.go` — the actual feature: the `GET /export/excel` handler plus
     everything it needs (querying course/roster/absence data, reading and
     writing the `.xlsx` template via `excelize`, merging multi-course
     workbooks, cleanup). This is the bulk of the codebase (~940 lines) — if
     it grows further, splitting it into focused files (e.g.
     `export_template.go`, `export_query.go`) is reasonable, but stay in
     `package main` rather than inventing an internal package layout that
     doesn't exist yet.
   - `names.go` — pure helpers (`normalizeName`, `wordSet`, `matchName`) used
     by `export.go` to reconcile student names between the roster read from
     the `.xlsx` template and the names stored in Postgres (OCR/manual-entry
     spelling drift). Keep these here, and keep them pure (no DB/HTTP
     access) — they're the one part of this service worth unit testing in
     isolation.
   Don't introduce a subpackage or a web framework — this is deliberately a
   flat, single-binary service.
2. **Dependencies.** Minimal by design: stdlib `net/http` (no framework —
   `http.NewServeMux`'s Go 1.22+ method-pattern routing, e.g.
   `"GET /export/excel"`), `github.com/jackc/pgx/v5/pgxpool` for Postgres
   (raw SQL via `pool.QueryRow`/`pool.Query`, no ORM), and
   `github.com/xuri/excelize/v2` for reading/writing the `.xlsx` template.
   Adding a new dependency here is a deliberate choice, not a default.
3. **Error handling.** Idiomatic Go: functions return `error` as their last
   value, callers check it immediately. The HTTP boundary
   (`exportExcelHandler`) converts every error into `http.Error(w, ...,
   status)` with an appropriate status (400 for bad/missing query params or
   date parsing, 404 for a course not found, 500 for template/DB failures)
   — never a panic as control flow. Temp files created before a failure are
   cleaned up (`os.Remove`) on the error path, not just on success.
4. **State/mutability.** Handlers are stateless per request; the only
   package-level shared state is the `*pgxpool.Pool` passed into each
   handler closure at startup. The `.xlsx` template (`plantillaPath`) is
   never held in memory between requests — `excelize.OpenFile` re-reads it
   fresh for every export, and per-course output is written to a **temp
   file** in `OUTPUT_DIR` (`temp_<courseID>_<timestamp>.xlsx`), merged into
   one workbook when multiple courses are requested, served via
   `http.ServeFile`, then removed (`defer`). Don't hold generated workbooks
   in memory across requests or write directly to the shared template path.

## Data Flow

```
GET /export/excel?institution_id=&course_ids=&academic_year_id=
    &date_from=&date_to=&signers=
  -> exportExcelHandler: parse + validate query params
  -> per course_id: query Postgres (courses, roster, absence records)
  -> per course: excelize.OpenFile(plantillaPath) -> getColumnMap locates
     month/day columns by scanning the template's header rows -> matchName
     reconciles roster names against DB names -> write attendance cells ->
     SaveAs a temp .xlsx in OUTPUT_DIR
  -> if multiple courses: mergeWorkbooks combines them into one file
  -> stripExternalLinks (avoids Excel's "update links" prompt on open)
  -> http.ServeFile with Content-Disposition: attachment
  -> defer: remove all temp files
```

This service has no other write path — it does not mutate application data
in Postgres, it only reads it to fill the template. It is called by the
`backend` service over plain HTTP (`export.service.ts`'s
`EXCEL_URL`/`EXCEL_SERVICE_URL`), not reachable directly from the frontend.

## Course Grade Display: Structured Field with a Legacy Regex Fallback

`courseData.fullName`/`.paralelo` (added by `postgres/16_course_grade_shift.sql`)
are nullable — the ~27 courses that existed before that migration were left
with both columns `NULL` on purpose (no automated backfill; an admin fills
them in later via Admin → Cursos). `gradoDisplay` (export.go) therefore has
two paths, and both must keep working:

1. **Preferred:** `cd.fullName` is set → `insertarParalelo` inserts the
   course's `paralelo` after the first word (e.g. `DÉCIMO "A" BS`).
2. **Fallback:** `cd.fullName` is empty → `gradoDesdeAbreviado` infers the
   grade word from the abbreviated `cd.name` via `reGradeOrdinal`
   (`10MO` → `DÉCIMO`); the abbreviated name already carries the paralelo
   embedded, so it is *not* re-inserted in this path.

Don't delete `gradoDesdeAbreviado`/`reGradeOrdinal` as unreachable/legacy —
it's the only thing that keeps the GRADO cell (`C9`) non-blank for any course
still missing a structured `full_name`, which as of this writing is most of
the pre-existing roster. Removing it would silently blank that cell for
those institutions rather than error, which is easy to miss in review.

## Running the App

- **Development:** `docker compose up --build` from the repo root
  (`ai-personal/`) — runs alongside Postgres, Redis, `backend`, and
  `frontend`. There is no dev-specific override entry for this service in
  `docker-compose.override.yml` — it always runs the same compiled binary in
  its Alpine container.
- **Production:** same `Dockerfile`/`docker-compose.yml` — a static Go
  binary (`CGO_ENABLED=0`) in an `alpine` container, **not** behind nginx
  (only the frontend is; see the frontend project's `docs/architecture.md`).
  Listens on host port `8002`, reachable from `backend` on the `ai-stack`
  network as `http://excel-service:8002`.

## What NOT to do

- Don't add a web framework (gin/echo/chi/...) — stick with stdlib
  `net/http`.
- Don't add an ORM — this service talks to Postgres with raw SQL via
  `pgxpool`.
- Don't hold the `.xlsx` template or a generated workbook in a package-level
  variable — re-read/re-generate per request, and always clean up temp files
  on both the success and error paths.
- Don't skip `stripExternalLinks` on a new export path that reuses the
  template — it's there to suppress a real Excel UX problem (the "update
  links" dialog), not incidental.
- Don't put DB or HTTP calls inside `names.go` — those helpers are pure by
  design and are the easiest part of this service to unit test; keep them
  that way.
