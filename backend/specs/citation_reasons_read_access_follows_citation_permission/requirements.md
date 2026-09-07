# Requirements — Citation reasons read access follows citation permission

Context: `GET /api/citation-reasons` currently requires `citation-reasons:read`
(`src/controllers/citation-reason.controller.ts:11`), the same permission bit that gates the
admin-only reason-catalog management screen. By design (`postgres/21_citation_reasons.sql`, R18/R19
of feature #9 `citation_reasons_management`), only `admin`/`rector`/`superadmin` get a
`role_permissions` row for resource `citation-reasons`. But the citation-creation dialog also calls
this same `GET` endpoint to populate its reasons dropdown, and roles that can create citations
(`inspector de apoyo`, `inspector general` — granted full `citaciones` CRUD in
`postgres/22_citations_permissions.sql`) have no `citation-reasons` row, so the dropdown 403s. The
fix is a new OR-permission middleware, `requireAnyPermission`, applied only to the `GET` route: it
succeeds when the requesting role has **any** of `citaciones:read`, `citaciones:create`, or
`citation-reasons:read`. Write operations (`POST`/`PUT`/`DELETE /api/citation-reasons`) are
untouched — they keep gating on `citation-reasons` create/update/delete only, so administering the
reasons catalog stays admin/rector/superadmin-only. No frontend or migration changes are needed.

Acceptance-criterion mapping (every bullet from the feature description is satisfied by at least one
`R<n>` below):

- "Role with `citaciones:read=true`, no `citation-reasons` row → 200" → **R7**
- "Role with `citaciones:create=true`, `citaciones:read=false`, no `citation-reasons` row → 200"
  → **R8**
- "Role with only `citation-reasons:read=true` (no `citaciones` access) keeps working as before"
  → **R9**
- "Role with no `citaciones` and no `citation-reasons` permission → still 403" → **R10**
- "POST/PUT/DELETE still require citation-reasons create/update/delete respectively, unchanged,
  admin/rector/superadmin-only" → **R11, R12, R13**
- "Superadmin bypass unaffected" → **R3, R14**

## New middleware — `requireAnyPermission`

## R1

The system SHALL provide a new middleware factory `requireAnyPermission` in
`src/middleware/role.middleware.ts`, exported alongside the existing `requirePermission`, that
accepts an array of `{ resource: string; action: Action }` checks (`Action` is the existing
`'read' | 'create' | 'update' | 'delete'` union) and returns an Express middleware granting access
if the requesting role satisfies **at least one** of the listed checks.

## R2

WHEN `req.user` is not set on a request handled by `requireAnyPermission`, the system SHALL respond
`401` with body `{ error: 'No autenticado' }` (matching `requirePermission`'s existing shape) and
SHALL NOT query `role_permissions`.

## R3

WHEN `req.user.roleName === 'superadmin'` on a request handled by `requireAnyPermission`, the system
SHALL call `next()` immediately, without querying `role_permissions` (mirrors `requirePermission`'s
existing superadmin bypass).

## R4

WHEN the requesting role has a `role_permissions` row for at least one of the checks' `resource`
values whose column for that check's `action` (`can_read`/`can_create`/`can_update`/`can_delete`)
is `TRUE`, `requireAnyPermission` SHALL call `next()`.

## R5

IF the requesting role has, for every check in the list, either no `role_permissions` row for that
check's `resource` or a `FALSE` value in that check's `action` column, THEN `requireAnyPermission`
SHALL respond `403` with body `{ error: 'Sin permisos para este recurso' }` and SHALL NOT call
`next()`.

## Route wiring

## R6

The system SHALL change the `GET /api/citation-reasons` route handler in
`src/controllers/citation-reason.controller.ts` from `requirePermission('citation-reasons', 'read')`
to `requireAnyPermission([{ resource: 'citaciones', action: 'read' }, { resource: 'citaciones',
action: 'create' }, { resource: 'citation-reasons', action: 'read' }])`.

## Behavior — new access paths

## R7

WHEN the requesting role has a `role_permissions` row `resource = 'citaciones', can_read = TRUE`
and has no `role_permissions` row for `resource = 'citation-reasons'`, `GET /api/citation-reasons`
SHALL respond `200` with the JSON array from `citation-reason.service.findAll`.

## R8

WHEN the requesting role has a `role_permissions` row `resource = 'citaciones', can_create = TRUE,
can_read = FALSE` and has no `role_permissions` row for `resource = 'citation-reasons'`,
`GET /api/citation-reasons` SHALL respond `200`.

## Behavior — unchanged access paths

## R9

WHEN the requesting role has a `role_permissions` row `resource = 'citation-reasons', can_read =
TRUE` and has no `role_permissions` row for `resource = 'citaciones'`, `GET /api/citation-reasons`
SHALL respond `200` (regression: the pre-existing admin/rector/superadmin path keeps working
unchanged).

## R10

IF the requesting role has no `role_permissions` row for `resource = 'citaciones'` (or has one with
both `can_read = FALSE` and `can_create = FALSE`) AND no `role_permissions` row for `resource =
'citation-reasons'` with `can_read = TRUE`, THEN `GET /api/citation-reasons` SHALL respond `403`.

## Write operations — unchanged

## R11

`POST /api/citation-reasons` SHALL continue to require `requirePermission('citation-reasons',
'create')`, unchanged by this feature.

## R12

`PUT /api/citation-reasons/:id` SHALL continue to require `requirePermission('citation-reasons',
'update')`, unchanged by this feature.

## R13

`DELETE /api/citation-reasons/:id` SHALL continue to require `requirePermission('citation-reasons',
'delete')`, unchanged by this feature.

## Superadmin bypass

## R14

WHEN `req.user.roleName === 'superadmin'` requests `GET /api/citation-reasons`, the system SHALL
respond `200` regardless of any `role_permissions` rows for that role (bypass unaffected by this
feature, exercised through the route, not just the middleware unit — covers R3 end-to-end).

## Build

## R15

WHEN the implementation is complete, the system SHALL compile under `pnpm run build` with exit code
`0`, introducing no new TypeScript errors attributable to `src/middleware/role.middleware.ts` or
`src/controllers/citation-reason.controller.ts`.

## Manual verification

## R16

WHEN the implementation of R1–R14 is complete, the system SHALL be verified by a manual smoke test
documented in `progress/impl_citation_reasons_read_access_follows_citation_permission.md`, covering
at minimum: (i) `GET /api/citation-reasons` as a role with `citaciones:read=true` and no
`citation-reasons` row (e.g. `inspector de apoyo` or `inspector general`) → `200`; (ii) the same
call as a role with `citaciones:create=true, citaciones:read=false` and no `citation-reasons` row
→ `200`; (iii) the same call as a role with only `citation-reasons:read=true` and no `citaciones`
access (e.g. `admin`/`rector`/`superadmin`, or a temporary test role if none of the seeded roles
isolates this combination) → `200`; (iv) the same call as a role with neither permission → `403`;
(v) `POST`, `PUT /:id`, and `DELETE /:id` on `/api/citation-reasons` as a role with `citaciones`
full access but no `citation-reasons` row (e.g. `inspector de apoyo`) → `403` on all three,
confirming write operations did not pick up the OR-permission relaxation; (vi) `GET
/api/citation-reasons` as a superadmin → `200`. Each case's actual request/response SHALL be
captured verbatim in that file's Traceability section, along with any temporary `role_permissions`
rows inserted for the test and confirmation they were reverted afterward.
