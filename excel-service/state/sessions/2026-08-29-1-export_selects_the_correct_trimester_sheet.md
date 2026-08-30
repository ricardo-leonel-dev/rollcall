---
session_id: 1
feature: export_selects_the_correct_trimester_sheet
agent: leader -> spec_author (Claude Sonnet 5)
started_at: 2026-08-29T06:06:04.000Z
closed_at: 2026-08-29T06:07:35.000Z
---

## Plan
- Read export.go/main.go and confirm current always-first-sheet behavior + template's real sheet names/order
- Read sibling backend spec (export_endpoint_accepts_quarter_selection) to confirm exact param names/semantics this feature must consume
- Draft specs/export_selects_the_correct_trimester_sheet/requirements.md in EARS
- Draft design.md with new signatures, sheet-selection algorithm, fallback/error policy, discarded alternatives
- Draft tasks.md with R<n>-tagged ordered tasks including new unit tests
- mark-spec-ready

## Log
- Explored export.go (processCourse always uses GetSheetList()[0] as base, deletes [1:]), main.go, docs/{architecture,conventions,verification}.md. Inspected template's xl/workbook.xml directly: 3 sheets in fixed order '1ER TRIMESTRE','2DO TRIMESTRE','3ER TRIMESTRE' (position, not sheetId, matches this order). Read sibling backend project's specs/export_endpoint_accepts_quarter_selection/{requirements,design}.md: confirms backend forwards quarter_sequence (Quarter.sequenceNumber, integer) and quarter_name (Quarter.name, Spanish e.g. 'Segundo Trimestre') together, quarter_sequence should take precedence, and when neither is sent behavior must stay byte-identical to pre-feature (always first sheet).
- Drafted requirements.md (R1-R8, EARS), design.md (resolveTrimesterSheetIndex, processCourse signature change, position-based sheet selection vs sheetId, discarded alternatives), tasks.md (T1-T9, R<n>-tagged, including new export_test.go) in specs/export_selects_the_correct_trimester_sheet/. Every Rn covered by >=1 task/test.

## Next Step

## Verification


## Closure

