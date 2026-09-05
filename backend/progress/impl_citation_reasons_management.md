# Implementer handoff — Feature 9: citation_reasons_management

## Outcome

Implemented end-to-end and self-verified green. Feature ready for reviewer.

## Scope

Created the four tables for the citaciones module (citation_reasons, citations,
citation_citation_reasons, citation_attachments) in a single migration, the four
matching TypeORM entities, plus the full CRUD API (`GET/POST/PUT/DELETE /api/citation-reasons`)
for `citation_reasons` only — the other three tables are intentionally left without
service/controller in this feature (they belong to feature #10
`citations_crud_and_attachments`, which depends on this migration having landed).

## Files changed

### New
- `/home/rileo/ai-personal/postgres/21_citation_reasons.sql` — migration (T1)
- `/home/rileo/ai-personal/backend/src/entities/CitationReason.ts` (T2)
- `/home/rileo/ai-personal/backend/src/entities/Citation.ts` (T2)
- `/home/rileo/ai-personal/backend/src/entities/CitationCitationReason.ts` (T2)
- `/home/rileo/ai-personal/backend/src/entities/CitationAttachment.ts` (T2)
- `/home/rileo/ai-personal/backend/src/services/citation-reason.service.ts` (T4)
- `/home/rileo/ai-personal/backend/src/controllers/citation-reason.controller.ts` (T5)

### Edited
- `/home/rileo/ai-personal/backend/src/data-source.ts` — registered 4 new entities (T3)
- `/home/rileo/ai-personal/backend/src/routes/index.ts` — mounted `citationReasonRouter`
  at `/citation-reasons` in the standard authenticated block (T6)

## R<n> → task/test traceability

| Req   | Covered by | Test evidence |
|-------|------------|---------------|
| R1    | T1, T8     | `\d citation_reasons`/`\d citations`/`\d citation_citation_reasons`/`\d citation_attachments` in T8 output below confirms all 4 tables created |
| R2    | T1, T8     | `citation_reasons` column list in T8 dump (id/institution_id/name/severity/description/is_active/deleted_at/created_at/updated_at + UNIQUE(institution_id, name) + CHECK severity) |
| R3    | T1, T8     | `citations` column list in T8 dump (all required incl. CHECK status IN ('pending','closed'), default 'pending') |
| R4    | T1, T8     | `citation_citation_reasons` column list in T8 dump (UNIQUE(citation_id, citation_reason_id)) |
| R5    | T1, T8     | `citation_attachments` column list in T8 dump (file_name/original_name/mime_type) |
| R6    | T2, T3     | 4 entities on disk match DDL column-for-column; data-source.ts entities array includes all 4. Build passes. |
| R7    | T4, T5, T9 | Smoke test (i) GET on empty inst → `200 []`, (ii.2) after insert GET returns the row ordered by name. |
| R8    | T4, T5, T9 | (ii.1) POST with name/severity/description → `201` with created record. |
| R9    | T4, T5, T9 | (iii.1) POST blank name (`"   "`) → `400 "El nombre del motivo no puede estar vacío"`. (iii.2) DB count stays 0. |
| R10   | T4, T5, T9 | (iv) POST severity `"urgente"` → `400 "severity debe ser uno de: low, medium, high"`. |
| R11   | T4, T9     | (v) POST duplicate name in same institution → `409 "Registro duplicado"` (auto-mapped from PG `duplicate key` by errorMiddleware). DB count confirms no extra row inserted. |
| R12   | T4, T5, T9 | (vi) PUT only `description` → `200`, `name`/`severity` unchanged in the response. |
| R13   | T4, T5, T9 | (viii.1) PUT soft-deleted id → `404`. (viii.3) PUT non-existent id → `404`. (viii.4) PUT id from another institution → `404`. |
| R14   | T4, T5, T9 | (vii) DELETE → `204`; DB shows `deleted_at IS NOT NULL` and `is_active = false`; subsequent GET no longer lists it. |
| R15   | T4, T5, T9 | (viii.2) DELETE already soft-deleted id → `404`. (viii confirmed all three fail paths). |
| R16   | T5, T6, T9 | (ix) GET with no `Authorization` header → `401 "Token requerido"`. `authMiddleware` is applied to the whole block in `routes/index.ts`. |
| R17   | T5, T6, T8, T9 | (x) teacher role (no `role_permissions` row for `citation-reasons`) → `403 "Sin permisos para este recurso"` on every verb (GET/POST/PUT/DELETE). T8 SELECT confirms only admin/rector/superadmin have rows. |
| R18   | T1, T8     | T8 SELECT: rows for role_id=1/2/11 (admin/rector/superadmin), all four `can_*` flags `TRUE`. |
| R19   | T1, T8     | T8 SELECT: exactly 3 rows for `citation-reasons` resource, none for `inspector`/`teacher`/`readonly` (whose role_id matches no result in the seed INSERT). |
| R20   | T6         | `routes/index.ts` mount point, inside the `router.use(authMiddleware); router.use(institutionMiddleware);` block, alongside the other resource routers. |
| R21   | T3, T7     | `tsc -p .` exit 0. |

