---
feature_number: 5
name: backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados
title: Backend rechaza trimestres sin fecha de inicio o fin + migración de datos legados
status: done
created_at: 2026-08-29T20:09:21.000Z
updated_at: 2026-08-29T21:12:28.000Z
---

## Description
Espejo servidor del cambio del frontend (spec require_full_dates_on_quarters). Hoy el backend acepta start_date/end_date nulos al crear o actualizar un trimestre (src/controllers/quarter.controller.ts + src/services/quarter.service.ts); el dialog admin los bloqueará client-side, pero cualquier llamada directa a la API o consumidor futuro los aceptaría. Esta card agrega validación servidor del mismo invariante ('ambos fechas requeridas') para que el dialog deje de ser la única barrera.

PRERREQUISITO (A0): antes de activar la validación POST/PUT, agregar una nueva migración SQL en postgres/ que resuelva las filas existentes con start_date o end_date null. Estrategia: para cada quarter legado, inferir un rango sensato a partir del sequenceNumber y los límites del academic_year (dividir el año en N trimestres según sequenceNumber y asignar start_date/end_date proporcionalmente), o — si no se puede inferir con seguridad — marcarlas como soft-deleted. Verificar con SELECT count(*) WHERE start_date IS NULL OR end_date IS NULL; antes y después.

Los GET deben seguir retornando quarters legados con fechas nulas durante la fase de migración (no romper lecturas existentes). Tras la migración, la validación POST/PUT puede activarse.

## Acceptance
- [ ] A0 (prerrequisito): Migración SQL en postgres/ que resuelve todas las filas existentes con start_date o end_date null. Verificación: SELECT count(*) WHERE start_date IS NULL OR end_date IS NULL; debe ser 0 después de aplicar.
- [ ] A1: POST /api/quarters retorna 400 con mensaje claro en español si startDate o endDate es null/undefined. A2: PUT /api/quarters/:id aplica la misma validación (no se permite limpiar una fecha vía update). A3: GET /api/quarters y el endpoint de export siguen retornando quarters sin cambios (lecturas no rompen). A4: El orden de validación es coherente con quarters-dialog.component.ts (chequeo de presencia antes que chequeo de rango) — mismo mensaje siempre que sea posible. A5: Tests nuevos cubren: POST sin start, POST sin end, POST sin ambas, PUT borrando una fecha en update, PUT sobre quarter legada bloqueando el save. Tests existentes de create/update válidos no regresionan. A6: pnpm build y los tests del backend pasan verdes.
