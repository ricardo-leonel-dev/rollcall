---
feature_number: 2
name: export_endpoint_accepts_quarter_selection
title: Export endpoint accepts quarter selection
status: done
created_at: 2026-08-29T05:52:38.000Z
updated_at: 2026-08-29T07:37:26.000Z
---

## Description
GET /api/export/excel (controllers/export.controller.ts, services/export.service.ts) currently only receives date_from/date_to and sends no trimester indicator to excel-service, which is why it always uses the template's first sheet. Add an optional quarter_id parameter, validate it against the institution's/active academic year's periods, and forward the period's identifier (sequence_number and/or name) to excel-service alongside the existing parameters. Conceptually depends on 'Relax quarter naming and count constraints' but can be implemented against the current quarters model (already has id/sequence_number/name). Assumes institutions with trimester-style periods (3); other counts are out of scope for this feature.

## Acceptance
- [ ] GET /api/export/excel accepts an optional quarter_id. If sent, it's validated to belong to the institution's active academic year (403/404 otherwise). The period's sequence_number and/or name is forwarded to excel-service in the outgoing request. If quarter_id is not sent, current behavior (date_from/date_to only) is unchanged.