## Verification — how it was run

- `pnpm` not available in this environment; ran `node_modules/.bin/tsc -p .` directly.
- `docker compose build backend --no-cache` (image rebuild needed because the
  container's `/app/dist` is baked at image build time, not bind-mounted — only
  `/app/src` is bind-mounted via `docker-compose.override.yml`, so changes to
  `src/` alone would not have been picked up; the new entities/service/controller
  needed the full image rebuild + container recreate).
- `docker compose up -d backend` recreated the container against the new image.
- `POST /api/auth/login` as `superadmin` (Admin2026!) → JWT (institution_id=null).
  Subsequent requests passed `X-Institution-Id: 1` so the institution-scoped reads
  have a real institution to filter on.
- Smoke test user `smoke_teacher` was inserted directly into Postgres with role_id=4
  (teacher) and authenticated through the real `/api/auth/login` endpoint to obtain
  a JWT carrying `roleName='teacher'`. Cleaned up after the smoke test
  (`DELETE FROM users WHERE username='smoke_teacher'`).

## T8 evidence — migration applied and schema verified

```
SET
CREATE TABLE                            -- citation_reasons
CREATE INDEX                            -- idx_citation_reasons_institution
CREATE TABLE                            -- citations
CREATE INDEX                            -- idx_citations_institution
CREATE INDEX                            -- idx_citations_enrollment
CREATE TABLE                            -- citation_citation_reasons
CREATE INDEX                            -- idx_citation_citation_reasons_citation
CREATE INDEX                            -- idx_citation_citation_reasons_reason
CREATE TABLE                            -- citation_attachments
CREATE INDEX                            -- idx_citation_attachments_citation
INSERT 0 3                              -- role_permissions seed
```

`\d citation_reasons` — full output captured:

```
                                       Table "attendance.citation_reasons"
     Column     |           Type           | Collation | Nullable |                   Default
----------------+--------------------------+-----------+----------+----------------------------------------------
 id             | integer                  |           | not null | nextval('citation_reasons_id_seq'::regclass)
 institution_id | integer                  |           | not null |
 name           | character varying(150)   |           | not null |
 severity       | character varying(10)    |           | not null |
 description    | text                     |           |          |
 is_active      | boolean                  |           | not null | true
 deleted_at     | timestamp with time zone |           |          |
 created_at     | timestamp with time zone |           | not null | now()
 updated_at     | timestamp with time zone |           | not null | now()
Indexes:
    "citation_reasons_pkey" PRIMARY KEY, btree (id)
    "citation_reasons_institution_id_name_key" UNIQUE CONSTRAINT, btree (institution_id, name)
    "idx_citation_reasons_institution" btree (institution_id)
Check constraints:
    "citation_reasons_severity_check" CHECK (severity::text = ANY (ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying]::text[]))
Foreign-key constraints:
    "citation_reasons_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id)
Referenced by:
    TABLE "citation_citation_reasons" CONSTRAINT "citation_citation_reasons_citation_reason_id_fkey" FOREIGN KEY (citation_reason_id) REFERENCES citation_reasons(id)
```

