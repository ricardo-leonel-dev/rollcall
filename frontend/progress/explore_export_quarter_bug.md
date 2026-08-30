# Trace: Excel export always shows May/Jun/Jul/Aug regardless of selected trimestre

## Root cause (one line)

`ExcelExportDialogComponent.downloadExcel()` in
`frontend/src/app/features/student-report/excel-export-dialog.component.ts`
builds the `/api/export/excel` request URL from `date_from`/`date_to` only —
it never includes the `quarter_id` (or `activeQuarterId()`) that the dialog
already tracks. Every hop downstream (backend controller/service,
excel-service) is fully wired to accept and act on a quarter id/sequence —
they just never receive one, so excel-service always falls back to its
documented "no quarter param" default: sheet index 0 (the first trimester
template sheet), whose column headers are hardcoded to a fixed set of
months. That is why the export always shows the same 4 months no matter
which trimestre the user picks in the UI.

---

## Hop 1 — Frontend: is the selected quarter sent to the backend?

File: `/home/rileo/ai-personal/frontend/src/app/features/student-report/excel-export-dialog.component.ts`

- Lines 146, 172-177: the dialog *does* track which quarter is active:
  ```ts
  readonly activeQuarterId = signal<number | null>(null);
  ...
  applyQuarter(q: Quarter | null): void {
    if (!q || !q.startDate || !q.endDate) return;
    this.dateFrom = dateStringToDate(q.startDate);
    this.dateTo = dateStringToDate(q.endDate);
    this.activeQuarterId.set(q.id);
  }
  ```
  Clicking a trimestre pill (`(click)="applyQuarter(q)"` at line 111) correctly
  sets `dateFrom`/`dateTo` from the quarter's configured `startDate`/`endDate`,
  and records `activeQuarterId`.

- **Bug is here** — lines 198-207, `downloadExcel()`:
  ```ts
  async downloadExcel(): Promise<void> {
    if (!this.selCourseIds.length) return;
    const year = this.academicYearContext.selected();
    if (!year) { this.notify.error('No hay año lectivo activo'); return; }

    this.generating.set(true);
    try {
      const courseIds = this.selCourseIds.join(',');
      const url = `/api/export/excel?course_ids=${courseIds}&academic_year_id=${year.id}&date_from=${dateToDateString(this.dateFrom)}&date_to=${dateToDateString(this.dateTo)}`;
      const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
  ```
  Only `course_ids`, `academic_year_id`, `date_from`, `date_to` are put on the
  query string. `this.activeQuarterId()` is read nowhere in this method (or
  anywhere else in the file) — it is set but never consumed. No `quarter_id`
  param is ever sent, **regardless of which trimestre pill the user clicked**.
  This is true even though `date_from`/`date_to` themselves *are* correctly
  set to the selected quarter's dates — those dates just never reach
  excel-service's month-column-selection logic (see Hop 3); they're only used
  by excel-service to filter which attendance *records* to query (SQL
  `BETWEEN`), not which sheet/columns to render.

- `export-config-dialog.component.ts` (the PDF export) has the identical
  `activeQuarterId`/`applyQuarter` pattern (lines 379, 411-416) but is
  irrelevant to this bug: `generatePdf()` (lines 445-500) never calls
  excel-service at all — it fetches `/api/reports/student-summary` and prints
  client-side HTML, so it has no analogous "wrong sheet" failure mode.

## Hop 2 — Backend: is quarter_id read, resolved to dates, and forwarded?

Backend fully supports a quarter id end-to-end — it is simply never invoked
because the frontend never sends `quarter_id`.

File: `/home/rileo/ai-personal/backend/src/controllers/export.controller.ts`
- Line 17: `const { course_ids, academic_year_id, date_from, date_to, quarter_id } = req.query as Record<string, string>;`
- Lines 29-36: parses `quarter_id` into `quarterId: number | undefined` (only
  validated if present — optional param).
- Line 47: `svc.exportExcel(req.institutionId, courseIds, +academic_year_id, date_from, date_to, signers, quarterId)` — forwards `quarterId` on to the service.

File: `/home/rileo/ai-personal/backend/src/services/export.service.ts`
- Lines 20-27:
  ```ts
  let quarterParam = '';
  if (quarterId !== undefined) {
    const quarter = await quarterService.findByIdForActiveYear(institutionId, quarterId);
    if (quarter.academicYearId !== academicYearId) {
      throw Object.assign(new Error('Trimestre no encontrado'), { status: 404 });
    }
    quarterParam = `&quarter_sequence=${quarter.sequenceNumber}&quarter_name=${encodeURIComponent(quarter.name)}`;
  }
  ```
  When `quarterId` is defined, the backend looks up the quarter's
  `sequenceNumber`/`name` (via `quarterService.findByIdForActiveYear`,
  `backend/src/services/quarter.service.ts` lines 108-115) and forwards
  `quarter_sequence`/`quarter_name` to excel-service (line 29,
  `${quarterParam}` appended to the excel-service URL).
- Because the frontend never sends `quarter_id`, `quarterId` is always
  `undefined` here, so `quarterParam` is always `''` — excel-service never
  receives `quarter_sequence`/`quarter_name`.

