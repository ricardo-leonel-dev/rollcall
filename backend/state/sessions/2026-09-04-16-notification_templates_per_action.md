---
session_id: 16
feature: notification_templates_per_action
agent: implementer
started_at: 2026-09-04T17:44:57.000Z
closed_at: 2026-09-04T18:16:17.000Z
---

## Plan
- T1: create postgres/20_notification_templates_per_action.sql migration
- T2: create UserMessageTemplate entity
- T3: remove notificationTemplate from User entity
- T4: add NOTIFICATION_ACTION_KEYS constant
- T5: create notification-template.service.ts
- T6: create notification-template.controller.ts
- T7: mount in routes/index.ts
- T8: update auth.service.ts to remove notificationTemplate
- T9-T13: write tests for endpoints
- T14: write migration test for backfill
- T15: write tests for auth/me changes
- Verify with pnpm run build + smoke test
- Write handoff file

## Log
- Starting implementation of feature 8 (notification_templates_per_action). Plan recorded.
- T1 done: postgres/20_notification_templates_per_action.sql written
- All 11 tests passing. T1-T15 done. Smoke test verified endpoints work end-to-end.
- Implementation complete: T1-T15 done. 11/11 tests pass. Build green. Smoke test verified. Handoff written to progress/impl_8.md
- implementer finished feature 8: tsc=0, integration tests 11/11 passing, migration applied + container restarted, smoke test passed; awaiting reviewer
- REVIEW (approved): All R1-R13 + T1-T15 met; tsc + 11/11 tests + init.sh all green; no leftover notificationTemplate property refs in src/.

## Next Step

## Verification
tsc=0; integration tests 11/11 passing (T9-T15 covering R5-R12 + migration T14 + auth/me T15); init.sh green; migration 20 applied to running Postgres; smoke test against live backend confirmed GET empty list, PUT create, PUT 400 invalid actionKey, GET after PUT shows new row, /api/auth/me response no longer contains notificationTemplate

## Closure
Feature 8 done. Per-action WhatsApp notification templates: new user_message_templates table (UNIQUE(user_id, action_key) + index), NOTIFICATION_ACTION_KEYS whitelist (absences, citations) in user.service.ts, GET/PUT /api/notification-templates controller/service, users.notification_template column dropped after backfill (preserved pbastidas absences row). Reviewer approved with zero defects.