`\d citations`, `\d citation_citation_reasons`, `\d citation_attachments` outputs
are not pasted here for brevity but each column list matches design.md's DDL
exactly, including the two NOT NULL `CHECK` constraints on `citations.status` and
the `UNIQUE(citation_id, citation_reason_id)` constraint on the pivot table.

T8 SELECT role_permissions:

```
 role_id |     resource     | can_read | can_create | can_update | can_delete
---------+------------------+----------+------------+------------+------------
       1 | citation-reasons | t        | t          | t          | t         -- admin
       2 | citation-reasons | t        | t          | t          | t         -- rector
      11 | citation-reasons | t        | t          | t          | t         -- superadmin
(3 rows)
```

Total row count: `3` — matching exactly the three roles in the `WHERE name IN (...)`
clause of the migration's seed INSERT. `SELECT id, name FROM roles WHERE id IN (1, 2, 11)`
returned `admin`, `rector`, `superadmin`. `teacher` (id=4) and `readonly` (id=5) get no row.

(`inspector` does not exist in the `roles` table at the moment — there is no row by
that name, so R19 is trivially satisfied; design.md's R19 wording — "in particular:
inspector, teacher, and readonly get no row" — is upheld for the two roles that
actually exist in this DB.)

## T9 evidence — smoke test (verbatim request/response, abbreviated headers)

### (i) GET on empty institution

```
GET /api/citation-reasons
X-Institution-Id: 1
HTTP/1.1 200
[]
```

### (ii) POST valid + repeat GET

```
POST /api/citation-reasons
{ "name":"Retraso reiterado", "severity":"low", "description":"Tres atrasos consecutivos" }
HTTP/1.1 201
{ "id":1, "institutionId":1, "name":"Retraso reiterado", "severity":"low",
  "description":"Tres atrasos consecutivos", "isActive":true, "deletedAt":null,
  "createdAt":"...", "updatedAt":"..." }

GET /api/citation-reasons (repeat)
HTTP/1.1 200
[ { "id":1, "name":"Retraso reiterado", ... } ]
```

### (iii) POST blank name → 400, no row

```
POST /api/citation-reasons
{ "name":"   ", "severity":"medium" }
HTTP/1.1 400
{ "error":"El nombre del motivo no puede estar vacío" }

DB SELECT COUNT(*) FROM citation_reasons WHERE name='   ' OR TRIM(name)=''
  → 0   (no row inserted)
```

### (iv) POST invalid severity → 400

```
POST /api/citation-reasons
{ "name":"Falta leve", "severity":"urgente" }
HTTP/1.1 400
{ "error":"severity debe ser uno de: low, medium, high" }
```

### (v) POST duplicate name in same institution → 409 (DB UNIQUE → errorMiddleware)

```
POST /api/citation-reasons
{ "name":"Retraso reiterado", "severity":"high" }
HTTP/1.1 409
{ "error":"Registro duplicado",
  "detail":"duplicate key value violates unique constraint \"citation_reasons_institution_id_name_key\"" }

DB SELECT COUNT(*) FROM citation_reasons WHERE institution_id=1 AND name='Retraso reiterado' AND deleted_at IS NULL
  → 1   (no duplicate inserted)
```

### (vi) PUT only description → 200, name/severity untouched

```
PUT /api/citation-reasons/1
{ "description":"Actualizado: dos atrasos consecutivos" }
HTTP/1.1 200
{ "id":1, "name":"Retraso reiterado", "severity":"low",
  "description":"Actualizado: dos atrasos consecutivos", "isActive":true,
  "deletedAt":null, "createdAt":"...", "updatedAt":"...+26s" }
```

### (vii) DELETE soft-deletes the row, not hard delete

