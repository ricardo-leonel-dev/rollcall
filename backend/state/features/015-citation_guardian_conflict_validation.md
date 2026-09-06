---
feature_number: 15
name: citation_guardian_conflict_validation
title: Prevent double-booking a representative: single citation date, required time, guardian-scoped 10-minute conflict rule
status: done
created_at: 2026-09-06T20:49:06.000Z
updated_at: 2026-09-06T23:48:43.000Z
---

## Description
Supersedes feature #14, whose approved rule (date-range overlap scoped to enrollment_id, ignoring time) was replaced before commit. A citation is a disciplinary record whose purpose is to summon a student's representative (guardian) on a given date at a given time. The scarce resource is the guardian's agenda, not the enrollment: two students can share one guardian, and two staff members in different courses can each schedule that same guardian without seeing each other's citations. This feature (a) collapses citations.date_from/date_to into a single date column, (b) makes time mandatory, (c) stores guardian_id on the citation frozen at creation time so a later change of a student's registered guardian does not retroactively rewrite who was summoned, (d) rejects scheduling the same guardian on the same date less than 10 minutes apart, institution-wide across courses and creators, and (e) redacts the conflict payload for course-scoped users, exposing only date and time unless the caller is unscoped (req.courseIds === null). The uncommitted 'conflict' forwarding already present in error.middleware.ts is reused verbatim; assertNoOverlap in citation.service.ts is rewritten from scratch. Frontend counterparts live in attendance_frontend and are handled separately.

## Acceptance
- [ ] Migration 23: citations gains guardian_id (nullable, REFERENCES guardians(id)), backfilled from enrollments.guardian_id, and set at creation time from the enrollment rather than resolved by JOIN on read
- [ ] Migration 23: citations.date_from and citations.date_to are collapsed into a single date column; existing rows take the value of date_from
- [ ] Migration 23: existing citations with a NULL time are backfilled to 07:55, after which time becomes NOT NULL with no column default (every insert must supply it explicitly)
- [ ] Migration 23 ships a _supabase variant omitting unsupported DDL, matching the existing convention in postgres/
- [ ] create() and update() reject a missing time with 400
- [ ] create() and update() reject an enrollment whose guardian_id is NULL with 400, since there is no representative to summon
- [ ] create() and update() return 409 when another citation exists with status='pending', deleted_at IS NULL, the same guardian_id, the same date, and a time less than 10 minutes apart; a difference of exactly 10 minutes is allowed
- [ ] The conflict check spans the whole institution, crossing course scope and creators; it is not filtered by req.courseIds
- [ ] update() does not conflict with the citation being edited itself
- [ ] Citations with status='closed' never block a new citation
- [ ] When req.courseIds is null the 409 conflict payload carries full detail (date, time, student, guardian, course); when req.courseIds is an array it carries only date and time, with no student name, no course and no indication of who scheduled it
- [ ] Every citations read and write path exposes a single date field instead of dateFrom/dateTo
