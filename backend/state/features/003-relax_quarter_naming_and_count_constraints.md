---
feature_number: 3
name: relax_quarter_naming_and_count_constraints
title: Relax quarter naming and count constraints
status: done
created_at: 2026-08-29T05:52:38.000Z
updated_at: 2026-08-29T06:54:58.000Z
---

## Description
The quarters table (postgres/17_quarters.sql) forces name to the 3 fixed values ('Primer/Segundo/Tercer Trimestre') via CHECK, and sequence_number to BETWEEN 1 AND 3. This prevents an institution from dividing the school year into semesters, bimesters, or any other period count/naming. Add a migration (postgres/NN_*.sql) that drops both CHECK constraints while keeping UNIQUE(academic_year_id, name) and UNIQUE(academic_year_id, sequence_number). Update the Quarter entity/quarter.service.ts/quarter.controller.ts: stop treating the QUARTER_NAMES array as a rigid source of truth, allow creating/renaming/deleting arbitrary periods (add DELETE /api/quarters/:id), and keep overlap/range validation within the academic year generic for N periods. seedQuarters may still create 3 default periods for convenience, but they must remain fully editable afterward (not just their dates).

## Acceptance
- [ ] Migration drops the name and sequence_number CHECK constraints, keeps the UNIQUE constraints. Quarter entity/service no longer validates against a fixed QUARTER_NAMES list. POST/PUT allow free-form names and sequence_number with no cap at 3. New DELETE /api/quarters/:id with soft-delete consistent with the rest of the domain. Overlap/range validation still works for any number of periods. Tests/verification cover creating more than 3 periods and non-trimester names.
