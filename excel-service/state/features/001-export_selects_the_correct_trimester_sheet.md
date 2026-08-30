---
feature_number: 1
name: export_selects_the_correct_trimester_sheet
title: Export selects the correct trimester sheet
status: done
created_at: 2026-08-29T05:56:40.000Z
updated_at: 2026-08-29T06:35:49.000Z
---

## Description
export.go#processCourse always deletes every sheet in the template except the first (f.GetSheetList()[1:]), and exclusively uses base := f.GetSheetList()[0], regardless of the requested period. The .xlsx template ships 3 books (Primer/Segundo/Tercer Trimestre). exportExcelHandler must accept a trimester indicator (quarter_sequence and/or quarter_name, sent by attendance_backend's 'Export endpoint accepts quarter selection') and keep/populate the template sheet matching that trimester instead of always the first one, still deleting the other two. The rest of the flow (renaming the surviving sheet to the course name, querying attendance by date_from/date_to) is unchanged.

## Acceptance
- [ ] exportExcelHandler accepts the trimester parameter (sequence and/or name). The template sheet matching that trimester is selected/kept (not always GetSheetList()[0]). The other trimester sheets are still deleted. If the parameter is missing or invalid, the fallback behavior is documented (e.g. 400 error or default to the first sheet, to be decided in design.md). Attendance data remains filtered by date_from/date_to unchanged.
