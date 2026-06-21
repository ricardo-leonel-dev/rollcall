-- ================================================================
-- Migración 09: separar "inspector" en "inspector de apoyo" (queda
-- restringido a sus cursos asignados, igual que ya funcionaba) e
-- "inspector general" (sin restricción de curso, ve la información
-- de todos los inspectores de apoyo).
--
-- No requiere cambios de schema ni de código backend/frontend: el
-- alcance por curso de user_courses ya filtra lectura y escritura
-- para cualquier rol, sin importar su nombre. "general" = 0 cursos
-- asignados (ve todo), "de apoyo" = N cursos asignados (solo esos).
-- Esto asume que cada curso tiene un solo inspector de apoyo a la
-- vez (confirmado con Ricardo el 2026-06-20) — si dos compartieran
-- curso, no quedarían separados entre sí con este mecanismo.
-- ================================================================

UPDATE public.roles SET name = 'inspector de apoyo' WHERE name = 'inspector';

INSERT INTO public.roles (name, description, is_active)
SELECT 'inspector general',
       'Ve la información de todos los inspectores de apoyo, sin restricción de curso',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'inspector general');

INSERT INTO public.role_permissions (role_id, resource, can_read, can_create, can_update, can_delete)
SELECT (SELECT id FROM public.roles WHERE name = 'inspector general'),
       rp.resource, rp.can_read, rp.can_create, rp.can_update, rp.can_delete
FROM public.role_permissions rp
WHERE rp.role_id = (SELECT id FROM public.roles WHERE name = 'inspector de apoyo')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions x
    WHERE x.role_id = (SELECT id FROM public.roles WHERE name = 'inspector general')
      AND x.resource = rp.resource
  );
