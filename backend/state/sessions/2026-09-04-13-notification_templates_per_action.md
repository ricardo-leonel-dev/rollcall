---
session_id: 13
feature: notification_templates_per_action
agent: leader -> spec_author (Claude Sonnet 5)
started_at: 2026-09-04T07:02:34.000Z
closed_at: 2026-09-04T07:07:03.000Z
---

## Plan

## Log
- Investigated notification_template usage (User.ts, auth.service.ts, auth.controller.ts, frontend absences/profile-dialog), MODULE_KEYS pattern in user.service.ts, migration numbering (postgres/ up to 19), user_modules table/entity as closest sibling pattern, auth/institution middleware, error-handling convention. Drafted requirements.md (R1-R13), design.md (migration 20_notification_templates_per_action.sql, UserMessageTemplate entity, notification-template.service.ts + .controller.ts, NOTIFICATION_ACTION_KEYS in user.service.ts, auth.service.ts trimmed, 4 discarded alternatives), tasks.md (T1-T15, traced to R1-R13).

## Next Step

## Verification


## Closure

