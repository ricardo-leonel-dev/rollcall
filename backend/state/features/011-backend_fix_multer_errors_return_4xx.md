---
feature_number: 11
name: backend_fix_multer_errors_return_4xx
title: Backend: mapear errores de multer a 400 en lugar de 500
status: done
created_at: 2026-09-05T00:17:46.000Z
updated_at: 2026-09-05T04:10:32.000Z
---

## Description
When file uploads fail validation (bad MIME, >5 files, >8MB per file), the API currently returns HTTP 500 instead of a meaningful 4xx. Root cause: src/middleware/error.middleware.ts has no special-case for multer.MulterError, and the fileFilter callbacks in src/controllers/citation.controller.ts and src/controllers/justification.controller.ts create plain Error objects without a status property. Affects POST /api/citations/:id/attachments and POST /api/justifications/:id/attachments (both endpoints, same root cause in both controllers + the shared middleware).

## Acceptance
- [ ] POST /api/justifications/<id>/attachments with a disallowed-MIME file (e.g. .txt) returns 400 with the validation message, not 500
- [ ] POST /api/justifications/<id>/attachments with 6 files returns 400 with a 'too many files' or error.message-based detail, not 500
- [ ] POST /api/justifications/<id>/attachments with a file >8MB returns 400, not 500
- [ ] Same three rejection paths also return 400 on POST /api/citations/<id>/attachments
- [ ] Valid uploads (1-5 files, allowed MIME types, <=8MB each) continue to return 201 with the attachment records
- [ ] No regression on existing error mappings in error.middleware.ts: 401 (no JWT), 403 (insufficient role), 404 (not found), 409 (duplicate key, FK violation) all continue to fire as today
- [ ] Build (node_modules/.bin/tsc -p . or pnpm run build) exits 0 with no new TypeScript errors
