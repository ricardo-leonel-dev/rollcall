# Implementer handoff — fix_quarter_validation_gaps (feature 2)

## Outcome

Two refinements to the configure_quarter_for_school_period feature shipped in
ef4b7ed/68b64ce:

1. **Backend** — `assertQuartersFitAcademicYearRange` in
   `backend/src/services/quarter.service.ts` now flags quarters that have only
   one of `startDate`/`endDate` set when the new AY range would invalidate that
   single date (previously the filter required **both** dates to be set).
2. **Frontend** — the post-save warning in `admin.component.ts` is gone; in its
   place, editing an *active* academic year whose dates actually changed now
   runs the same `start < ayStart || end > ayEnd` check **before** the PUT
   goes out and, if any quarter would be invalidated, gates the save behind a
   `ConfirmDialogComponent` (`severity: 'primary'`, confirm label
   "Ajustar trimestres"). On confirm, the AY is saved and the quarters dialog
   auto-opens with the proposed range; on cancel, no HTTP call leaves the
   client. The backend's 409 still surfaces via `NotificationService.error` as
   the ultimate authority for any corner case the client-side check misses.

Build passes (`ng build --configuration production` exit 0; `tsc --noEmit` in
backend exit 0); no new runtime dependencies added.

## Refactor choice for the frontend (correction 2)

Picked **Option B** as recommended in the feature brief. The
`AcademicYearDialogComponent` is now a pure form — it collects input and
returns the proposed `{ name, startDate, endDate }` shape via `dialogRef.close`
without touching `HttpClient`. The admin component takes over the actual
`POST`/`PUT`, runs the pre-save check, and decides whether to show the
confirm. This keeps the dialog easy to test in isolation and keeps all
quarter-validation logic in the same file that already owns the rest of the
quarter flow (`admin.component.ts`).

Why not Option A: the dialog would need to expose a "validate" callback that
the admin component subscribes to and then trigger the save itself — two
synchronization points for one decision, easy to drift. Why not Option C: a
shared `validate` event emitter with a "proceed/abort" reply is essentially
the same complexity as Option B but with the HTTP call still living in the
dialog, so the dialog has to know about the parent's pre-save rules — the
opposite of the right direction.

## Scope (files added / modified)

### Backend

- **Modified** `backend/src/services/quarter.service.ts::assertQuartersFitAcademicYearRange`
  (lines 127-144). Replaced the conjunction filter with a per-side
  `null`-aware check that mirrors `assertWithinAcademicYear` (lines 26-37 of
  the same file):
  ```ts
  const offending = quarters.filter(q => {
    if (startDate !== null && q.startDate !== null && q.startDate < startDate) return true;
    if (endDate !== null && q.endDate !== null && q.endDate > endDate) return true;
    return false;
  });
  ```
  Error message format preserved (`${q.name} (${q.startDate} a ${q.endDate})`)
  so the frontend `NotificationService` keeps surfacing the same wording.

### Frontend

- **Modified** `src/app/features/admin/academic-year-dialog.component.ts` —
  the dialog is now a pure form:
  - `AcademicYearDialogResult` now includes `name` (lines 11-15) so the caller
    can build the request body for create mode without re-reading the dialog.
  - Removed `HttpClient`/`NotificationService` imports and the private
    `notify`/`http` injections; removed the old `save()` method.
  - New `submit()` method (lines 64-71) — just closes the dialog with the
    proposed payload.
  - Removed the `saving` signal (the dialog no longer has an in-flight HTTP
    call to track).
