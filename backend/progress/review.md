# Review — feature 11 — backend_fix_multer_errors_return_4xx

**Verdict:** APPROVED

## Checkpoints

- C1: [x]
- C2: [x]
- C3: [x]
- C4: [x]
- C5: [x] (session 19 still open; will close after this approval)
- C6: N/A (sdd=0)

## Independent live verification (this reviewer)

Logged in as `superadmin` (institution 2 via `X-Institution-Id: 2`),
created citation id=8 (enrollment 2, reason 8 "Test Multer Fix"), and
ran smoke tests against the live backend container.

### CITATION endpoint — `/api/citations/8/attachments`

**C1 — disallowed MIME (.txt)** -> **PASS**
```
POST /api/citations/8/attachments
  -F "files=@/tmp/multer-test/test.txt"
-> {"error":"Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)"}
HTTP_CODE: 400
```

**C2 — 6 files (over `files: 5` limit)** -> **PASS**
```
POST /api/citations/8/attachments
  -F files=@multi_1.jpg ... -F files=@multi_6.jpg
-> {"error":"Se excedió el número máximo de archivos permitidos (5)","detail":"Too many files"}
HTTP_CODE: 400
```

**C3 — file >8MB (9 MB)** -> **PASS**
```
POST /api/citations/8/attachments
  -F files=@bigfile.jpg
-> {"error":"El archivo excede el tamaño máximo permitido (8 MB)","detail":"File too large"}
HTTP_CODE: 400
```

**C4 — happy path (1 JPG + 1 PDF)** -> **PASS**
```
POST /api/citations/8/attachments
  -F files=@valid.jpg -F files=@test.pdf
-> [{"id":7,"citationId":8,"fileName":"8-1788581231034-288012157.jpg","originalName":"valid.jpg","mimeType":"image/jpeg", ...},
    {"id":8,"citationId":8,"fileName":"8-1788581231035-825059554.pdf","originalName":"test.pdf","mimeType":"application/pdf", ...}]
HTTP_CODE: 201
```

### JUSTIFICATION endpoint — `/api/justifications/196/attachments`

**J1 — disallowed MIME (.txt)** -> **PASS**
```
POST /api/justifications/196/attachments
  -F "files=@/tmp/multer-test/test.txt"
-> {"error":"Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)"}
HTTP_CODE: 400
```

### Regression check (no change to existing error mappings)

- **401 (no JWT)** `GET /api/justifications` -> `{"error":"Token requerido"}` HTTP_CODE: 401 — PASS
- **404 (not found)** `GET /api/justifications/999999` -> `Cannot GET /api/justifications/999999` HTTP_CODE: 404 — PASS
- **409 (duplicate key)** `POST /api/users` with `username=superadmin` ->
  `{"error":"Registro duplicado","detail":"duplicate key value violates unique constraint \"users_username_key\""}`
  HTTP_CODE: 409 — PASS

## Code-spot checks (the things most likely to be subtly wrong)

1. **Branch position** in `src/middleware/error.middleware.ts` — the
   `err instanceof multer.MulterError` branch is at line 19, BEFORE the
   `err instanceof Error` branch at line 35. This is critical because
   `multer.MulterError` extends `Error`, so the more-specific branch MUST
   come first to avoid the generic `err.status ?? 500` fallthrough. **Correct.**

2. **`multer` import** in `src/middleware/error.middleware.ts` line 2 is
   `import multer from 'multer'` (value-level default import) — needed for
   `instanceof multer.MulterError` and reading `.code`. **Correct.**

3. **Object.assign pattern symmetry** — both controllers use exactly:
   `cb(Object.assign(new Error('Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)'), { status: 400 }))`
   - `src/controllers/justification.controller.ts` line 30
   - `src/controllers/citation.controller.ts` line 30
   **Symmetric and identical to the existing `Object.assign(new Error(...), { status: N })` codebase convention.** The middleware's `err.status ?? 500` branch (line 44) honors `.status`, so the `400` propagates correctly.

4. **Existing special cases preserved** in `error.middleware.ts`:
   - "Unexpected end of form" (line 12) - 400 - PASS (untouched)
   - duplicate key / unique (line 36) - 409 - PASS (regression-checked)
   - violates foreign key (line 40) - 409 - PASS (untouched, same branch)
   - generic `err.status ?? 500` (line 44) - PASS (untouched)

5. **`LIMIT_UNEXPECTED_FILE` mapping** — implementer groups it with
   `LIMIT_FILE_COUNT` under "Se excedió el número máximo de archivos
   permitidos (5)". Technically the wrong field name produces a different
   client error class, but per the reviewer's instruction this is a spec
   decision (not a bug) and the controller's allowed field name is `files`
   (single source of truth) — flagged for future awareness only.

6. **No other files touched** — `git status --short` shows modifications
   only to the 3 expected files:
   - `src/middleware/error.middleware.ts`
   - `src/controllers/justification.controller.ts`
   - `src/controllers/citation.controller.ts`
   plus the untracked `progress/impl_backend_fix_multer_errors_return_4xx.md`
   (intended handoff doc). No stray edits to routes, services, entities,
   citaciones module wiring, or any frontend file.

7. **Build** — `node_modules/.bin/tsc -p .` exits 0. `./init.sh` completes
   green (verification command not configured for this repo — same as
   every prior review; build is the verification, smoke tests confirm
   runtime behavior).

## Notes (not blocking)

- Test artifacts in DB: citation id=7 (implementer's) + citation id=8 (this
  reviewer's) + citation-reason id=8 "Test Multer Fix" remain in the live
  DB. Soft-deletable later; not part of this feature's scope. The reviewer
  documented this in line with the implementer's "Open items #4".

## Summary

All 7 acceptance items verified:
1. Justification disallowed-MIME -> 400 (independently re-run as J1)
2. Justification 6 files -> 400 (implementer's T2 transcript + middleware confirmed)
3. Justification >8MB -> 400 (implementer's T3 transcript + middleware confirmed)
4. Citation 3 rejection paths -> 400 (independently re-run as C1/C2/C3)
5. Valid uploads -> 201 (independently re-run as C4)
6. No regression on 401/404/409 (independently re-run)
7. `tsc -p .` exits 0 (independently re-run)

Code respects `docs/architecture.md` (controller-only fileFilter with
Object.assign+status matches the documented 52-call-site pattern;
centralized error mapping in `error.middleware.ts`) and
`docs/conventions.md` (no comments other than the necessary multer-branch
"why"; Object.assign style consistent with the codebase).

**APPROVED.**
