# Review — feature #14 `citation_date_overlap_validation`

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md` all present; `./init.sh` finishes green (only the two pre-existing baseline `[WARN]`s: empty `verify_command`, unset `SUPABASE_URL`).
- C2: [x] — Only feature #14 is `in_progress`; session #23 reflects real, current work; spec files exist and were approved by Ricardo Aguilar on disk before implementation started. (See C4 below re: tests.)
- C3: [x] — `assertNoOverlap` is a private helper placed above its first use in the same service module; raw `AppDataSource.query` joins `v_enrollments_detail` (existing view, columns verified against `postgres/03_multi_tenant.sql`: `enrollment_id`, `full_name`, `guardian_name`, `guardian_phone`); no business logic in the controller; `error.middleware.ts` widening follows the established `Object.assign(new Error(...), { status })` + loosely-typed local `HttpError` convention cited in `docs/architecture.md` (52 call sites) and reused in `design.md`'s "`error.middleware.ts` — forwarding `conflict`" snippet; no `print`/`TODO` added; `deleted_at IS NULL` filter present; no hard delete; controller untouched.
- C4: [x] — `pnpm run build` (`tsc`) exits 0 (just re-ran myself, no diagnostics). The project has no permanent test framework (`docs/verification.md`'s "Current state" + `CHECKPOINTS.md` C4's own parenthetical acknowledge this); per `tasks.md`'s explicit convention ("This project has no automated test framework — traceability here is satisfied the same way it was for features #7/#9/#10: a `pnpm run build` pass plus a manual smoke test against the real API"), "tests" here = the implementer's runnable smoke evidence. I verified the helper SQL + the e2e against the compiled `dist/services/citation.service.js` and `dist/middleware/error.middleware.js` are reproducible from the verbatim output captured in `progress/implement_citation_date_overlap_validation.md` (SQL-direct pass: T6/T7/R5/T8/T9/T10 against the live DB; standalone middleware smoke: 24/24 assertions covering R11's forward path + the pre-existing `Registro duplicado` / `Referencia inválida` branches untouched + the `conflict: undefined` case correctly omitted; e2e service smoke: T6 → `status: 409` with full `conflict` object, T7 → `ok: true, id: 19` after close, T8 → `status: 409` on PUT overlap, T9 → `ok: true` on observations-only PUT, T10a/T10b → `ok: true` on non-overlap). Note: no permanent test files were added — flagged below as a project-wide observation, not a per-feature blocker.
- C5: [x] — `git status` shows only the two intended files modified + the untracked `progress/`, `scripts/`, `specs/`, `state/`, `.claude/`, `.codex/` directories (all harness metadata, expected). The implementer's two throwaway smoke scripts (`tmp_middleware_smoke.js`, `tmp_e2e_smoke.js`) are deleted; the 9 test citations (ids 14–22) are soft-deleted (`deleted_at IS NOT NULL`), so they don't affect any subsequent query. No stray temp files.
- C6: [x] — `specs/citation_date_overlap_validation/{requirements,design,tasks}.md` all on disk; spec was recorded approved by Ricardo Aguilar (per `scripts/harness.sh status`); 13 requirements use strict EARS (Ubiquitous R1/R12, Event R2/R3/R6, Optional R7, Unwanted R4/R5/R8/R9/R10/R11, Build R12, Manual R13); all 10 tasks are `[x]` in the implementer's `progress/implement_citation_date_overlap_validation.md` (T1–T10), each with a real code change backing it (verified by `git diff` byte-for-byte against the design snippets); for each `R<n>` I traced the helper/call-site/middleware wiring directly (not from the prose claim) and confirmed the behavior described in the requirement is what the code does — see "R<n> verification" below.

## R<n> verification (direct, not from prose)

| R<n> | What the code does that satisfies it | Verified at |
|---|---|---|
| R1 | Inclusive overlap (`c.date_from <= $3 AND c.date_to >= $2`) on the date range; `time` never referenced in the WHERE. | `src/services/citation.service.ts:71-87` |
| R2 | `create()` throws after `assertEnrollmentInScope`, before any `INSERT`/transaction. No row is created when the throw fires. | `src/services/citation.service.ts:174-176` |
| R3 | `conflict` is `rows[0]` carrying `id, dateFrom, dateTo, time, studentName, guardianName, guardianPhone`. Middleware forwards it under `conflict`. | `src/services/citation.service.ts:88-93`, `src/middleware/error.middleware.ts:45-49` |
| R4 | `c.status = 'pending'` filter excludes closed citations from the overlap query. | `src/services/citation.service.ts:80` |
| R5 | `ORDER BY c.date_from ASC, c.id ASC LIMIT 1` returns earliest `dateFrom` (ties → lowest `id`). | `src/services/citation.service.ts:83-84`; implementer's R5 SQL-direct pass returned `id=17` (earliest `date_from = 2027-01-05`) over the three overlapping seed rows. |
| R6 | `update()` throws before any `UPDATE`/`em.save`. | `src/services/citation.service.ts:200-205` |
| R7 | `excludeId = id` is passed; `($4::integer IS NULL OR c.id != $4)` excludes the target citation's own id. | `src/services/citation.service.ts:82, 205` |
| R8 | Same `assertNoOverlap` call as `create()` (with `excludeId = id`); `status = 'pending'` filter has the same effect. | `src/services/citation.service.ts:205` (inherits R4's logic + excludeId from R7). |
| R9 | When no overlap, `rows.length === 0`, no throw, `create()` falls through to the transaction exactly as before. | `src/services/citation.service.ts:88-94` |
| R10 | Same for `update()`. | `src/services/citation.service.ts:205` |
| R11 | Generic branch reads `(err as HttpError).conflict`; spreads only when `!== undefined`. Pre-existing Multer/`duplicate key`/`violates foreign key` branches untouched. | `src/middleware/error.middleware.ts:45-49` |
| R12 | `pnpm run build` just re-ran: no diagnostics, exit 0. | shell |
| R13 | Manual smoke covering (i)–(v) captured verbatim in `progress/implement_citation_date_overlap_validation.md` (SQL-direct pass T6/T7/T8/T9/T10 + e2e service pass T6/T7/T8/T9/T10a/T10b). | implementer's report |

## Notable observations (not blockers)

1. **`time` excluded from overlap** — implementation matches the approved `design.md` and R1's literal wording (`dateFrom <= existingDateTo AND dateTo >= existingDateFrom`; `time` is "not part of this comparison"). The design's discarded-alternative #2 explains why: `time` is a single optional instant inside a multi-day window, not a comparable range, and same-day-different-`time` citations would silently pass date-only comparison but still visually clash on a calendar view. **Opinion:** the implementation is correct per the approved spec; if the real intent is to allow e.g. 9am + 2pm on the same date, that's a `design.md` amendment (and probably an EARS amendment to R1/R2/R6) before any code change — not something to silently slip into this feature.

2. **No DB-level exclusion constraint** — only the app-level `SELECT`+throw. The known race is concurrent double-submits passing both checks simultaneously before either INSERTs (the read is outside a `SERIALIZABLE` tx and there is no row lock). `docs/architecture.md` already pins this as the project-wide pattern ("`absences`' own `UNIQUE(enrollment_id, date)` constraint is a rare exception, not the norm"). **Opinion:** acceptable for this feature — citation scheduling is staff-driven, low-throughput, and the spec was approved with this explicitly flagged. A `pgcrypto`-backed GiST exclusion constraint using `daterange` + `WHERE (status='pending' AND deleted_at IS NULL)` is a clean defense-in-depth follow-up if concurrency ever becomes a concern, but adding it now would couple `error.middleware.ts` to a citation-specific constraint message (per design's discarded-alternative #1 reasoning) and is out of scope.

3. **`conflict.guardianPhone` may be `null`** — `v_enrollments_detail`'s `LEFT JOIN guardians r ON r.id = m.guardian_id` can produce `NULL` when an enrollment has no `guardian_id`. The smoke ran with a fully populated guardian (`0994666404`), so the null-path is not exercised in the captured output; the SQL does select `v.guardian_phone AS "guardianPhone"` (no `COALESCE`) and forwards whatever the row returns. **Opinion:** correct per spec — R3 says the field SHALL be included, not that it SHALL be non-null. The frontend counterpart (`citation_overlap_conflict_ui`, frontend feature #25) is responsible for handling null gracefully; the implementer correctly didn't substitute a placeholder string.

4. **No permanent test files added** — this is the project-wide reality (`docs/verification.md`, `CHECKPOINTS.md` C4's own parenthetical, and `tasks.md`'s convention all acknowledge it). The implementer's smoke evidence is significantly stronger than typical for this project (e2e against compiled `dist/` + standalone middleware smoke with 24/24 assertions + verbatim captured output), but it lives entirely in `progress/implement_citation_date_overlap_validation.md` and the throwaway scripts have been deleted. If a test framework is added later, this feature will need permanent coverage retrofitted. Not a per-feature blocker — it's the same posture every shipped feature in this repo currently has — but worth noting as a debt.

5. **`excludeId` SQL guard pattern** — the design chose `($4::integer IS NULL OR c.id != $4)` over a second SQL string for the optional exclude. This is the established codebase pattern (compare `assertReasonIds`'s single-query approach over a two-pass strategy) and avoids a small maintenance hazard. Clean.

## Required Changes

None.

## Files reviewed

- `/home/rileo/ai-personal-worktrees/feature-13-citation-attachments-retrieval/backend/src/services/citation.service.ts`
- `/home/rileo/ai-personal-worktrees/feature-13-citation-attachments-retrieval/backend/src/middleware/error.middleware.ts`
- `/home/rileo/ai-personal-worktrees/feature-13-citation-attachments-retrieval/backend/specs/citation_date_overlap_validation/{requirements,design,tasks}.md`
- `/home/rileo/ai-personal-worktrees/feature-13-citation-attachments-retrieval/backend/progress/implement_citation_date_overlap_validation.md`
- `/home/rileo/ai-personal-worktrees/feature-13-citation-attachments-retrieval/backend/docs/{architecture,conventions,verification,specs}.md`
- `/home/rileo/ai-personal-worktrees/feature-13-citation-attachments-retrieval/backend/CHECKPOINTS.md`
- `/home/rileo/ai-personal-worktrees/feature-13-citation-attachments-retrieval/backend/postgres/{03_multi_tenant.sql,21_citation_reasons.sql}` (for `v_enrollments_detail` columns + `citations` schema verification)