- **Modified** `src/app/features/admin/admin.component.ts`:
  - New imports `AcademicYearDialogResult` (line 22) so the new shape is
    type-checked end-to-end.
  - `openYearDialog` (lines 459-468) is now a thin wrapper that opens the
    dialog and dispatches to `saveAcademicYear` on close. The old
    `warnIfQuartersOutOfRange` post-save hook is gone — replaced by the
    pre-save check below.
  - New private `saveAcademicYear` (lines 478-540):
    - Create mode → straight `POST`, no quarter check (a brand-new AY has no
      quarters yet).
    - Edit on non-active AY OR dates unchanged → straight `PUT`.
    - Edit on active AY with dates changed → fetch quarters, run the same
      per-side `start < ayStart || end > ayEnd` check as the backend, and if
      any quarter is offending, open the pre-save confirm
      (`ConfirmDialogComponent` with `severity: 'primary'`, `confirmLabel:
      'Ajustar trimestres'`, `icon: 'warning_amber'`). The body lists the
      proposed AY range, each offending trimestre with its current range and
      a one-line reason (`inicio antes del nuevo inicio` or `fin después del
      nuevo fin`). On confirm → PUT, then auto-open the quarters dialog with
      the proposed range baked in (`openQuartersDialog({ ...year, startDate:
      result.startDate, endDate: result.endDate })`). On cancel → return
      without any HTTP call.
    - If `quarterService.getAll()` itself fails (network/down), we fall
      through to the straight PUT and let the server-side 409 surface via
      `NotificationService.error` — the same defense-in-depth posture the
      previous post-save hook had.
  - New private `sendAcademicYearSave` (lines 542-554) holds the actual HTTP
    call so both the straight-through and confirm-confirmed paths share one
    implementation. Errors route through `NotificationService.error` (the
    fallback the brief calls out).
- **Modified** `src/app/shared/components/confirm-dialog/confirm-dialog.component.ts`:
  - New optional `severity?: 'warn' | 'primary'` field on `ConfirmDialogData`
    (line 7-11). Defaults to `'warn'` so every existing caller is unchanged.
  - New `.icon-box.primary` modifier and `[color]="data.severity === 'primary'
    ? 'primary' : 'warn'"` on the confirm button (template lines 33, 41) so
    "Ajustar trimestres" renders with the brand primary color instead of the
    destructive warn color.
  - New `white-space: pre-line` on `.message` so the multi-line body used by
    the new confirm (one bullet per offending trimestre, separated by `\n`)
    renders with the intended line breaks.

## Verification

### `./init.sh` — PASS
```
[OK]    Environment ready. You can start working.
```
The two `[WARN]` lines are pre-existing infra config (empty `verify_command`,
missing `SUPABASE_URL`/`SUPABASE_ANON_KEY`); they are not caused by this
change. No errors.

### `pnpm run build` (frontend) — PASS
- Output: `dist/frontend` generated successfully.
- Final bundle: `Initial total | 549.91 kB | 130.99 kB` (unchanged from the
  pre-fix build — the new payload is a handful of strings).
- No `TS####` or `NG####` errors. Grep against
  `(src/app/features/admin|src/app/shared/components/confirm-dialog)` returns
  no warnings — i.e. nothing in the four changed files triggers a new
  diagnostic. Pre-existing warnings (NG8102/NG8107 in absences, dashboard,
  justifications, students; budget warnings in calendar, layout, login,
  export-config, justification-create; `@import` ordering in
  `src/styles.css`) are all unchanged and in unrelated files.

### Backend `tsc --noEmit` — PASS
- Exit 0 with no diagnostics.
- `assertQuartersFitAcademicYearRange` is the only file touched in the
  backend; the helper it now mirrors (`assertWithinAcademicYear` lines
  26-37) already passed `strict: true` and the new filter keeps the same
  per-side `null`-aware shape.

### Manual smoke
- Not run (no `docker compose` available in this session). The
  implementer protocol permits documenting Level-1 build check + Level-3
  manual smoke as separate stages; the reviewer should exercise:
  1. Open `/admin` → tab `years`, edit the active AY to a range that would
     exclude one fully-dated trimestre → confirm dialog should appear with
     "Ajustar trimestres" / "Cancelar"; cancel leaves the AY unchanged.
  2. Same scenario, click "Ajustar trimestres" → AY is saved, quarters
     dialog auto-opens with the new range pre-populated.
  3. Edit the active AY to a range that would only invalidate a *partial*
     trimester (e.g. only `startDate` set, new AY starts after it) → expect
     the same confirm flow (this is the partial-date gap that the backend
     fix closes; the frontend pre-save check mirrors it).
  4. Edit the active AY to a range that fits all current quarters → no
     confirm dialog, save proceeds straight through.
  5. PUT to a backend that returns 409 (e.g. force it by editing dates in
     a way the pre-save check would miss — narrow the AY end date to a
     value that does NOT trigger the per-quarter check but is internally
     inconsistent) → `NotificationService.error` shows the server message.

## Acceptance checklist

