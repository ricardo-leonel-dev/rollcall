-- Migration 13: add 'reports' resource to role_permissions
-- Grants can_read=true on 'reports' to every role that already has
-- access to 'export'. This enables the student report PDF export.

SET search_path TO attendance, public;

INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
SELECT rp.role_id, 'reports', TRUE, FALSE, FALSE, FALSE
FROM role_permissions rp
WHERE rp.resource = 'export'
ON CONFLICT (role_id, resource) DO NOTHING;
