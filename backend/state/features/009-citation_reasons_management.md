---
feature_number: 9
name: citation_reasons_management
title: Citation reasons (motivos) schema + CRUD
status: done
created_at: 2026-09-04T06:45:41.000Z
updated_at: 2026-09-04T22:44:12.000Z
---

## Description
New 'citaciones' module groundwork: create the full DB schema for citations in one migration (citation_reasons, citations, citation_citation_reasons pivot, citation_attachments) following the multi-tenant + soft-delete conventions in postgres/17_quarters.sql and postgres/09_justification_attachments.sql. Implement only the citation_reasons CRUD slice in this feature (the 'motivos' institutions configure, each with a name, severity in bajo/medio/alto, and a description). citations/citation_citation_reasons/citation_attachments tables are created now (so the schema is not split across migrations) but their CRUD endpoints are a separate feature. Seed role_permissions for a new 'citation-reasons' resource (admin/rector/superadmin only, mirroring how other admin-only lookup resources are seeded, e.g. postgres/13_reports_permission.sql's pattern).

## Acceptance
- [ ] New migration postgres/*.sql creates citation_reasons, citations, citation_citation_reasons, citation_attachments with institution_id FKs, soft-delete columns (is_active/deleted_at) where applicable, and indexes, matching the conventions used by quarters/justification_attachments
- [ ] citation_reasons has UNIQUE(institution_id, name) and a severity CHECK (severity IN ('bajo','medio','alto'))
- [ ] New TypeORM entities CitationReason, Citation, CitationCitationReason, CitationAttachment registered in data-source.ts
- [ ] New citation-reason.controller.ts/service.ts follow the exact controller/service split pattern of absence.controller.ts/service.ts (requireInstitution, requirePermission('citation-reasons', action), institutionId/courseIds threading)
- [ ] GET /api/citation-reasons lists active reasons for the current institution; POST creates one; PUT updates one; DELETE soft-deletes one
- [ ] Router registered under /api/citation-reasons in routes/index.ts
- [ ] role_permissions seeded for resource 'citation-reasons': full CRUD for admin/rector/superadmin roles, no access for other existing roles, via a data-only migration section
