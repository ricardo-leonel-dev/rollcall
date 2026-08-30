---
feature_number: 1
name: api_configure_academic_quarters_trimestres_per_academic_year
title: API: Configure academic quarters (trimestres) per academic year
status: done
created_at: 2026-08-28T07:15:42.000Z
updated_at: 2026-08-28T08:21:08.000Z
---

## Description
Add backend support to configure the three fixed academic quarters (Primer/Segundo/Tercer Trimestre) per academic year, with date-range validation. Requires a new quarters table. This is the API layer the frontend quarter-configuration screen depends on.

## Acceptance
- [ ] - A new quarters table exists (migration file in postgres/) with columns: id, academic_year_id (FK -> academic_years, NOT NULL), name, start_date, end_date, description, created_at, updated_at, deleted_at (soft delete) -- following existing schema conventions
- [ ] - Any role with permission on the academic_years resource can create/update a quarter via the API
- [ ] - Each academic year has exactly 3 fixed quarters: Primer Trimestre, Segundo Trimestre, Tercer Trimestre
- [ ] - Quarters are always associated with an academic year, resolved against the currently active one (academic_years.is_active)
- [ ] - Quarter date ranges cannot overlap with each other
- [ ] - Quarter date ranges must fall within their academic year's own start_date/end_date
- [ ] - When an academic year's dates are updated, its quarters are adjusted/re-validated so they never remain in an invalid state
- [ ] - Follows the existing controller/service pattern and multi-tenant/course-scope rules
