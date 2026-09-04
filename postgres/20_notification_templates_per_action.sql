-- Per-user, per-action WhatsApp message templates. Replaces the single
-- users.notification_template column (added in 02_auth_schema.sql, used only
-- by GET/PUT /api/auth/me) with a generic (user_id, action_key) -> template
-- table so a second module (citations) can get its own configurable template
-- without another schema change. See feature
-- notification_templates_per_action (R1–R3).
SET search_path TO attendance, public;

CREATE TABLE IF NOT EXISTS user_message_templates (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    action_key  VARCHAR(50) NOT NULL,
    template    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, action_key)
);

CREATE INDEX IF NOT EXISTS idx_user_message_templates_user
    ON user_message_templates(user_id);

INSERT INTO user_message_templates (user_id, action_key, template)
SELECT id, 'absences', notification_template
FROM users
WHERE notification_template IS NOT NULL
  AND trim(notification_template) <> ''
ON CONFLICT (user_id, action_key) DO NOTHING;

ALTER TABLE users DROP COLUMN IF EXISTS notification_template;