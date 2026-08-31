---
session_id: 4
feature: excel_comment_missing_for_unjustified_absence
agent: spec_author
started_at: 2026-08-31T01:22:48.000Z
closed_at: 2026-08-31T01:33:36.000Z
---

## Plan

## Log
- Investigated root cause via a scratch repro (copied export.go+template to /tmp, called processCourse directly, inspected the generated zip's XML). Confirmed: comment CONTENT (xl/comments1.xml) is correct for F/AT/J alike, both before and after any fix -- the defect is that vendored excelize v2.10.1's addDrawingVML hardcodes id="_x0000_s1025" for every <v:shape> it appends to a sheet's VML drawing (xl/drawings/vmlDrawingN.vml), so any sheet with 2+ comments gets duplicate shape ids, which real Excel does not tolerate (only one shape per duplicated id keeps a working note). Verified a fix (dedupeCommentShapeIDs: rewrite id attrs to be sequential post-SaveAs, same zip/XML-surgery idiom as mergeWorkbooks/stripExternalLinks) resolves it in the repro. Drafted requirements.md (R1-R5), design.md (investigation trail + 3 discarded alternatives), tasks.md (T1-T6) accordingly.

## Next Step

## Verification


## Closure

