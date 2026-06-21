-- ================================================================
-- Migración 09 (variante Supabase) — separar "inspector" en
-- "inspector de apoyo" e "inspector general". Misma lógica que
-- 09_inspector_apoyo_general.sql, calificada con el schema
-- "attendance" (el real en Supabase, ver nota de la 08).
-- ================================================================

UPDATE attendance.roles SET name = 'inspector de apoyo' WHERE name = 'inspector';

INSERT INTO attendance.roles (name, description, is_active)
SELECT 'inspector general',
       'Ve la información de todos los inspectores de apoyo, sin restricción de curso',
       true
WHERE NOT EXISTS (SELECT 1 FROM attendance.roles WHERE name = 'inspector general');

INSERT INTO attendance.role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
SELECT (SELECT id FROM attendance.roles WHERE name = 'inspector general'),
       rp.resource, rp.can_read, rp.can_create, rp.can_update, rp.can_delete
FROM attendance.role_permissions rp
WHERE rp.role_id = (SELECT id FROM attendance.roles WHERE name = 'inspector de apoyo')
  AND NOT EXISTS (
    SELECT 1 FROM attendance.role_permissions x
    WHERE x.role_id = (SELECT id FROM attendance.roles WHERE name = 'inspector general')
      AND x.resource = rp.resource
  );
