# Tasks — Citation reasons (motivos) schema + CRUD

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>` lists
the file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable done-condition.
The implementer checks these off in order; the reviewer rejects the feature if any are left `[ ]`
without a documented, reviewer-accepted justification in
`progress/impl_citation_reasons_management.md`.

This project has no automated test framework yet (`docs/verification.md`) — traceability here is
satisfied the same way it was for feature #7 (`report_conflicting_absence_type_on_create`): a
`pnpm run build` pass plus a manual smoke test against the real API, with verbatim request/response
captured in `progress/impl_citation_reasons_management.md`.

- [x] T1 (R1, R2, R3, R4, R5, R18, R19) Write `postgres/21_citation_reasons.sql` exactly as shown
      in `design.md`'s "Migration" section: `CREATE TABLE IF NOT EXISTS` for `citation_reasons`,
      `citations`, `citation_citation_reasons`, `citation_attachments` (with their indexes), then
      the `role_permissions` seed `INSERT ... SELECT ... WHERE name IN ('admin', 'rector',
      'superadmin')`. First re-check `ls postgres/` for the actual highest-numbered file on disk —
      if `21_*.sql` is already taken by another feature landed in the meantime, use the next free
      number and update this file's own references accordingly (see design.md's "Migration
      numbering" note).

- [x] T2 (R6) Add `src/entities/CitationReason.ts`, `src/entities/Citation.ts`,
      `src/entities/CitationCitationReason.ts`, `src/entities/CitationAttachment.ts` exactly as
      shown in `design.md`'s "Entities" section (camelCase properties, `@Column({ name:
      'snake_case' })`, 1:1 with T1's DDL).

- [x] T3 (R6, R21) Register the four new entities in `src/data-source.ts`'s `entities` array
      (import + array entry, next to the existing `Quarter`/`JustificationAttachment` imports).

- [x] T4 (R7, R8, R9, R10, R12, R13, R14, R15) Add `src/services/citation-reason.service.ts`
      (`findAll`, `create`, `update`, `remove` + `assertValidName`/`assertValidSeverity`/
      `findOwned` helpers) exactly as shown in `design.md`'s "Service" section.

- [x] T5 (R7, R8, R9, R10, R12, R13, R14, R15, R16, R17) Add
      `src/controllers/citation-reason.controller.ts` exactly as shown in `design.md`'s
      "Controller" section (`requireInstitution` + `requirePermission('citation-reasons', action)`
      per route, one line per route matching `absence.controller.ts`'s table style).

- [x] T6 (R16, R17, R20) Mount the new router at `/citation-reasons` in `src/routes/index.ts`,
      inside the standard authenticated block (after `authMiddleware` + `institutionMiddleware`,
      alongside the other resource routers).

- [x] T7 (R21) Run `pnpm run build` (or `node_modules/.bin/tsc -p .` if `pnpm` isn't available in
      the environment). Done: exits `0` with no new TypeScript errors attributable to any file
      touched by T1–T6.

- [x] T8 (R1, R2, R4, R5, R18, R19) After applying the migration to a running Postgres instance
      (`docker compose up --build` from the repo root, or `psql $DATABASE_URL -f
      postgres/21_citation_reasons.sql` against an already-running instance), confirm via `psql`
      (`\d citation_reasons`, `\d citations`, `\d citation_citation_reasons`,
      `\d citation_attachments`) that every column, constraint (`UNIQUE`, `CHECK`), and index from
      `design.md` exists as specified, and confirm via `SELECT role_id, resource, can_read,
      can_create, can_update, can_delete FROM role_permissions WHERE resource =
      'citation-reasons'` that there is exactly one row per `admin`/`rector`/`superadmin` role
      (all four `can_*` flags `TRUE`) and no row for any other role. Capture the query output in
      `progress/impl_citation_reasons_management.md`.

- [x] T9 (R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17) Manual smoke test against the running
      stack, using a JWT scoped to a real institution with `admin`/`rector` permissions, covering:
      (i) `GET /api/citation-reasons` on an empty institution → `200 []`; (ii) `POST
      /api/citation-reasons` with valid `name`/`severity` → `201` with the created record, then a
      repeat `GET` shows it; (iii) `POST` with blank `name` → `400`, no row created; (iv) `POST`
      with an invalid `severity` (e.g. `"urgente"`) → `400`, no row created; (v) `POST` with a
      `name` duplicating an existing active reason in the same institution → `409`, no duplicate
      row; (vi) `PUT /api/citation-reasons/:id` changing only `description` → `200`, `name`/
      `severity` unchanged; (vii) `DELETE /api/citation-reasons/:id` → `204`, then `GET` no longer
      lists it, and a DB-level check confirms `deleted_at` is set (not a hard delete); (viii) `PUT`/
      `DELETE` against a soft-deleted or nonexistent `id` → `404`; (ix) a request with no
      `Authorization` header → `401`; (x) a request using a role with no `role_permissions` row for
      `citation-reasons` (e.g. `teacher`) → `403` on every verb. Capture each request/response
      verbatim in `progress/impl_citation_reasons_management.md`.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|---|---|
| R1 | T1, T8 |
| R2 | T1, T8 |
| R3 | T1, T8 |
| R4 | T1, T8 |
| R5 | T1, T8 |
| R6 | T2, T3 |
| R7 | T4, T5, T9 |
| R8 | T4, T5, T9 |
| R9 | T4, T5, T9 |
| R10 | T4, T5, T9 |
| R11 | T4, T9 |
| R12 | T4, T5, T9 |
| R13 | T4, T5, T9 |
| R14 | T4, T5, T9 |
| R15 | T4, T5, T9 |
| R16 | T5, T6, T9 |
| R17 | T5, T6, T8, T9 |
| R18 | T1, T8 |
| R19 | T1, T8 |
| R20 | T6 |
| R21 | T3, T7 |
