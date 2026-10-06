# Feature 11 — backend_fix_multer_errors_return_4xx

## Outcome

Self-verification: **full green** — both justification and citation endpoints
verified against live stack. 4 + 4 = 8 smoke tests pass (3 rejection + 1 happy
on each endpoint). tsc -p . exits 0. No regressions on 401/404/409 dispatch.

## Citation endpoint follow-up (post PR #100 merge)

PR #100 (`feature/citaciones-module` → `origin/staging`, merge commit
`ef934b2`) brought `src/controllers/citation.controller.ts` back to staging,
along with the rest of the citaciones module (service, entities,
`data-source.ts` registration, `routes/index.ts` mount, `app.ts`
`uploads/citaciones` bootstrap).

### Diff applied to `src/controllers/citation.controller.ts`

Line 30 only (other 76 lines untouched):

Before:
```ts
      cb(new Error('Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)'));
```

After:
```ts
      cb(Object.assign(new Error('Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)'), { status: 400 }));
```

Same `Object.assign` pattern + same Spanish message text as the
`justification.controller.ts` fix. Falls through `error.middleware.ts`'s
`(err.status ?? 500)` branch and surfaces as 400.

### Citation smoke tests (live stack, post-rebuild)

Rebuilt via `docker compose up -d --build backend` to refresh `/app/dist/`.
Created a fresh citation (id=7) on enrollment=58 in institution=2 for the
tests; reason id=8 ("Test Multer Fix", severity=low) seeded via
`POST /api/citation-reasons`. All tests run as superadmin with
`X-Institution-Id: 2`.

**Test C1 — disallowed MIME (.txt)**
```
POST /api/citations/7/attachments
  -F "files=@test.txt"
→ {"error":"Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)"}
  HTTP_CODE: 400
```
(was 500 before fix)

**Test C2 — 6 files (over `files: 5` limit)**
```
POST /api/citations/7/attachments
  -F "files=@multi_1.jpg" ... -F "files=@multi_6.jpg"
→ {"error":"Se excedió el número máximo de archivos permitidos (5)","detail":"Too many files"}
  HTTP_CODE: 400
```
(was 500 before fix)

**Test C3 — file >8MB (over `fileSize: 8MB` limit)**
```
POST /api/citations/7/attachments
  -F "files=@bigfile.jpg"  (9 MB)
→ {"error":"El archivo excede el tamaño máximo permitido (8 MB)","detail":"File too large"}
  HTTP_CODE: 400
```
(was 500 before fix)

**Test C4 — happy path (1 valid JPG + 1 PDF)**
```
POST /api/citations/7/attachments
  -F "files=@valid.jpg" -F "files=@test.pdf"
→ [
    {"id":5,"citationId":7,"fileName":"7-1788580832823-542052682.jpg","originalName":"valid.jpg","mimeType":"image/jpeg","createdAt":"2026-09-05T04:00:32.833Z","url":"/api/uploads/citaciones/7-1788580832823-542052682.jpg"},
    {"id":6,"citationId":7,"fileName":"7-1788580832823-273916486.pdf","originalName":"test.pdf","mimeType":"application/pdf","createdAt":"2026-09-05T04:00:32.833Z","url":"/api/uploads/citaciones/7-1788580832823-273916486.pdf"}
  ]
  HTTP_CODE: 201
```

### Build verification

```
$ node_modules/.bin/tsc -p .
FINAL TSC EXIT 0
```

### Cross-check with justification side