`quarter.controller.ts` / `quarter.service.ts` (`findAllForYear`,
`findByIdForActiveYear`) correctly expose each quarter's `startDate`/
`endDate`/`sequenceNumber`, which is exactly what the frontend already
consumes to populate the trimestre pills and set `dateFrom`/`dateTo` — this
part of the chain is fine and unused by the bug.

## Hop 3 — excel-service: how are the rendered months chosen?

File: `/home/rileo/ai-personal/excel-service/export.go`

- Lines 21-24: `monthNames` is a fixed Spanish month-name array (not the bug
  by itself — used only to translate a record's calendar month into the
  matching column header text already baked into the template).
- Lines 550-576, `resolveTrimesterSheetIndex(quarterSequenceRaw, quarterNameRaw string)`:
  ```go
  func resolveTrimesterSheetIndex(quarterSequenceRaw, quarterNameRaw string) (int, error) {
      if quarterSequenceRaw != "" { ... return n - 1, nil }
      if quarterNameRaw != "" { ... }
      return 0, nil
  }
  ```
  When both `quarter_sequence` and `quarter_name` are empty (exactly what
  happens today, since Hop 1/2 never send them), this **defaults to sheet
  index 0** — i.e. always the *first* trimestre sheet in the template
  (`plantilla_asistencia.xlsx`), whose row-7 month headers are a fixed,
  hardcoded set of months for that specific sheet.
- Line 844: `sheetIndex, errQ := resolveTrimesterSheetIndex(q.Get("quarter_sequence"), q.Get("quarter_name"))` — reads straight off the raw HTTP query params sent by the backend.
- Lines 578-595, `selectAndKeepSheet(f, sheetIndex)`: deletes every sheet
  except the one at `sheetIndex`, so the workbook returned to the user only
  ever contains that one (always sheet 0) sheet's layout/columns.
- Lines 626 (`getColumnMap(f, base)`) then reads the month names that are
  physically present in row 7 of *that one selected sheet* (`base`) to build
  the day→column mapping used when writing attendance marks (lines 676-682,
  730-737). Since `base` is always the same sheet (index 0) irrespective of
  the quarter picked in the UI, the exported columns always show that same
  sheet's fixed months — which is the reported "always May, June, July,
  August" — while the underlying SQL query (lines 880-903) correctly filters
  attendance rows using the *actual* selected `date_from`/`date_to` sent by
  the frontend, so the right records get pulled, but they get written into
  the wrong (constant) sheet/columns, or silently dropped by `colMap[mesNombre]`
  lookups (line 678, `ok` check) when the fetched records' month has no
  column in the always-selected sheet.

This `resolveTrimesterSheetIndex`/`selectAndKeepSheet` machinery is not
legacy dead code — per
`/home/rileo/ai-personal/excel-service/progress/impl_export_selects_the_correct_trimester_sheet.md`,
it was purpose-built (and unit-tested, R1-R8) specifically to let the caller
select the correct trimestre sheet via `quarter_sequence`/`quarter_name`.
The backend (`export.service.ts`) was updated to compute and forward those
two params. The one link that was never completed is the frontend actually
putting `quarter_id` on the outgoing `/api/export/excel` request — confirmed
by `grep -rn "quarter_id\|quarterId\|quarter_sequence\|quarter_name"` across
`frontend/src/app/features/student-report/*.ts`, which returns **zero
matches**.

---

## Exact break point

**File:** `/home/rileo/ai-personal/frontend/src/app/features/student-report/excel-export-dialog.component.ts`
**Method:** `downloadExcel()`, line 206

```ts
const url = `/api/export/excel?course_ids=${courseIds}&academic_year_id=${year.id}&date_from=${dateToDateString(this.dateFrom)}&date_to=${dateToDateString(this.dateTo)}`;
```

This line needs to append `&quarter_id=${this.activeQuarterId()}` (only when
`activeQuarterId()` is non-null, i.e. the user picked a trimestre pill rather
than typing a fully custom date range) so that `export.controller.ts` (line
17/29-36) receives it, `export.service.ts` (lines 20-27) resolves and
forwards `quarter_sequence`/`quarter_name`, and excel-service's
`resolveTrimesterSheetIndex` (export.go lines 550-576) picks the sheet that
actually matches the selected trimestre instead of always defaulting to
index 0.

## Summary

The selected quarter's date range is captured correctly in the UI
(`applyQuarter()` sets `dateFrom`/`dateTo` from the quarter's `startDate`/
`endDate`) but the id of that quarter is dropped at the very first hop:
`ExcelExportDialogComponent.downloadExcel()` (excel-export-dialog.component.ts:206)
never adds `quarter_id` to the `/api/export/excel` request, even though the
component already tracks it via `activeQuarterId`. The backend
(`export.controller.ts`, `export.service.ts`) and excel-service
(`export.go`'s `resolveTrimesterSheetIndex`/`selectAndKeepSheet`, added by a
prior feature) are both fully implemented to resolve a `quarter_id` into a
`quarter_sequence`/`quarter_name` and use it to pick the correct trimestre
sheet in the template — they just never receive it, so excel-service always
falls back to its default `sheetIndex = 0`, i.e. the same first-trimestre
template sheet with the same hardcoded month columns every time, which is
why the exported file always shows May/June/July/August no matter which
trimestre the user actually selected. The fix is a one-line addition in the
frontend to include `quarter_id` (from `activeQuarterId()`) in the export
request URL.
