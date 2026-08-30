---
feature_number: 6
name: backend_acepta_date_from_date_to_en_get_api_justifications
title: Backend acepta date_from/date_to en GET /api/justifications
status: done
created_at: 2026-08-30T06:08:03.000Z
updated_at: 2026-08-30T06:26:17.000Z
---

## Description
El endpoint GET /api/justifications actualmente ignora los query params date_from y date_to (verificado: 194 justificaciones con y sin params, mismo conteo). La feature 6 del frontend (quarter_selector_on_list_views, attendance_frontend) requiere poder filtrar justificaciones por el rango de fechas de las ausencias asociadas, para que el quarter dropdown funcione en la vista Justifications. Extender findAll (y/o el handler del controller) para que, cuando date_from y/o date_to estén presentes, filtre las justificaciones cuyas ausencias asociadas (via JustificationAbsence) caen dentro del rango.

## Acceptance
- [ ] 1. GET /api/justifications?date_from=2026-05-04&date_to=2026-05-10 devuelve solo justificaciones con al menos una ausencia en ese rango (regression baseline esperado: solo 1-2 rows de las 194 actuales). 2. Solo date_from filtra inclusive desde esa fecha. 3. Solo date_to filtra inclusive hasta esa fecha. 4. Sin params devuelve las 194 (no-regression). 5. date_from > date_to devuelve HTTP 400. 6. date_from/date_to malformados devuelven HTTP 400. 7. La query usa JustificationAbsence.absence.date como base del filtro, no Justification.createdAt. 8. Soft-deleted absences/justifications se siguen excluyendo. 9. Test smoke con curl documentado en progress/impl_<feature>.md, conteos antes/después registrados.
