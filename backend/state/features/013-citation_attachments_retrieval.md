---
feature_number: 13
name: citation_attachments_retrieval
title: Include citation attachments in citation query responses
status: done
created_at: 2026-09-06T05:40:54.000Z
updated_at: 2026-09-06T06:46:46.000Z
---

## Description
citation_attachments records exist per citation (postgres/21_citation_reasons.sql) but no query ever returns them: findByEnrollment and findRoster in citation.service.ts only select id/dateFrom/dateTo/time/status/observations/reasonIds, never attachments, and there is no GET /:id or GET /:id/attachments endpoint. justification.service.ts already does this correctly for justification_attachments via a json_agg subquery in the same SELECT - mirror that pattern for citations. Frontend feature citation_evidence_reload (attendance_frontend) depends on this.

## Acceptance
- [ ] findByEnrollment and findRoster responses include an attachments array per citation (id, file_name, original_name, mime_type, url)
- [ ] Existing attachment upload (POST) and delete (DELETE) behavior is unchanged
