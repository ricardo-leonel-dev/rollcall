# drop_quarter_unused_signal_import — Implementer Handoff

## Outcome

Removed the now-unused `signal` identifier from the `@angular/core` import in
`src/app/features/admin/academic-year-dialog.component.ts`. The previous feature
(`fix_quarter_validation_gaps`, commit `4e64cbb`) refactored this component from
"performs the save" to "pure form", deleting the `saving` signal but leaving the
identifier in the import list. This change finishes that cleanup. Build is still
green (exit 0); no behavior change.

## Scope

Single file, single line.

- **File:** `/home/rileo/ai-personal/frontend/src/app/features/admin/academic-year-dialog.component.ts`
- **Line:** 1 (import statement)

**Before**

```ts
import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
```

**After**

```ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
```

No other edits. No reformatting, no comment changes, no other files touched.

## Verification

`./node_modules/.bin/ng build --configuration production` (run from the frontend
directory; `pnpm` is not on `PATH` in this environment).

- Exit code: `0`
- Build output: `Application bundle generation complete. [8.534 seconds] - 2026-08-28T14:57:18.874Z`
- Output location: `/home/rileo/ai-personal/frontend/dist/frontend`
- Initial total: `549.91 kB` raw, `130.88 kB` estimated transfer (unchanged from
  baseline; removing one identifier from an import list has no measurable bundle impact).
- Post-edit grep for `signal` in the file: no matches (the identifier is fully gone,
  not just unused).

Pre-existing warnings (NG8107 / NG8102 / `@import` ordering / component-style budgets)
are unrelated to this change — they were present before this edit and are still
present after.

## Acceptance walkthrough

- AC1 — unused `signal` removed from import list:
  `src/app/features/admin/academic-year-dialog.component.ts:1` reads
  `import { Component, ChangeDetectionStrategy, inject } from '@angular/core';`
  (no `signal`).
- AC2 — no other `signal` reference remains in the file:
  `grep -n "signal" …/academic-year-dialog.component.ts` returns no lines.
- AC3 — build still green:
  `ng build --configuration production` exits 0 and produces
  `dist/frontend` with the same `Initial total | 549.91 kB` as baseline.