```
DELETE /api/citation-reasons/1
HTTP/1.1 204

GET /api/citation-reasons (repeat)
HTTP/1.1 200
[]

DB row state for id=1:
  id |       name        | soft_deleted | is_active
----+-------------------+--------------+-----------
  1 | Retraso reiterado | t            | f
```

### (viii) PUT/DELETE against soft-deleted / non-existent / other-institution → 404

```
PUT /api/citation-reasons/1           (soft-deleted)
HTTP/1.1 404  { "error":"Motivo de citación no encontrado" }

DELETE /api/citation-reasons/1        (soft-deleted)
HTTP/1.1 404  { "error":"Motivo de citación no encontrado" }

PUT /api/citation-reasons/99999       (non-existent)
HTTP/1.1 404  { "error":"Motivo de citación no encontrado" }

PUT /api/citation-reasons/1  with X-Institution-Id: 2   (other institution)
HTTP/1.1 404  { "error":"Motivo de citación no encontrado" }
```

### (ix) No Authorization → 401

```
GET /api/citation-reasons   (no Authorization header)
HTTP/1.1 401  { "error":"Token requerido" }
```

### (x) Teacher role (no permission row) → 403 on every verb

A smoke_teacher user was inserted (role_id=4, institution_id=1) and logged in
through the real `/api/auth/login` endpoint to obtain a JWT carrying
`roleName="teacher"` and `roleId=4`.

```
GET    /api/citation-reasons       HTTP/1.1 403  { "error":"Sin permisos para este recurso" }
POST   /api/citation-reasons       HTTP/1.1 403  { "error":"Sin permisos para este recurso" }
PUT    /api/citation-reasons/1     HTTP/1.1 403  { "error":"Sin permisos para este recurso" }
DELETE /api/citation-reasons/1     HTTP/1.1 403  { "error":"Sin permisos para este recurso" }
```

User `smoke_teacher` was `DELETE`d from the `users` table after the test.

## Flagged for the reviewer

1. **`build_command` rebuild needed in this environment.** Because the running
   `backend` container was started from the image (not live-mounted `dist/`), any
   `src/` change requires `docker compose build backend` + `docker compose up -d
   backend` to take effect — `tsc -p .` on the host alone is not enough to make
   the running stack see the new code. Verified by rebuilding the image once
   after creating the entities/service/controller (otherwise the route returned
   `404 Cannot GET /api/citation-reasons`, the standard Express fallback when
   no route matches). Worth noting because the same gotcha will recur on any
   feature that touches controller wiring under this compose layout.

2. **Unused `_courseIds` parameter.** Per design.md's "Discarded alternatives"
   §3, the service functions take a `_courseIds` parameter purely for signature
   parity with `absence.service.ts`. The spec flagged this for human review
   before implementation. The code follows the spec literally — happy to drop
   the parameter on review feedback if Ricardo prefers the `quarter.service.ts`
   institution-only shape (smaller surface, no unused-noise at the controller
   boundary).

3. **`inspector` role not present in `roles` table.** R19's mention of `inspector`
   is vacuously satisfied today (no such role row exists in this DB), but the
   migration's seed `INSERT ... WHERE name IN ('admin','rector','superadmin')`
   would still skip that role name if/when it's added. No code change needed
   either way — just calling it out so the reviewer can confirm against the
   current `roles` table state (admin=1, rector=2, teacher=4, readonly=5,
   superadmin=11).

## What the reviewer should look at first

- `postgres/21_citation_reasons.sql` — confirm the schema exactly matches the
  spec (whitespace aside); this is the irreversible part of the feature.
- The R17/R19 coverage proof (T8 SELECT) — only the three intended roles got
  `role_permissions` rows for `citation-reasons`.
- The controller's per-route `requirePermission` (`citation-reasons`, action) —
  one line per verb, mirroring `absence.controller.ts`.
- The service's `assertValidName`/`assertValidSeverity` (R9/R10 client-side
  guards) and `findOwned` (R13/R15 row-scope guard).
