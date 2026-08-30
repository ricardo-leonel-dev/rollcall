---
session_id: 9
feature: backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados
agent: leader -> implementer (MiniMax-M3)
started_at: 2026-08-29T20:57:21.000Z
closed_at: 2026-08-29T21:12:28.000Z
---

## Plan
- T1: add postgres/19_quarters_softdelete_legacy_null_dates.sql and apply+verify via docker exec psql
- T2: controller presence checks in POST (== null) and PUT (=== null)
- T3: assertValidDates helper in quarter.service.ts
- T4: wire assertValidDates into create and update
- T5-T7: live smoke tests (POST/PUT/GET/export + non-regression)
- T8: tsc build + ./init.sh
- Write progress/impl_backend_rechaza_... with traceability R1-R9

## Log
- T1: added postgres/19_quarters_softdelete_legacy_null_dates.sql; applied to dev DB (UPDATE 1 on seeded legacy row id=96), R2 post-condition count=0, re-apply UPDATE 0 (idempotent), name/sequence_number/academic_year_id preserved, dated control row id=9 untouched
- T2-T4: controller POST (== null) + PUT (=== null) presence guards; new private assertValidDates helper after assertNoOverlap; called from create (after assertValidName, before assertWithinAcademicYear) and from update (post-merge range). tsc --noEmit exits 0
- T5-T8: live smoke tests against running stack (backend rebuilt) — POST missing/partial/null dates -> 400 (5 variants), PUT explicit null -> 400 + row unchanged, legacy null-dated row PUT without dates -> 400 (service post-merge guard), legacy row repairable when both dates sent -> 200, non-regression (valid POST 201, whitespace name 400, overlap 400, PUT rename 200, GET 200 shape unchanged, export/excel 200 xlsx). tsc exit 0, init.sh [OK] Environment ready
- Gap noted (out of scope, no code written): seedQuarters() in quarter.service.ts still creates 3 quarters with startDate/endDate = null when a new academic year is created, so R2's 'zero active null-dated quarters' invariant holds at migration time but is re-broken by every new academic year. No R<n> in the approved spec covers seedQuarters; documented as follow-up #1 in progress/impl_*.md instead of changing it.
- Wrote progress/impl_backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados.md (outcome, scope, verification, R1-R9 traceability with live request/response, behavior-change note, 4 follow-ups). All T1-T8 checked off. Ready for review.

## Next Step

## Verification
tsc (= pnpm run build) exit 0; ./init.sh green (two pre-existing baseline WARNs for empty verify_command and unset Supabase env); live smoke tests against running stack verified R3 (i/ii/ii-b/iii/iii-b/no-row), R4 (iv/iv-b/v/v-b/v-c positive), R5 (three order checks), R6 (GET unchanged), R7 (export unchanged, also with quarter_id), R8 (non-regression of feature 3's R5/R6/R14/R15/R16, plus PUT-omits-both-on-valid-row), R1/R2 (psql idempotence + R2 post-condition 0). Reviewer APPROVED with C1/C3/C5/C6 [x] and C2/C4 [ ] per protocol rule (no automated test suite project-wide); R3 create-service call site gap honestly documented as code-path-verified.

## Closure
Feature done: POST/PUT /api/quarters reject null/cleared startDate/endDate with 400 + Spanish message (controller guard is the first gate for explicit-null; service assertValidDates(range) post-merge is the authoritative choke point for omitted-keys / non-HTTP callers); ../postgres/19_quarters_softdelete_legacy_null_dates.sql soft-deletes every pre-existing active quarter with a null date (single idempotent UPDATE). One intentional user-visible behavior change: when a POST has both an empty name AND missing dates, the date message now wins (controller runs first) instead of the name message — explicitly required by R5 and design.md's controller section. Two known follow-ups out of scope (not regressions, not blockers): seedQuarters() still creates null-dated rows for new academic years; the new SQL isn't mounted in docker-entrypoint-initdb.d (same drift 17/18 already had).