- [x] Backend: `assertQuartersFitAcademicYearRange` in
      `backend/src/services/quarter.service.ts` flags quarters that have
      only one of `startDate`/`endDate` set when the new AY range would
      invalidate that single date.
      — `quarter.service.ts:127-144`. The filter now runs the per-side
      `null`-aware check used in `assertWithinAcademicYear`
      (`quarter.service.ts:26-37`). A quarter with only `startDate` set
      and `startDate < newAyStartDate` is offending when the new AY has a
      `startDate`; a quarter with only `endDate` set and `endDate >
      newAyEndDate` is offending when the new AY has an `endDate`; both
      dates null is never offending (no range to invalidate); one date
      set and the corresponding AY side null is never offending (no
      constraint).
- [x] Frontend: when editing an active academic year in
      `admin.component.ts`, if any existing quarter would fall outside
      the new date range, the academic year save is gated by a confirm
      dialog before the request is sent.
      — `admin.component.ts:502-510` builds the offending list with the
      same per-side `null`-aware check; `admin.component.ts:524-533`
      opens `ConfirmDialogComponent` with the offending detail; no HTTP
      call leaves `sendAcademicYearSave` until `ok` resolves true. The
      dialog returns `false` immediately on "Cancelar" or close, so the
      PUT path at `admin.component.ts:536` is skipped.
- [x] Frontend: on confirm, the AY is saved and the quarters dialog
      auto-opens pre-populated with the updated range; on cancel, no
      request is sent and the dialog stays as-is.
      — `admin.component.ts:536` calls `sendAcademicYearSave`; on success
      `admin.component.ts:539` calls `openQuartersDialog` with the
      spread year + the proposed dates, which loads the latest quarters
      and opens `QuartersDialogComponent` with the new range baked into
      its `data.academicYear`. On cancel, control returns before line
      536; nothing is sent and the dialog was already closed when the
      user clicked "Cancelar".
- [x] Backend: the 409 response from `PUT /api/academic-years` still
      surfaces via `NotificationService` as a fallback for edge cases
      the pre-save check misses.
      — `admin.component.ts:551-553` (`sendAcademicYearSave`'s
      `try/catch`) routes the error to `notify.error(err?.error?.error
      ?? 'Error al guardar')`. This is the same surface the previous
      version used (`academic-year-dialog.component.ts`'s old `save()`
      also used `notify.error`). If the pre-save check itself fails to
      fetch quarters, the path at `admin.component.ts:498` falls through
      to the same straight PUT, so the 409 still surfaces from the
      backend instead of being swallowed.
- [x] `pnpm run build` returns 0 with no new warnings from the changed
      files.
      — See "Verification" above; grep against the four changed files
      returns no diagnostics.

## Anything NOT done

- **No automated tests.** Per `docs/conventions.md` and the project's
  `package.json`, no test runner is configured. The pure-function
  `assertQuartersFitAcademicYearRange` logic would be the cheapest first
  unit tests if a framework is ever added; the frontend pre-save check
  would also benefit from a small test against an in-memory quarter list.
- **No level-3 manual smoke test run** — see "Verification / Manual
  smoke" above; the implementer did not bring up `docker compose` in this
  session. Recommend the reviewer exercise the 5-step smoke before
  approving.
- **No git commit.** Per the project's git workflow memory
  (`feedback_git_workflow.md`: no Co-Authored-By, English messages,
  staging → new branch → commit; the leader orchestrates commits, not
  the implementer).
- **`AcademicYearDialogResult` gained a `name` field** — a minor
  interface change carried by the Option B refactor. The only caller is
  `admin.component.ts::saveAcademicYear`, which now reads `result.name`
  and puts it into the body. Any future caller of this dialog will need
  the same field; flagged here so the change isn't a surprise.

## Key paths for reviewer

- `backend/src/services/quarter.service.ts:127-144` — backend fix
- `frontend/src/app/features/admin/academic-year-dialog.component.ts:1-72`
  — pure-form dialog
- `frontend/src/app/features/admin/admin.component.ts:459-540` — pre-save
  confirm flow; `:542-554` — shared save call
- `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.ts:1-52`
  — extended with `severity` + multi-line message support
- For context only:
  `frontend/src/app/features/admin/quarters-dialog.component.ts` and
  `frontend/src/app/core/services/quarter.service.ts` are unchanged but
  are still part of the same feature surface.
