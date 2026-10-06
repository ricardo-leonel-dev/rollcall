# Tasks — Citation reasons read access follows citation permission

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>` lists
the file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable done-condition.
The implementer checks these off in order; the reviewer rejects the feature if any are left `[ ]`
without a documented, reviewer-accepted justification in
`progress/impl_citation_reasons_read_access_follows_citation_permission.md`.

This project has no automated test framework (`docs/verification.md`) — traceability here is
satisfied the same way it was for features #7/#9/#10/#13/#14/#15: a `pnpm run build` pass plus a
manual smoke test against the live API and the live DB, with verbatim request/response captured in
`progress/impl_citation_reasons_read_access_follows_citation_permission.md`.

- [x] T1 (R1, R2, R3, R4, R5) Add `requireAnyPermission` to `src/middleware/role.middleware.ts`
      exactly as shown in `design.md`'s "`requireAnyPermission` shape" section: add `import { In }
      from 'typeorm';`, define `type Check = { resource: string; action: Action };`, export
      `function requireAnyPermission(checks: Check[])` returning the middleware with the 401
      unauthenticated guard, the superadmin bypass, the deduplicated `repo.find(... In(resources))`
      lookup, the `checks.some(...)` OR-evaluation, and the 403 fallback. Do not modify
      `requirePermission` or its call sites.

- [x] T2 (R6, R11, R12, R13) Update `src/controllers/citation-reason.controller.ts`: change the
      `GET /` line from `requirePermission(R,'read')` to `requireAnyPermission([{ resource:
      'citaciones', action: 'read' }, { resource: 'citaciones', action: 'create' }, { resource:
      'citation-reasons', action: 'read' }])`. Leave the `POST`, `PUT`, and `DELETE` lines
      (`requirePermission(R,'create'|'update'|'delete')`) and the `const R = 'citation-reasons'`
      declaration unchanged.

- [x] T3 (R15) Run `pnpm run build` (or `node_modules/.bin/tsc -p .` if `pnpm` isn't available).
      Done: exits `0` with no new TypeScript errors attributable to `role.middleware.ts` or
      `citation-reason.controller.ts`.

- [x] T4 (R16-i, R7) Manual smoke test: authenticate as a role with `citaciones:read = TRUE` and no
      `citation-reasons` row (e.g. `inspector de apoyo` or `inspector general`, per
      `postgres/22_citations_permissions.sql`); confirm via a `role_permissions` SELECT that the
      role indeed has no `citation-reasons` row before calling the endpoint. `GET
      /api/citation-reasons` → `200` with the institution's reasons array. Capture verbatim
      request/response and the confirming SELECT.

- [x] T5 (R16-ii, R8) Manual smoke test: using the same role as T4 (or another with `citaciones`
      access), temporarily set `can_read = FALSE` for its `citaciones` row (keeping `can_create =
      TRUE`) — record the original value first. `GET /api/citation-reasons` → `200`. Revert the row
      to its original value immediately after. Capture verbatim request/response and both the
      before/after `UPDATE`s.

- [x] T6 (R16-iii, R9) Manual smoke test: authenticate as a role with `citation-reasons:read =
      TRUE` and no `citaciones` access (per `design.md`'s flagged note, this requires either a
      scratch test role or temporarily zeroing out an existing role's `citaciones` row and
      reverting afterward — pick whichever is less disruptive and document which one was used).
      `GET /api/citation-reasons` → `200`. Capture verbatim request/response and any temporary
      `role_permissions` changes plus their reversal.

- [x] T7 (R16-iv, R10) Manual smoke test: authenticate as a role with neither `citaciones` nor
      `citation-reasons` access (e.g. `docente`/teacher, or any role confirmed via SELECT to have
      no row for either resource, or `can_read = FALSE` and `can_create = FALSE` on `citaciones`
      and no `citation-reasons` row). `GET /api/citation-reasons` → `403` with body `{ error: 'Sin
      permisos para este recurso' }`. Capture verbatim request/response.

- [x] T8 (R16-v, R11, R12, R13) Manual smoke test: using a role with `citaciones` full CRUD but no
      `citation-reasons` row (e.g. `inspector de apoyo`), call `POST /api/citation-reasons`, `PUT
      /api/citation-reasons/:id`, and `DELETE /api/citation-reasons/:id` → `403` on all three,
      confirming the OR-permission relaxation did not leak into write operations. Capture verbatim
      request/response for each of the three calls.

- [x] T9 (R16-vi, R3, R14) Manual smoke test: authenticate as `superadmin`, call `GET
      /api/citation-reasons` for an institution (via `X-Institution-Id`) → `200` regardless of that
      role's `role_permissions` rows. Capture verbatim request/response.

- [x] T10 (R16) Final `./init.sh` re-run: green; the only `[WARN]`s are pre-existing baseline ones
      (empty `verify_command`, unset `SUPABASE_URL`, or similar already-known warnings). Capture
      the init output in `progress/impl_citation_reasons_read_access_follows_citation_permission.md`.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|--------|------------|
| R1     | T1 |
| R2     | T1, T7 |
| R3     | T1, T9 |
| R4     | T1, T4, T5, T6 |
| R5     | T1, T7 |
| R6     | T2 |
| R7     | T4 |
| R8     | T5 |
| R9     | T6 |
| R10    | T7 |
| R11    | T2, T8 |
| R12    | T2, T8 |
| R13    | T2, T8 |
| R14    | T9 |
| R15    | T3, T10 |
| R16    | T4, T5, T6, T7, T8, T9, T10 |
