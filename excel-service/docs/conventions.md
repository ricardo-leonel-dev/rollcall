# Code Conventions

> Extreme homogeneity. Agents predict better when the codebase looks like
> itself throughout.

## Language/Style

- **Language & version:** Go 1.25 (`go.mod`: `go 1.25.0`). `CGO_ENABLED=0`
  for the production build (see `Dockerfile`) — don't introduce a
  cgo-dependent import.
- **Formatter/linter:** no `golangci-lint` config or CI check exists yet —
  `gofmt` is the de facto standard (the tree is currently `gofmt`-clean).
  Run `gofmt -l .` (should print nothing) and `go vet ./...` (should print
  nothing) before calling a change done; treat either producing output as a
  build-blocking issue.
- **Line length / formatting rules:** whatever `gofmt` produces — no
  additional manual rule.

## Names

| Construct | Convention | Example |
|---|---|---|
| Generic/infra function | English, `camelCase` (unexported — nothing in this package is exported, there's no importable API) | `parseCourseIDs`, `mergeWorkbooks`, `sanitizeFilename`, `stripExternalLinks` |
| Domain/template function | Spanish, `camelCase` — mirrors the vocabulary of the `.xlsx` template and the school domain it fills in | `escribirNomina`, `escribirFirmas`, `escribirGradoYJornada`, `gradoDesdeAbreviado`, `diasHabiles` |
| Internal struct | Unexported `camelCase` | `courseData`, `absenceRecord`, `rosterStudent` |
| Exported struct (JSON payload) | `PascalCase` — only used where a type crosses the HTTP JSON boundary | `Signer` (decoded from the `signers` query param) |
| HTTP error strings | English, sent verbatim via `http.Error` | `"Invalid date format. Use YYYY-MM-DD"` |
| Package-level constant/regex | grouped in a `const (...)`/`var (...)` block near first use, not all hoisted to the top of the file | `filaInicialNomina`/`filaFinalNomina` above `courseData`; `reGradeOrdinal` above `gradoDesdeAbreviado` |

Comments and identifiers are **not** uniformly English or Spanish — match
whichever the surrounding function already uses (Spanish for
template/domain logic close to the `.xlsx` structure, English for generic
infrastructure) rather than "fixing" one to match the other.

## File Structure

Single flat package (`package main`, no subpackages — see
`docs/architecture.md`). No license header or file-level docstring
convention. Import blocks are grouped stdlib-then-third-party, `gofmt`-
ordered within each group.

## Tests

- **Test file location/naming:** none exist yet — no `*_test.go` files.
- **Test framework:** none set up; would be Go's built-in `testing` package
  (`go test ./...`) if added — `names.go`'s pure helpers
  (`normalizeName`/`wordSet`/`matchName`) are the obvious first candidate,
  since they have no DB/HTTP dependency.
- **Fixture/isolation convention:** N/A until tests exist.

## Error Handling

- Standard Go `if err != nil { return err }` / `if err != nil { ...;
  return }` at every call site — no panics used as control flow.
- The HTTP handler (`exportExcelHandler`) is the only place that converts an
  `error` into a response: `http.Error(w, msg, status)`, with 400 for
  malformed input, 404 for a missing course, 500 for template/merge/DB
  failures.
- On a failure mid-export, previously-created temp files for other courses
  in the same request are explicitly cleaned up (`os.Remove` in a loop)
  before returning the error — don't leave partial temp output behind on an
  error path.

## Comments

By default, comments are **not** written. They are only allowed when they
explain a non-obvious *why* (a documented workaround, a subtle invariant).
Well-named identifiers should do the rest. This codebase already follows
that — see the `search_path` rationale in `db.go` (why it's a connection
startup parameter and not a per-query `SET`) as the bar for when a comment
earns its place.
