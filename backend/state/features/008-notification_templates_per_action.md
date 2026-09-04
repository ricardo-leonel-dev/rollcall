---
feature_number: 8
name: notification_templates_per_action
title: Per-action WhatsApp notification templates
status: done
created_at: 2026-09-04T06:45:28.000Z
updated_at: 2026-09-04T18:16:17.000Z
---

## Description
Replace the single users.notification_template TEXT column with a generic (user_id, action_key) -> template table so new modules (starting with citations) can have their own configurable WhatsApp message template without further schema changes. Backfill existing absences templates into the new table under action_key='absences', then drop the old column. Add a code-level whitelist of valid action keys (starting with 'absences' and 'citations') mirroring the existing MODULE_KEYS pattern, and a self-service GET/PUT /api/notification-templates endpoint pair scoped to req.user.id (no new RBAC resource needed, same as /api/auth/me).

## Acceptance
- [ ] New table user_message_templates(id, user_id FK, action_key VARCHAR(50), template TEXT, created_at, updated_at, UNIQUE(user_id, action_key)) created via a new postgres/*.sql migration
- [ ] Existing users.notification_template values are backfilled into user_message_templates with action_key='absences', then the old column is dropped in the same migration
- [ ] New TypeORM entity UserMessageTemplate mirrors UserModule's style (snake_case columns via @Column name, camelCase properties)
- [ ] NOTIFICATION_ACTION_KEYS whitelist constant (at least 'absences','citations') added in user.service.ts, validated server-side on write
- [ ] GET /api/notification-templates returns {[actionKey]: template} for only the keys the current user has configured
- [ ] PUT /api/notification-templates accepts a partial {[actionKey]: template} body and upserts each provided key for the current user, rejecting any key not in NOTIFICATION_ACTION_KEYS with 400
- [ ] GET /api/auth/me and PUT /api/auth/me no longer reference notificationTemplate
