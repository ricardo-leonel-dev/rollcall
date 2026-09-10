---
feature_number: 16
name: citation_reasons_read_access_follows_citation_permission
title: Citation reasons read access should follow citation permissions, not admin-only permission
status: done
created_at: 2026-09-07T05:42:42.000Z
updated_at: 2026-09-07T06:34:42.000Z
---

## Description
GET /api/citation-reasons currently requires the citation-reasons:read permission (src/controllers/citation-reason.controller.ts:11), the same resource whose create/update/delete bits gate the admin-only reason-catalog management screen (frontend admin.component.ts). By design (postgres/21_citation_reasons.sql, requirements R18/R19 of feature #9 citation_reasons_management), only admin/rector/superadmin get a role_permissions row for citation-reasons. But the citation-creation form (frontend citation-dialog.component.ts) calls this same GET endpoint to populate its reasons dropdown, and roles that can create citations (e.g. inspector de apoyo / inspector general, granted full citaciones CRUD in postgres/22_citations_permissions.sql) have no citation-reasons row, so the dropdown 403s. The only current workaround is granting that role permission on citation-reasons, which conflates can fill out a citation with can administer the reasons catalog. Fix: add an OR-permission check (requireAnyPermission) to role.middleware.ts and use it on the GET /api/citation-reasons route so it succeeds when the requesting role has ANY of: citaciones:read, citaciones:create, or citation-reasons:read. This covers every current/future role permission combination, including the edge case where citaciones:create=true is toggled independently of citaciones:read via the per-action checkboxes in the Permisos matrix, while leaving citation-reasons create/update/delete (the admin catalog management capability) untouched and still admin/rector/superadmin-only. No frontend or migration changes are required.

## Acceptance
- [ ] A role with citaciones:read=true and no citation-reasons row gets 200 from GET /api/citation-reasons
- [ ] A role with citaciones:create=true, citaciones:read=false and no citation-reasons row also gets 200 from GET /api/citation-reasons
- [ ] A role with only citation-reasons:read=true (no citaciones access) keeps working exactly as before
- [ ] A role with no citaciones and no citation-reasons permission still gets 403 on GET /api/citation-reasons
- [ ] POST/PUT/DELETE /api/citation-reasons still require citation-reasons create/update/delete respectively, unchanged and admin/rector/superadmin-only
- [ ] Superadmin bypass in role.middleware.ts is unaffected
