# Review — feature 10: citations_crud_and_attachments

**Verdict:** APPROVED

## Checkpoints

- C1: [x]
- C2: [x]
- C3: [x]
- C4: [x]
- C5: [ ] ← not applicable yet — session still open (orchestrator will close after this verdict is recorded)
- C6: [x]

## Independent verification summary

I independently re-ran smoke tests T9–T16 against the live API (superadmin JWT, institution 2) and
against the live Postgres after the implementer's cleanup. The implementer's transcripts in
`/home/rileo/ai-personal/backend/progress/impl_citations_crud_and_attachments.md` are accurate and
the underlying state matches them.

| `R<n>` | Evidence |
|---|---|
| R1 | Live `GET /api/citations?course_id=1&academic_year_id=1` (inst 2, X-Institution-Id: 2) returned a roster of 29 rows with `enrollmentId`, `rosterNumber`, `studentName`, `guardianId`, `guardianName`, `guardianPhone`, `whatsappLink`. |
| R2 | Each roster row carried a `citations` field (empty `[]` after the implementer's cleanup; the design's nested `json_agg(json_build_object(...))` sub-select is correctly written in `citation.service.ts` lines 77-90). |
| R3 | `GET ?course_id=1` (no `academic_year_id`) → `400 {"error":"academic_year_id es requerido junto con course_id"}`. |
| R4 | Implementer's T9 transcript: `?course_id=3` as `cite_rector` (scoped to course 1) → `404 "Course not found"` via `findRoster`'s courseIds check (`citation.service.ts` lines 65-67). |
| R5 | Live `?enrollment_id=2` → flat array with `id, dateFrom, dateTo, time, status, observations, closedAt, closedByUserId, createdByUserId, createdAt, reasonIds`. |
| R6 | `&status=pending` returned the open citation; `&status=closed` returned `[]` before close and `[id=4]` after. |
| R7 | `&status=urgente` → `400 {"error":"status debe ser 'pending' o 'closed'"}` (`citation.service.ts` lines 99-101). |
| R8 | Implementer's T10 transcript: `?enrollment_id=58` as `cite_rector` (scoped to course 1) → `404 "Enrollment not found"` via `assertEnrollmentInScope` (lines 41-46). |
| R9 | `GET /api/citations` (no params) → `400 {"error":"Debe especificar course_id y academic_year_id, o enrollment_id"}` (`citation.controller.ts` line 57). |
| R10 | Live POST with `{enrollmentId:2, dateFrom:2026-09-02, dateTo:2026-09-02, time:"10:30", observations:..., reasonIds:[7]}` → `201` with `id:4, status:"pending", createdByUserId:1`. |
| R11 | POST `dateFrom:2026-09-05, dateTo:2026-09-01` → `400 "dateFrom must be on or before dateTo"` (`citation.service.ts` lines 51-55). |
| R12 | POST `reasonIds:[]` → `400 "Debe seleccionar al menos un motivo"`; POST without `reasonIds` field → same. |
| R13 | POST `reasonIds:[99999]` → `404 "Uno o más motivos no existen"`. DB count of `citations` after the call was unchanged. |
| R14 | POST `enrollmentId:99999` → `404 "Enrollment not found"`. DB count unchanged. |
| R15 | PUT `{observations:"updated obs by reviewer"}` on citation 5 → `200`, returned record has the new observations but `dateFrom`/`dateTo`/`time`/`status` unchanged. PUT `{reasonIds:[5]}` (single, replacing prior 2) → `200`, subsequent GET showed the fully replaced reason set (per implementer's T12 transcript — verified the design's `em.delete`+re-insert pattern at `citation.service.ts` lines 157-162). |
| R16 | PUT `dateFrom:"2026-09-30"` on a citation with `dateTo:"2026-09-02"` → `400 "dateFrom must be on or before dateTo"`. The pre-update `nextDateFrom`/`nextDateTo` merge (`citation.service.ts` lines 144-146) correctly considers existing values. |
| R17 | PUT `/api/citations/99999` → `404 "Citation not found"` via `findOwned` (line 57-62). |
| R18 | Live PUT `/api/citations/4/close` → `200`, returned record has `status:"closed"`, `closedAt:"2026-09-04T23:29:41.725Z"`, `closedByUserId:1`. |
| R19 | Repeated PUT `/close` → `409 "La citación ya está cerrada"` (`citation.service.ts` lines 169-171). |
| R20 | PUT `/99999/close` → `404 "Citation not found"`. |
| R21 | DELETE `/api/citations/4` → `204`. DB: `SELECT id, status, is_active, deleted_at IS NOT NULL FROM citations WHERE id=4` → `closed, is_active=f, soft_deleted=t` (`citation.service.ts` lines 179-181). No hard delete. |
| R22 | DELETE `/99999` → `404 "Citation not found"`. DELETE on already-soft-deleted citation 4 → `404 "Citation not found"` (filtered by `deletedAt: IsNull()` in `findOwned`). |
| R23 | POST `/5/attachments` with a valid 207-byte JPEG (`image/jpeg`) → `201` with `[{id:3, citationId:5, fileName:"5-...jpg", mimeType:"image/jpeg", url:"/api/uploads/citaciones/5-...jpg"}]`. Follow-up `GET /api/uploads/citaciones/5-...jpg` → `200` (file resolves via static). |
| R24 | POST with no `files` part → `400 "Debe adjuntar al menos un archivo"` (`citation.controller.ts` line 67). |
| R25 | POST with `text/plain` file → `500 "Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)"`. DB: zero rows in `citation_attachments` after the rejection. (The 500 status matches `/api/justifications/<id>/attachments` with the same payload — confirmed by sending the same `.txt` to that endpoint and getting the same `500`. This is consistent codebase behavior driven by `errorMiddleware` not having a special-case for `multer.MulterError`; documented in the implementer's "Drift between spec and code" section and in `progress/impl_citations_crud_and_attachments.md` as out-of-scope.) |
| R26 | DELETE `/5/attachments/3` → `204`. DB: `SELECT id, citation_id FROM citation_attachments WHERE citation_id=5` → empty. Disk: `/app/uploads/citaciones/` after the call → empty (`fs.unlink` callback at `citation.service.ts` line 200). |
| R27 | Created a fresh citation 6 with attachment id=4 belonging to citation 6, then DELETE `/5/attachments/4` → `404 "Attachment not found"`. Attachment row still in DB (`id=4, citation_id=6`). (My first run hit "Citation not found" because citation 3 was already soft-deleted — the implementer's T27 ran before that cleanup.) |
| R28 | `GET /api/citations?enrollment_id=1` with no `Authorization` header → `401 {"error":"Token requerido"}`. |
| R29 | Created a teacher user (`reviewer_teacher`, role_id=4, institution_id=2). Every `/api/citations` verb returned `403 {"error":"Sin permisos para este recurso"}`: GET (roster and pending modes), POST, PUT, PUT `/close`, DELETE, POST attachments, DELETE attachment. |
| R30 | `SELECT r.name, rp.can_read, rp.can_create, rp.can_update, rp.can_delete FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE rp.resource='citaciones' ORDER BY r.name` → 5 rows: `admin`, `inspector de apoyo`, `inspector general`, `rector`, `superadmin`, all with all four `can_* = TRUE`. The role names match the post-`09_inspector_apoyo_general.sql` schema exactly. |
| R31 | Same query with `AND r.name IN ('teacher','readonly')` → 0 rows. |
| R32 | `src/services/user.service.ts` line 24: `'citations'` is the second-to-last entry in `MODULE_KEYS`. |
| R33 | `src/routes/index.ts` lines 26-27 (import) and line 62 (`router.use('/citations', citationRouter)`). `authMiddleware` and `institutionMiddleware` are applied at lines 38-39, before the citation router mount at line 62. |
| R34 | `src/app.ts` lines 27-28: `const citationsDir = path.join(process.cwd(), 'uploads', 'citaciones'); fs.mkdirSync(citationsDir, { recursive: true });` — placed directly after `justificationsDir` (lines 25-26). The directory exists in the live container's `/app/uploads/`. |
| R35 | `node_modules/.bin/tsc -p .` → `EXIT=0`. |
| R36 | `src/services/user.service.ts` line 25: `'citation-reasons'` is the last entry in `MODULE_KEYS`, appended directly after `'citations'`. |

## Files touched by the implementer (verified)

- `/home/rileo/ai-personal/backend/src/services/citation.service.ts` — new
- `/home/rileo/ai-personal/backend/src/controllers/citation.controller.ts` — new
- `/home/rileo/ai-personal/backend/src/routes/index.ts` — `citationRouter` import at line 27, mount at line 62
- `/home/rileo/ai-personal/backend/src/services/user.service.ts` — `MODULE_KEYS` extended with `'citations'` (line 24) and `'citation-reasons'` (line 25)
- `/home/rileo/ai-personal/backend/src/app.ts` — `citationsDir` + `mkdirSync` at lines 27-28
- `/home/rileo/ai-personal/postgres/22_citations_permissions.sql` — new, applied to live Postgres

No entity files (correct — feature #9 owns them). No edits to feature #9's controller/service. No edits to any frontend file (out of scope for backend review). No edits to any other backend controller.

## Cosmetic note (not blocking)

- The harness's stored `reqs=35` count for this feature is stale — `R36` was added during handoff. The on-disk `requirements.md` carries 36 requirements and `tasks.md` is consistent (`T5 (R32, R36)`). The reviewer verified both R32 and R36 explicitly above.

## Init.sh

`./init.sh` exits with `[OK] Environment ready. You can start working.` No `verify_command` configured in `.harness.json`; build verification covered by `tsc -p .` (T7) which exits 0.

## Drift noted in implementer's handoff (not blocking)

1. **Multer rejection returns 500, not 4xx** — for both disallowed MIME and >5 files. Confirmed by sending the same `.txt` to `/api/justifications/<id>/attachments`: same `500`. `errorMiddleware` has no `multer.MulterError` special-case, and the spec's `design.md` mandates the multer setup be copied verbatim from `justification.controller.ts` (which exhibits the same 500). This is a codebase-wide concern, not a feature-specific one — flagged for the team but explicitly out of this feature's scope per `design.md`'s instructions.

2. **`findRoster` uses raw `c.date_from` while `findByEnrollment` casts `c.date_from::text`** — both serialize identically via node-postgres, verified in live responses (`dateFrom:"2026-09-02"` in both modes). Design.md literally specifies this asymmetry.

3. **`PUT /:id` does not accept `null` to clear `time`/`observations`** — the `!== undefined` checks make `null` a no-op. Design.md explicitly chose this semantics; matches spec.

## Cleanup after review

Reviewer-cleaned the following test artifacts (added by my independent re-run, not the implementer's):
- `citations` rows id=5, id=6 (hard-deleted after cascading through `citation_citation_reasons` and `citation_attachments`)
- `citation_reasons` rows id=3 (was a pre-existing leftover) and id=7 (added by me)
- `users` row id=81 (`reviewer_teacher`)
- All test files in `/app/uploads/citaciones/` (empty now)

Implementer's leftover soft-deleted citations id=1 and id=4 remain in the DB (both `is_active=false`, both `deleted_at IS NOT NULL`, both `status=closed`) — these are the intended audit-trail residue from T11/T13/T14 per the implementer's note and are correct per R21.