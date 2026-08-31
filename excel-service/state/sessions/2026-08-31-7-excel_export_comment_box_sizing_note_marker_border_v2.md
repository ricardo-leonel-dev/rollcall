---
session_id: 7
feature: excel_export_comment_box_sizing_note_marker_border_v2
agent: leader -> spec_author (Claude Sonnet 5)
started_at: 2026-08-31T07:29:11.000Z
closed_at: 2026-08-31T07:31:04.000Z
---

## Plan
- Read export.go's processCourse comment/style block and existing specs 1-2 for format
- Investigate excelize v2.10.1 Comment.Width/Height defaults and VML Anchor geometry to ground sizing bounds
- Draft requirements.md (EARS, R1-R11): sizing bounds, diagonal border marker, cell-value invariance, dedupe regression
- Draft design.md: commentBoxSize helper, diagonalNoteBorder + appendDiagonalBorder, styleXNote variants, processCourse call-site changes, discarded alternatives
- Draft tasks.md: T1-Tn traceable to R<n>, sized for one implementer session
- mark-spec-ready and report

## Log
- Drafted requirements.md (R1-R11), design.md, tasks.md (T1-T9) for feature 3 excel_export_comment_box_sizing_note_marker_border_v2 — grounded in vendored excelize v2.10.1 source (Comment.Width/Height default 140x60px via prepareFormCtrlOptions, VML <x:Anchor> geometry vs. the unrelated fixed style attribute, Border struct shape) and export.go's existing processCourse comment/style block.

## Next Step

## Verification


## Closure

