---
feature_number: 7
name: report_conflicting_absence_type_on_create
title: Reportar conflicto de tipo al crear ausencias en un rango
status: done
created_at: 2026-08-31T17:41:06.000Z
updated_at: 2026-08-31T18:37:40.000Z
---

## Description
createRange (src/services/absence.service.ts) agrupa en un mismo contador 'skipped' tanto una fecha ya marcada con el MISMO tipo (idempotente) como una fecha ya marcada con un tipo DISTINTO (F vs AT, bloqueado por el UNIQUE(enrollment_id, date) de la tabla absences). El caller (frontend) no puede distinguir ambos casos hoy, así que no puede avisarle al usuario que debe eliminar la falta existente antes de registrar un atraso ese mismo día (o viceversa). Extender la respuesta de POST /api/absences para reportar, por fecha omitida, si el tipo existente coincide o difiere del solicitado.

## Acceptance
- [ ] La respuesta de createRange sigue incluyendo created y skipped con la misma semántica actual (sin regresión para consumidores existentes)
- [ ] La respuesta agrega detalle por fecha omitida indicando el type existente en esa fecha (F o AT)
- [ ] El detalle permite distinguir fecha omitida por mismo tipo (idempotente) vs fecha omitida por tipo distinto (conflicto real)
- [ ] No se modifica el constraint UNIQUE(enrollment_id, date) ni el comportamiento de soft-delete/restore ya existente en createRange
- [ ] Se agregan/actualizan tests de servicio cubriendo ambos casos (mismo tipo vs tipo distinto en la misma fecha)
