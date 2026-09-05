SET search_path TO attendance, public;

INSERT INTO role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
SELECT id, 'citaciones', TRUE, TRUE, TRUE, TRUE
FROM roles
WHERE name IN ('admin', 'rector', 'superadmin', 'inspector de apoyo', 'inspector general')
ON CONFLICT (role_id, resource) DO NOTHING;
