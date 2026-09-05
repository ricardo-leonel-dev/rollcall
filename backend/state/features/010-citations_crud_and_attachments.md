---
feature_number: 10
name: citations_crud_and_attachments
title: Citations CRUD, attachments, and pending-detection
status: done
created_at: 2026-09-04T06:45:52.000Z
updated_at: 2026-09-04T23:32:45.000Z
---

## Description
Implement the operational 'citaciones' API on top of the schema created by feature citation_reasons_management (citations, citation_citation_reasons, citation_attachments tables must already exist — this feature only fails if that migration hasn't landed). Follow the exact controller/service pattern of absence.controller.ts/absence.service.ts and the exact multer attachment pattern of justification.controller.ts/justification.service.ts (uploads/citaciones dir, same ALLOWED_MIME list, limits: {fileSize: 8MB, files: 5}). A citation has: enrollment_id, date_from, date_to, time, status ('pending'|'closed', default 'pending'), observations, closed_at/closed_by_user_id, created_by_user_id, is_active/deleted_at, and a many-to-many link to citation_reasons via citation_citation_reasons. Add module key 'citations' to MODULE_KEYS in user.service.ts, seed role_permissions for a new 'citaciones' resource (full CRUD for admin/rector/superadmin/inspector/inspector-general roles, no access for teacher/readonly), and bootstrap the uploads/citaciones directory in app.ts (mkdirSync alongside the existing avatars/logos/justifications dirs).

## Acceptance
- [ ] GET /api/citations?course_id=&academic_year_id= returns the roster of enrollments for that course/year, each with its nested citations array (id, dateFrom, dateTo, time, status, observations, reasons[], attachmentsCount, closedAt) plus guardianPhone/whatsappLink, joining guardians the same way absence.service.ts does
- [ ] GET /api/citations?enrollment_id=&status=pending returns only that enrollment's non-closed citations, used to detect pre-existing pending citations before creating a new one
- [ ] POST /api/citations creates a citation (enrollment_id, dateFrom, dateTo, time, reasonIds[], observations), enforcing enrollment-in-scope the same way absence.service.ts's assertEnrollmentInScope does for req.courseIds
- [ ] PUT /api/citations/:id updates the same editable fields (still scoped to req.courseIds)
- [ ] PUT /api/citations/:id/close sets status='closed', closed_at=now(), closed_by_user_id=req.user.id, and only succeeds on a 'pending' citation
- [ ] DELETE /api/citations/:id soft-deletes it (is_active=false/deleted_at set), never a hard delete
- [ ] POST /api/citations/:id/attachments accepts up to 5 files via multipart field 'files', same allowed mime types as justifications (jpeg/png/webp/pdf/doc/docx), 8MB each, stored under uploads/citaciones, served at /api/uploads/citaciones/<file>
- [ ] DELETE /api/citations/:id/attachments/:attachmentId removes one attachment row and its file, mirroring justification.service.ts's removeAttachment
- [ ] role_permissions seeded for resource 'citaciones': full CRUD for admin/rector/superadmin/inspector/inspector-general, none for teacher/readonly
- [ ] MODULE_KEYS in user.service.ts includes 'citations'
- [ ] app.ts bootstraps uploads/citaciones via fs.mkdirSync alongside the other uploads subdirectories
