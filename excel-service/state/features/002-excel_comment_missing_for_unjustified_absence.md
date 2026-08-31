---
feature_number: 2
name: excel_comment_missing_for_unjustified_absence
title: Excel comment (hover note) missing on 'F' (unjustified absence) cells
status: done
created_at: 2026-08-31T01:13:26.000Z
updated_at: 2026-08-31T02:16:26.000Z
---

## Description
Cell comments in export.go (~lines 693-716) are added generically per registro type (F, AT, J) via excelize.AddComment whenever reg.notes or justificationReason is non-empty. Manually confirmed by the product owner: saving a note on an unjustified F-type absence and exporting does NOT produce a hover comment on that cell in Excel, while AT and justified J cells do show it. Backend and frontend were verified to persist notes identically for F and AT (absence.service.ts createRange/update, absence-dialog/absence-range-dialog components) -- the root cause is isolated to xlsx generation in excel-service. Needs reproduction (create one F absence with notes, run export, inspect the generated comments1.xml/VML), root-cause identification (possible angles: AddComment ordering vs SetCellStyle, comment id/author collisions in excelize v2.10.1, or reg.notes arriving empty for F rows specifically), and a fix.

## Acceptance
- [ ] An unjustified F-type absence with non-empty notes produces a cell comment in the exported xlsx, matching current AT/J behavior
- [ ] A regression test in export_test.go covers this exact case and fails against the pre-fix code
- [ ] No regression to existing AT/J/justification-reason comment behavior
