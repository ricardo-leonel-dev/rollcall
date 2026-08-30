---
feature_number: 4
name: get_api_quarters_accepts_optional_academic_year_id_filter
title: GET /api/quarters accepts optional academic_year_id filter
status: done
created_at: 2026-08-29T18:47:07.000Z
updated_at: 2026-08-29T18:58:44.000Z
---

## Description
Hoy GET /api/quarters esta hardcodeado al año lectivo activo de la institución (findAllForActiveYear), ignorando cualquier otro año. Esto bloquea al frontend (quarter_selector_foundation) de mostrar periodos de un año no-activo. Agregar un query param opcional academic_year_id: si se provee, filtrar por ese año (validando que pertenezca a la institución del usuario); si no, mantener el comportamiento actual.

## Acceptance
- [ ] GET /api/quarters?academic_year_id=N devuelve los quarters de ese año si pertenece a la institución del usuario; sin el parámetro el comportamiento no cambia; academic_year_id de otra institución se rechaza (403 o lista vacía, a definir); verificación documentada
