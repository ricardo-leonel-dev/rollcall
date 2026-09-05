---
session_id: 18
feature: citations_crud_and_attachments
agent: leader -> implementer (MiniMax-M3)
started_at: 2026-09-04T23:11:03.000Z
closed_at: 2026-09-04T23:32:45.000Z
---

## Plan
- T1: write postgres/22_citations_permissions.sql
- T2: create src/services/citation.service.ts
- T3: create src/controllers/citation.controller.ts
- T4: mount router in src/routes/index.ts
- T5: append citations + citation-reasons to MODULE_KEYS
- T6: add uploads/citaciones bootstrap in src/app.ts
- T7: run tsc and verify zero new errors
- T8: apply migration to live DB and verify role_permissions seeded correctly
- T9-T16: manual smoke tests against live stack

## Log
- Pre-T1 gate verified: all 4 Citation* entities exist on disk, registered in src/data-source.ts, and tables exist in live Postgres (postgres/21_citation_reasons.sql applied). Next free migration number is 22.
- T1 done: postgres/22_citations_permissions.sql written verbatim from design.md (next free number after 21_citation_reasons.sql).
- T7 done: tsc -p . exits 0. T8 done: migration applied, 5 role_permissions rows seeded for citaciones (admin/rector/superadmin/inspector de apoyo/inspector general), 0 rows for teacher/readonly. Backend container rebuilt and healthy.
- T9-T16 smoke tests complete: all 16 tasks done. All R1-R36 verified against live stack. Final tsc=0, init.sh green (only [WARN] lines are pre-existing 'no verify_command' and 'no Supabase mirror' — not failures). Test artifacts cleaned up; citation id 1 left in DB soft-deleted as T14 evidence.

## Next Step

## Verification
Reviewer-approved (C1-C6 green, C5 enforced at log-out). tsc exit 0. Migration 22_citations_permissions.sql aplicada: 5 role_permissions rows para citaciones (admin/rector/superadmin/inspector de apoyo/inspector general), 0 para teacher/readonly. Live smoke tests T9-T16 contra stack en vivo todas pasaron: roster mode 200/400/404, pending-detection con filtro pending/closed/invalid-400, POST 201 con validación de orden de fechas + reasonIds + institution+scope (cada uno con su 400/404), PUT partial update preservando campos no enviados, PUT con reasonIds replace (delete+re-insert de citation_citation_reasons), PUT close +409 on repeat +404 on already-soft-deleted, DELETE soft-delete (deleted_at+is_active=f, no hard delete), attachments 201 con URL resolviendo en /api/uploads/citaciones/, DELETE attachment 204 con row+file removidos, 404 sobre attachment de otra citation. Auth: 401 sin JWT, 403 a teacher en cada verbo. R36 verificada: line 24 'citations', line 25 'citation-reasons' en MODULE_KEYS. Drift documentado pero no-bloqueante: multer 500 (codebase-wide, matches /justifications), dateFrom type asymmetry (serializa igual en JSON), PUT nulls como no-op (design literal). Evidencia completa en progress/review.md y progress/impl_citations_crud_and_attachments.md.

## Closure
Feature 10 (citations_crud_and_attachments) DONE. Shipped: citation.service.ts (findRoster, findByEnrollment, create, update, close, remove, addAttachments, removeAttachment + helpers), citation.controller.ts (8 endpoints con requirePermission per-verb, multer para attachments), router mount en /citations, app.ts bootstrap de uploads/citaciones, MODULE_KEYS extendido con 'citations' + 'citation-reasons' (R36 crítico para frontend admin), migration 22_citations_permissions.sql seedeando role_permissions para 5 roles. Sesión 18 cerrada. Backend citaciones module completo: motivos (9) + CRUD operativo (10).