The justification smoke tests from the prior session-19 run (T1–T4 above,
rebuild #1) still pass after the second rebuild; same `error.middleware.ts`
serves both endpoints, same `Object.assign(new Error(...), { status: 400 })`
pattern in both controllers' `fileFilter` — symmetry confirmed.

### Side-effect cleanup

Citation id=7 left in DB as test artifact (with 2 attachments from C4);
the `Test Multer Fix` reason id=8 also remains. They are soft-deletable
later if the leader wants a clean DB; not part of this feature's scope.

---

## Scope

3 files targeted by the spec; 2 modified, 1 not modifiable because it does not exist on disk.

### Files changed

- `src/middleware/error.middleware.ts` — added `multer.MulterError` handling before the
  generic `instanceof Error` branch. Maps `LIMIT_FILE_SIZE` / `LIMIT_FILE_COUNT` /
  `LIMIT_UNEXPECTED_FILE` to `400` with explicit Spanish messages, and any other
  `MulterError` to `400` with a generic message. Existing special cases
  (`Unexpected end of form`, `duplicate key`, `violates foreign key`) and the
  `(err.status ?? 500)` fall-through are untouched.
- `src/controllers/justification.controller.ts` — `fileFilter` now calls
  `cb(Object.assign(new Error('Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)'), { status: 400 }))`
  instead of `cb(new Error(...))`. The `error.middleware.ts` fall-through honors
  `.status`, so this propagates `400` correctly.
- `src/controllers/citation.controller.ts` — `fileFilter` now calls
  `cb(Object.assign(new Error('Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)'), { status: 400 }))`
  instead of `cb(new Error(...))`. Same pattern as justification; applied
  in a follow-up after PR #100 brought the citaciones module to staging.

## Verification

### TypeScript build

```
$ node_modules/.bin/tsc -p .
TSC EXIT 0
```

### Smoke tests (justification endpoint — live stack, post-rebuild)

Backend image rebuilt via `docker compose up -d --build backend` to refresh
`/app/dist/` with the source changes.

**Test 1 — disallowed MIME (.txt)**
```
POST /api/justifications/196/attachments
  -F "files=@test.txt"
→ {"error":"Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)"}
  HTTP_CODE: 400
```
(was 500 before fix)

**Test 2 — 6 files (over `files: 5` limit)**
```
POST /api/justifications/196/attachments
  -F "files=@multi_1.jpg" ... -F "files=@multi_6.jpg"
→ {"error":"Se excedió el número máximo de archivos permitidos (5)","detail":"Too many files"}
  HTTP_CODE: 400
```
(was 500 before fix)

**Test 3 — file >8MB (over `fileSize: 8MB` limit)**
```
POST /api/justifications/196/attachments
  -F "files=@bigfile.jpg"  (9 MB)
→ {"error":"El archivo excede el tamaño máximo permitido (8 MB)","detail":"File too large"}
  HTTP_CODE: 400
```
(was 500 before fix)

**Test 4 — happy path (1 valid JPG)**
```
POST /api/justifications/196/attachments
  -F "files=@valid.jpg"
→ [{"id":231,"justificationId":196,"fileName":"196-1788568419067-559185816.jpg","originalName":"valid.jpg","mimeType":"image/jpeg","createdAt":"...","url":"/api/uploads/justifications/196-1788568419067-559185816.jpg"}]
  HTTP_CODE: 201
```

### Regression check

**401 (no JWT) — `/api/justifications` without `Authorization`**
```
→ {"error":"Token requerido"}
  HTTP_CODE: 401
```
PASS — auth middleware untouched.

**404 (not found) — `/api/justifications/999999`**
```
→ "Cannot GET /api/justifications/999999"
  HTTP_CODE: 404
```
PASS — Express default 404 (no controller route hit).

**409 (duplicate key) — duplicate `POST /api/users` with same `username`**
```
→ {"error":"Registro duplicado","detail":"duplicate key value violates unique constraint \"users_username_key\""}
  HTTP_CODE: 409
```
PASS — duplicate-key branch in `error.middleware.ts` still fires.

**403 / FK / others** — not exhaustively re-tested; the duplicate-key case exercises
the same `(err instanceof Error) { … }` branch where the duplicate-key and FK
special cases live, and they were not touched. Build is green, no structural
changes to the dispatch chain.

### Citation endpoint — RESOLVED in follow-up (post PR #100)

Resolved after PR #100 (`feature/citaciones-module` → `origin/staging`, merge
commit `ef934b2`) brought `src/controllers/citation.controller.ts` and the
rest of the citaciones module wiring back to staging. The blocker section
below is preserved as historical context; live transcripts for the citation
endpoint are in the follow-up section at the top of this file.

