# Review — feature 13 citation_attachments_retrieval

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json` and `harness.db` present; all four docs (`docs/architecture.md`,
  `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md`) on disk with content; `./init.sh`
  exits 0 (regenerated `state/` snapshot, mirror-sync is best-effort and skipped per
  `[WARN] No verify_command configured`).
- C2: [x] — exactly one `in_progress` feature (#13); the open session #21 reflects the
  current implementer work (matches `progress/impl_citation_attachments_retrieval.md`). No
  stale leftover sessions. Note: the project has no automated test framework (per
  `docs/conventions.md` and `CHECKPOINTS.md` C4 itself, line 29), and feature #10 set the
  precedent that "passing tests" for sdd=1 features is satisfied by `pnpm run build` + live
  SQL verification — applied consistently here.
- C3: [x] — only `src/services/citation.service.ts` changed. No new top-level `src/` folder,
  no new dependency added, no controller logic moved into the service. The diff is a
  textbook additive change to a service module: new `attachments` correlated subquery in
  `CITATION_FIELDS_SQL`, same subquery added inside `findRoster`'s nested `json_build_object`,
  two-level `.map()` post-processing mirroring `justification.service.ts#findAll`. No
  `console.log`/TODO/intentional debug artifacts.
- C4: [x] (per the project's no-test-framework convention) — `pnpm run build` from
  `backend/` exits 0 with no TypeScript diagnostics. Static diff against
  `specs/citation_attachments_retrieval/design.md` is byte-for-byte identical for both SQL
  fragments and both `.map()` blocks (see "Static diff" below). Live re-verification via
  `docker exec postgres psql` against the running DB (see "Live verification") returns the
  expected JSON shape for citation 8 (2 attachments), citation 9 (1 attachment), citations
  10–13 (`[]` empty array, never null), and citation 7 (2 attachments).
- C5: [x] (will be satisfied by `log-out`) — session #21 is still open at review time, but
  this checkpoint fires at log-out, not at approval. No stray untracked files in
  `backend/` (`git status` shows only the one expected modification and the
  `state/features/*.md` / `state/sessions/*.md` regenerations the snapshot step produces;
  `progress/impl_citation_attachments_retrieval.md`, `specs/citation_attachments_retrieval/`,
  `.claude/`, `.codex/`, `scripts/` are all session-harness artifacts that the leader
  added on session open and that the session-closure step handles).
- C6: [x] — `specs/citation_attachments_retrieval/{requirements.md,design.md,tasks.md}`
  all exist. `requirements.md` uses EARS syntax (`WHEN ... SHALL`, `IF ... THEN ... SHALL`)
  with stable `R1`–`R9` ids. Each `R<n>` was verified directly by the reviewer against the
  code in `citation.service.ts`:
  - **R1, R2** — re-ran the exact `CITATION_FIELDS_SQL` against the live DB filtered to
    `enrollment_id = 2`; citation 8 returned `[{"id":7,"fileName":...,"originalName":...,
    "mimeType":...,"createdAt":...}, {"id":8,...}]` in ascending `createdAt` order. The
    COALESCE to `'[]'` is present in the SQL, and citations 1 and 4 (also in
    enrollment 2) would return `[]` per the same query (verified by the column-level
    structure of the row returned). R2 is demonstrated by the roster-mode run below,
    where citations 10–13 return `"attachments" : []` literally.
  - **R3, R4** — re-ran the exact `findRoster` SQL against `course_id=3,
    academic_year_id=1, enrollment_id=58`; the citations array for enrollment 58 shows
    `attachments: [{...}]` on citations 7 and 9, and `"attachments" : []` on citations
    10–13. Empty array, never null.
  - **R5** — diff is purely additive. `id`, `dateFrom`, `dateTo`, `time`, `status`,
    `observations`, `closedAt`, `closedByUserId`, `createdByUserId`, `createdAt`,
    `reasonIds` are all present and unchanged in both query paths. No field renamed,
    no field removed, no value type changed. Pre-existing fields in the live DB query
    match the implementer's T8 side-by-side table.
  - **R6, R7** — `git diff backend/src/controllers/citation.controller.ts` is empty.
    `addAttachments` and `removeAttachment` in `citation.service.ts` (lines 209–227 of
    the new file) are byte-for-byte identical to the pre-change version (same
    `findOwned` precondition, same 5-field `attRepo().save`, same `attachmentUrl` mapping
    in the response, same `fs.unlink(...)` on delete, same 404 path for cross-citation
    delete). The `ALLOWED_MIME` list, multer `limits: { fileSize: 8MB, files: 5 }`, and
    `fileFilter` in the controller (lines 19–35) are also untouched.
  - **R8, R9** — the new SQL is a correlated subquery against `citation_attachments` at
    query time (no caching layer), so a row written by `POST /:id/attachments` is visible
    on the very next `GET`. Verified `citation_attachments` has no `deleted_at` column
    (`\d citation_attachments` shows columns `id, citation_id, file_name, original_name,
    mime_type, created_at` only), so the design.md discarded-alternative #3 rationale is
    correct: `removeAttachment` hard-deletes (`attRepo().remove(att)`) and a removed row
    is simply absent from the correlated subquery result.

## Verification performed (the reviewer's own, not the implementer's prose)

### Static diff

- `git diff --stat` against HEAD: `backend/src/services/citation.service.ts | 32
  +++++++++++++++++++++++++++++---  1 file changed, 29 insertions(+), 3 deletions(-)`.
  This is a discrepancy with the handoff doc (which claims 36 insertions / 3 deletions in
  its T5 section). The actual code is correct and matches `design.md` byte-for-byte; the
  handoff's count is wrong. Flagged under "Notes" below — not blocking.
- `CITATION_FIELDS_SQL` (new file lines 18–35) is character-identical to `design.md`
  lines 23–42: same `COALESCE(... json_agg(json_build_object(...)) ORDER BY att.created_at ASC)
  ... '[]') AS "attachments"` subquery, same alias quoting, same trailing comma after
  `"reasonIds"`.
- `findRoster`'s nested `'attachments', COALESCE(...)` block (new file lines 95–101) is
  character-identical to `design.md` lines 95–107: same keys, same `ORDER BY att.created_at
  ASC`, same trailing comma placement inside the `json_build_object`.
- The trailing two-level `.map()` (new file lines 111–117 / 134–137) is character-identical
  to `design.md` lines 117–123 / 65–69: same `attachmentUrl(a.fileName)` resolution using
  the existing helper (defined at line 16 of the same file, unchanged since feature #10).

### Live verification (re-executed by reviewer)

Re-ran the EXACT `CITATION_FIELDS_SQL` from the new file directly against the live
`postgres` container at `localhost:5432`:

```
SELECT c.id, ...,
       COALESCE((SELECT json_agg(json_build_object(
         'id', att.id, 'fileName', att.file_name, 'originalName', att.original_name,
         'mimeType', att.mime_type, 'createdAt', att.created_at
       ) ORDER BY att.created_at ASC)
       FROM citation_attachments att WHERE att.citation_id = c.id), '[]') AS "attachments"
FROM citations c WHERE c.enrollment_id = 2 AND c.deleted_at IS NULL
ORDER BY c.date_from DESC;
```

Result (verbatim, citation 8 row, columns compressed to one line):

```
id | ... | reasonIds | attachments
 8 | ... | [8]       | [{"id" : 7, "fileName" : "8-1788581231034-288012157.jpg",
                       "originalName" : "valid.jpg", "mimeType" : "image/jpeg",
                       "createdAt" : "2026-09-05T04:07:11.072858+00:00"},
                      {"id" : 8, "fileName" : "8-1788581231035-825059554.pdf",
                       "originalName" : "test.pdf", "mimeType" : "application/pdf",
                       "createdAt" : "2026-09-05T04:07:11.072858+00:00"}]
```

R1 satisfied (2 attachments with all required fields, ascending `createdAt`); R2 empty-array
case shown below in the roster query.

Re-ran the EXACT `findRoster` nested subquery against the live DB filtered to enrollment
58 (which has citations 7, 9, 10, 11, 12, 13):

```
SELECT json_agg(json_build_object('id', c.id, ..., 'attachments', COALESCE((
  SELECT json_agg(json_build_object('id', att.id, 'fileName', att.file_name,
    'originalName', att.original_name, 'mimeType', att.mime_type, 'createdAt', att.created_at)
   ORDER BY att.created_at ASC)
  FROM citation_attachments att WHERE att.citation_id = c.id), '[]')
) ORDER BY c.date_from DESC)
FROM citations c WHERE c.enrollment_id = 58 AND c.deleted_at IS NULL;
```

Result (compressed, six citation objects):

```
[{"id" : 9,  ..., "attachments" : [{"id" : 9, "fileName" : "9-...png", ...}]},
 {"id" : 10, ..., "attachments" : []},
 {"id" : 11, ..., "attachments" : []},
 {"id" : 12, ..., "attachments" : []},
 {"id" : 13, ..., "attachments" : []},
 {"id" : 7,  ..., "attachments" : [{"id" : 5, "fileName" : "7-...jpg", ...},
                                    {"id" : 6, "fileName" : "7-...pdf", ...}]}]
```

R3 satisfied (every citation in the roster carries `attachments`); R4 satisfied (citations
10–13 show literal `"attachments" : []`, never null, never omitted); R8 satisfied (the
correlated subquery picks up existing rows 5, 6, 7, 8, 9 — visible because no caching
layer between service and DB).

### Schema check for R9 rationale

`\d citation_attachments` on the live DB shows columns `id, citation_id, file_name,
original_name, mime_type, created_at` only — **no `deleted_at` column**, confirming the
design.md discarded-alternative #3 rationale: hard-delete via `attRepo().remove(att)` is
the only path, so a removed row is gone from the table and the correlated subquery cannot
return it.

## Notes (informational, not blocking)

1. **Handoff doc stat discrepancy.** `progress/impl_citation_attachments_retrieval.md` line
   71–73 claims `36 insertions(+), 3 deletions(-)`, but the actual `git diff --stat` shows
   `29 insertions(+), 3 deletions(-)`. The code itself matches `design.md` byte-for-byte;
   the handoff's diff-stat block is wrong (possibly a hand-counted estimate from when the
   diff included extra blank lines or comment additions). Not a code defect — surface for
   transparency. No fix needed for approval.

2. **camelCase forward-looking risk (carry-through from `design.md`'s "Flagged for the
   human reviewer").** The implementation uses `fileName`, `originalName`, `mimeType`
   (camelCase) per the approved `design.md`, but `requirements.md` R1's literal field list
   says `file_name, original_name, mime_type` (snake_case). Ricardo approved the spec as
   written (camelCase interpretation), and the leader's instructions explicitly say to
   NOT mark this as CHANGES_REQUESTED unless I find concrete breakage. I find none: the
   SQL subquery passes those keys as camelCase JSON keys (postgres preserves them verbatim
   inside `json_build_object`), and there is no frontend code in this backend repo to
   cross-check against. The frontend `citation_evidence_reload` consumer (mentioned in
   `design.md` as the expected downstream feature) will be the ground-truth check on
   whether this was the right call. Per the leader's instructions, leaving as
   approved-as-is.

3. **No live HTTP smoke was performed.** The leader's instructions acknowledged this is
   impractical (the worktree's `docker-compose.yml` is byte-identical to the user's main
   running stack and cannot bring up an isolated stack without colliding with the running
   `backend`, `postgres`, `redis` containers — confirmed by `docker ps` showing the main
   stack's containers with the same names, ports, and `Up` durations of days/hours). The
   SQL-level re-verification above is the deepest verification practical in this
   environment, and the implementer's documented limitation in
   `progress/impl_citation_attachments_retrieval.md` ("Smoke-test execution limitation")
   stands.

## Required Changes

None. The code, the build, the live DB verification, and the spec traceability all line up.
