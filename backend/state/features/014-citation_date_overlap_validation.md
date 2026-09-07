---
feature_number: 14
name: citation_date_overlap_validation
title: Validate overlapping scheduled date ranges when creating or editing citations
status: done
created_at: 2026-09-06T05:40:54.000Z
updated_at: 2026-09-06T20:48:30.000Z
---

## Description
citation.service.ts only validates dateFrom <= dateTo (assertDateOrder) within a single citation; there is no check against other citations for the same enrollment. Add validation in create() and update() that rejects a new date range overlapping an existing non-closed citation for the same enrollment_id, returning enough detail (conflicting citation's dateFrom/dateTo/time, student, representative) for the frontend to display the conflict. Closed citations (closed_at set) must not block. Frontend feature citation_overlap_conflict_ui (attendance_frontend) depends on this.

## Acceptance
- [ ] create() and update() reject an overlapping date range for the same enrollment with a 409 response including the conflicting citation's dates/time/student/representative
- [ ] Closed citations (closed_at set) do not block new overlapping ranges
- [ ] Non-overlapping ranges for the same enrollment are unaffected
