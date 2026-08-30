---
session_id: 1
feature: api_configure_academic_quarters_trimestres_per_academic_year
agent: leader -> spec_author (Claude Sonnet 5)
started_at: 2026-08-28T07:23:45.000Z
closed_at: 2026-08-28T07:25:20.000Z
---

## Plan
- Explore existing academic_years table/entity/service, migration conventions, and permission model
- Draft requirements.md in strict EARS with R1..R18 covering schema, auto-provisioning, CRUD, date validation, and academic-year cascade behavior
- Draft design.md with files to touch, new signatures, error paths, and a discarded alternative
- Draft tasks.md with ordered T<n> checkboxes tagged to R<n>
- Run mark-spec-ready once all 3 files are complete and internally consistent

## Log
- Explored academic_years table/entity/service, institution.middleware's active-year resolution pattern, course.service.ts's enum-validation convention, and migration 16's schema-portable search_path convention. Drafted requirements.md (R1-R18, EARS), design.md (new quarters table without institution_id/is_active, new entity/service/controller, cascade wiring into academic-year.service.ts, discarded alternatives), and tasks.md (T1-T12, R-tagged).

## Next Step

## Verification


## Closure