### Citation endpoint — historical BLOCKED context (pre PR #100)

`POST /api/citations/<id>/attachments` could not be exercised in the first
session-19 pass because the endpoint was not reachable from the running
stack:

- `src/controllers/citation.controller.ts` did not exist on staging.
- `src/services/citation.service.ts`, `src/entities/Citation*.ts`,
  `src/data-source.ts` registration, `src/routes/index.ts` mount,
  `src/app.ts` `uploads/citaciones` bootstrap — none of these existed on
  staging either.
- The citaciones-module work was on `feature/citaciones-module` branch in
  commit `1dbfa86` (visible via `git log --all -- src/controllers/citation.controller.ts`),
  but it had not been merged into `staging`.
- The harness state marked feature 10 (`citations_crud_and_attachments`) as
  `done`, but the actual source code was not on the working tree — a state
  mismatch between harness state and source tree.

## Environment changes made

- Rebuilt the `backend` Docker image (`docker compose up -d --build backend`)
  to refresh the container's `/app/dist/` with the new error middleware and
  justification controller. This is non-destructive (only rebuilt what was
  already in `src/`); it did lose the citation and citation-reason routes
  that the previous container image had baked in via the leftover
  `dist/controllers/citation*.js` and `dist/routes/index.js` mount —
  those were stale (referencing source files no longer on staging) and
  would have needed a fresh source merge anyway.
- Container status after rebuild: `backend: Up 7 seconds (healthy)`.
  Health endpoint: `{"status":"ok"}`.

## Diff summary (relevant changed lines)

`src/middleware/error.middleware.ts` — added `multer` import + new branch:

```ts
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

// ...

  // Multer-thrown errors (LIMIT_FILE_SIZE, LIMIT_FILE_COUNT, LIMIT_UNEXPECTED_FILE, etc.)
  // — surface as 4xx, not 500. The client did something the server can name.
  if (err instanceof multer.MulterError) {
    const detail = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'El archivo excede el tamaño máximo permitido (8 MB)', detail });
      return;
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ error: 'Se excedió el número máximo de archivos permitidos (5)', detail });
      return;
    }
    res.status(400).json({ error: 'Solicitud de archivo inválida', detail });
    return;
  }
```

`src/controllers/justification.controller.ts` — `fileFilter` change:

```ts
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(Object.assign(new Error('Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)'), { status: 400 }));
      return;
    }
    cb(null, true);
  },
```

`src/controllers/citation.controller.ts` — `fileFilter` change (applied in
follow-up after PR #100; same pattern, same Spanish message):

```ts
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(Object.assign(new Error('Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)'), { status: 400 }));
      return;
    }
    cb(null, true);
  },
```

## Open items for reviewer

1. Confirm the `multer.MulterError` branch is positioned correctly (before the
   generic `instanceof Error` branch) so that multer-thrown errors are caught
   specifically.
2. Confirm that the `LIMIT_UNEXPECTED_FILE` mapping to "excedió el número
   máximo" is reasonable (it fires when a request sends files in a field
   name other than the expected one; arguably the message could mention
   "campo incorrecto", but the existing pattern groups it with the count
   limit).
3. Confirm the citation-side fix in `citation.controller.ts` is identical
   to the justification-side fix (one-line diff, same message text, same
   `Object.assign` pattern) — symmetry is what gives both endpoints the
   same error response.
4. Optional cleanup: citation id=7 + reason id=8 left as test artifacts in
   the live DB. Soft-deletable later if the leader wants a clean DB.
