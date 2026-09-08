---
feature_number: 17
name: backend_conteo_de_estudiantes_cursos_usuarios_por_instituci_n
title: Backend: conteo de estudiantes/cursos/usuarios por institución
status: done
created_at: 2026-09-07T20:52:43.000Z
updated_at: 2026-09-08T06:54:09.000Z
---

## Description
Prerrequisito de admin_institutions_cuaderno_seal. Institution hoy solo expone id/name/logoUrl/primaryColor/secondaryColor/isActive. Agregar conteo agregado por institución de estudiantes/cursos/usuarios, respetando el aislamiento multi-tenant existente.

## Acceptance
- [ ] El endpoint de instituciones devuelve los 3 conteos por institución. Los conteos respetan el aislamiento multi-tenant. El modelo frontend se actualiza. No se rompe ningún consumidor existente.
