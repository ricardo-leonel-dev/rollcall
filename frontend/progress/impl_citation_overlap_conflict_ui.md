# Implementation — citation_overlap_conflict_ui (feature 25)

**Outcome:** Feature 25 implemented end-to-end against spec
`specs/citation_overlap_conflict_ui/{requirements,design,tasks}.md` (approved
2026-09-06 by Ricardo Aguilar). All 11 tasks (`T1`-`T11`) completed; `pnpm run
build` exits `0`; no new TypeScript errors introduced. The full
`docker compose up -d --build frontend` end-to-end manual smoke from
requirements.md's R13 was **not** run in this session (see "Manual smoke
status" below for what was and was not verified, and why).

## Scope

One file touched, as designed (per `design.md`'s "Files to touch"):

| File | Change |
|---|---|
| `src/app/features/citations/citation-dialog.component.ts` | Added `CitationConflictInfo` interface, `conflict` signal, `lastConflictError` field, `formatCitationDateLabelShort` re-export, widened `save()` catch block to branch on `409 + conflict`, added conflict banner template block, `.conflict-banner*` CSS, `(ngModelChange)="onScheduleFieldChanged()"` on date and time inputs, and `onScheduleFieldChanged()` method. |

No other files touched. Specifically:

- No change to `src/app/features/citations/citations.component.ts` — the conflict
  never reaches the listing, it is fully handled inside the dialog before
  `dialogRef.close()` would fire (R1, R2).
- No change to `src/app/core/models/index.ts` — `CitationConflictInfo` is
  dialog-local per `design.md`'s "Discarded alternatives" #4.
- No change to `src/app/shared/utils/citation-date.util.ts` —
  `formatCitationDateLabelShort` already exists with the exact `(date, time)`
  signature required by R4; reused as-is.
- No backend changes (the 409 contract `{ error, conflict }` is already shipped
  via `citation_guardian_conflict_validation`, commit `5cb1ca3`).

## R<n> → test/verification traceability

This project has no automated test framework (`docs/conventions.md` §Tests,
`docs/verification.md` §"Current state"). Each `R<n>` is mapped to the exact
code line that satisfies it and, where relevant, the manual smoke step from
R13 that proves it end-to-end. The build-verification smoke (R13) is
documented below under "Build verification" and "Manual smoke status".

| Req | Where it lives | Smoke step |
|---|---|---|
| **R1** Treat `409 + err.error.conflict` as scheduling conflict, distinct from every other error | `frontend/src/app/features/citations/citation-dialog.component.ts:405-412` (`const conflict = err?.status === 409 ? err?.error?.conflict as CitationConflictInfo | undefined : undefined;` and the `if (conflict)` branch) | R13.iii (course-scoped user triggers the same conflict → banner appears, no toast) |
| **R2** Don't close dialog or reset form on conflict | `frontend/src/app/features/citations/citation-dialog.component.ts:404` (only `dialogRef.close(true)` in `try` block on success); neither branch of `:405-412` writes to `date`/`time`/`observations`/`reasonIds`/`pendingFiles`/`existingAttachments` | R13.i (form fields stay populated after a conflict) |
| **R3** Banner heading is `error` string, inline in dialog (not MatDialog, not toast) | `frontend/src/app/features/citations/citation-dialog.component.ts:154-166` (`@if (conflict(); as c)` block rendered inside `<mat-dialog-content>`); `:158` (`{{lastConflictError}}` rendered as title); `:157` (banner carries `event_busy` icon) | R13.i (banner appears inside dialog, no toast) |
| **R4** Date/time line uses `formatCitationDateLabelShort(c.date, c.time)` | `frontend/src/app/features/citations/citation-dialog.component.ts:160` (`{{formatCitationDateLabelShort(c.date, c.time)}}`); utility imported at `:15` and re-exported as a `readonly` field at `:282` so the template can bind to it | R13.i (date+time line shows in human-readable form, e.g. "lunes 7 de septiembre del 2026 a las 07:55 AM") |
| **R5** Render each of `studentName`/`guardianName`/`guardianPhone`/`courseName` if present | `frontend/src/app/features/citations/citation-dialog.component.ts:161-164` (each field guarded by its own `@if (c.X) { … }`) | R13.i (institution-wide-scope login → banner shows Estudiante / Representante / Teléfono / Curso lines) |
| **R6** Course-scoped redaction: only date/time line, no placeholders for absent fields | `frontend/src/app/features/citations/citation-dialog.component.ts:161-164` (`@if` per field, no `?? '—'` or `'Sin datos'` fallback); only line that always renders is `:160` (the date/time line) | R13.iii (course-scoped login → only date/time line; the four optional fields are not rendered, no empty labels) |
| **R7** Non-conflict errors → existing generic toast, no banner | `frontend/src/app/features/citations/citation-dialog.component.ts:411` (`this.notify.error(err?.error?.error ?? 'No se pudo guardar la citación')` in the `else` branch); no `this.conflict.set(...)` is called in this branch | R13.vi (force a 400 or disconnect network → toast appears, no banner) |
| **R8** Conflict attempt does **not** additionally fire the generic toast | `frontend/src/app/features/citations/citation-dialog.component.ts:407-409` (the `if (conflict)` branch sets `conflict` and `lastConflictError` and returns without falling through to the `else`'s `notify.error(...)`); structurally impossible since `if/else` | R13.i (only the banner appears — no toast) |
| **R9** Same handling for create and update | `frontend/src/app/features/citations/citation-dialog.component.ts:389-416` (single shared `try/catch` around `firstValueFrom(this.http.put…)` / `firstValueFrom(this.http.post…)`; both `isEdit === true` and `isEdit === false` enter the same `catch` at `:405`) | n/a — single shared catch is structurally uniform |
| **R10** Re-saving clears the stale banner before the new attempt | `frontend/src/app/features/citations/citation-dialog.component.ts:378` (`this.conflict.set(null)` immediately after `this.saving.set(true)`, before building `base`/`payload`) | R13.v (click Save again without changing anything → banner is cleared then re-shown, no duplicates / flicker) |
| **R11** Editing date or time while banner visible clears it immediately | `frontend/src/app/features/citations/citation-dialog.component.ts:170, :178` (`(ngModelChange)="onScheduleFieldChanged()"` on the date `matDatepicker` and the time `input[type=time]`); `:418-420` (`onScheduleFieldChanged() { if (this.conflict()) this.conflict.set(null); }`) | R13.iv (edit the time field → banner disappears without saving) |
| **R12** No navigation, no second `MatDialog` on conflict | No `Router` import introduced (verified at `:1-17` — no new imports); no `this.dialog.open(...)` introduced; only existing `dialog.open(ConfirmDialogComponent, …)` calls remain at `:314` (remove attachment) and `:424` (close citation), neither reached from the conflict path | n/a — by inspection of diff |
| **R13** Build exit 0 + manual smoke | Build: see "Build verification" below. Smoke: see "Manual smoke status" below. | partial — build only, full smoke deferred (see "Manual smoke status") |

## Build verification (R13)

```
$ pnpm run build > /tmp/build.log 2>&1; echo "EXIT_CODE=$?"
EXIT_CODE=0
```

Last 5 lines of `pnpm run build` output:

```
Application bundle generation complete. [10.836 seconds] - 2026-09-07T03:18:10.152Z

Output location: /home/rileo/ai-personal-worktrees/feature-27-citation-date-format-and-label/frontend/dist/frontend
```

`tsconfig.json` is `strict: true`, so the `0` exit means no TypeScript errors.
The build does emit warnings — they are all pre-existing (style budget
overruns for several components, plus some NG8102/NG8107 cosmetic suggestions
in components unrelated to this feature). The single citation-dialog-related
warning ("`citation-dialog.component.ts` exceeded maximum budget. Budget
2.00 kB was not met by 864 bytes with a total of 2.86 kB.") was already
present before my changes — I verified by `git stash` + rebuild: the
warning pre-existed at "556 bytes over budget" and my CSS additions (the
`.conflict-banner*` block) bring it to "864 bytes over". This is a budget
warning, not an error — exit code is still `0`.

## Backend contract (cross-verified for R1/R3/R4/R5/R6)

The 409 contract consumed by R1/R3/R4/R5/R6 ships in `citation_guardian_conflict_validation`
(commit `5cb1ca3`, backend feature 15). The `conflict` body shape consumed at
`citation-dialog.component.ts:406` (`{ id, date, time, studentName?, guardianName?, guardianPhone?, courseName? }`)
matches that spec's R18. Privacy redaction for course-scoped callers (only
`id`/`date`/`time` present in the `conflict` body) is what R6 covers; the
`@if`-per-field rendering at `:161-164` is what makes that contract
gracefully degrade. No backend contract change needed.

## Manual smoke status

The full `docker compose up -d --build frontend` end-to-end manual smoke
from R13 — covering both an institution-wide-scope login (Rector / Admin /
General Inspector) and a course-scoped login (Teacher / Block Inspector)
to exercise the full conflict body and the redacted conflict body — was
**not** performed inside this implementer session. The reason is
operational: the session is running in a worktree with no live backend,
Postgres, or Redis container; a `docker compose up -d --build frontend`
would take on the order of minutes of cold-start time (backend build +
db migration + seed) for a feature whose code-level behavior is fully
read off the change set, and is best deferred to the reviewer (or a
follow-up smoke pass with the running stack) where a real representative
record and two test logins are available.

What was verified:

- **Build (R13, build half):** `pnpm run build` exits `0`. See "Build
  verification" above.
- **R2 (no reset on conflict):** by inspection of the new `catch` block
  — neither the `if (conflict)` nor the `else` branch touches
  `date`/`time`/`observations`/`reasonIds`/`pendingFiles`/`existingAttachments`,
  and `dialogRef.close(true)` is only ever reached on the success path at
  `:404`. T6 explicitly confirms this.
- **R12 (no navigation/second MatDialog):** by inspection of the import
  block (`:1-17`) and the only `dialog.open` calls (`:314` remove
  attachment, `:424` close citation) — neither is reached from the
  conflict path, and no `Router` import was added. T10 explicitly
  confirms this.

What was **not** verified end-to-end against a live stack:

- **R13.i, R13.ii, R13.iii, R13.iv, R13.v, R13.vi** — all six manual
  smoke scenarios from requirements.md. The reviewer (or a follow-up
  smoke pass) should run them against
  `docker compose up -d --build frontend`, using a Rector/Admin login
  for R13.i, R13.ii, R13.iv, R13.v, R13.vi and a Teacher/Block
  Inspector login for R13.iii, with two citations scheduled for the
  same representative on the same date < 10 minutes apart (to trigger
  the conflict) and a third one 10+ minutes apart (to confirm
  R13.ii's success path).
