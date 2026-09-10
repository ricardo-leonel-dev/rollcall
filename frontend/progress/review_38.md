# Review — feature 38 — `students_report_chapter_header`

**Verdict:** APPROVED

## Checkpoints

- C1: [x]
- C2: [x]
- C3: [x]
- C4: [x]
- C5: [x]
- C6: N/A — feature is sdd=0

## Diff shape

`git show --stat ea9839d` reports exactly the two expected `.component.ts` files
(`student-management.component.ts` +7, `student-report.component.ts` +7/-1, total
14 insertions / 1 deletion). No other source file in the commit. The commit
message itself documents no other source files.

`git diff origin/staging -- src/app/features/students/student-history.component.ts`
returns zero lines — `student-history` is byte-identical to staging, confirming
the explicit exclusion in the feature description.

## Pattern conformance

Both `<app-chapter-header>` elements are inserted **above** the existing
`<div class="page-header"><h1 class="page-title">…</h1></div>`, with
`icon` + `eyebrowPrefix` + `eyebrowSuffix` and no `title` input. The h1 stays
in the host page. This matches the corrected pattern from feature 35 and the
shape of commits `4537e79` (feature 37) and `9849f26` (feature 39) line-for-line.

## Eyebrow strings

- `student-management.component.ts` line 32-34:
  `eyebrowPrefix="Estudiantes"`, `eyebrowSuffix="Nómina por curso"` — matches
  the feature description.
- `student-report.component.ts` line 181-183:
  `eyebrowPrefix="Inspectoría"`, `eyebrowSuffix="Exportación de informes"` —
  matches the feature description.

`progress/visual_feature38_*_desktop.json` files confirm rendering:
- students desktop: `eyebrowRoman: "Estudiantes"`, `eyebrowSub: "Nómina por curso"`, `doubleFiletePresent: true`
- student-report desktop: `eyebrowRoman: "Inspectoría"`, `eyebrowSub: "Exportación de informes"`, `doubleFiletePresent: true`, `srCardCount: 5`

## Material icons

- `groups` is already used in the codebase (`src/app/features/student-report/export-config-dialog.component.ts:312`), so the icon registry/font loads it.
- `summarize` is a standard Material icon; the existing per-card icons on the
  student-report page (`event_busy`, `schedule`, `task_alt`, `tune`, `grid_on`)
  confirm the `mat-icon` font is already loaded for this route.

## Import order

`student-report.component.ts` (lines 1-6): `@angular/core` → `@angular/material/icon`
→ `@angular/material/dialog` → shared (`ChapterHeaderComponent`) → sibling feature
dialogs. Correct per `docs/conventions.md`.

`student-management.component.ts` (line 15): new import placed alongside
`WhatsappIconComponent` (the other shared-component import). This follows the
file's existing pattern (shared components grouped before services), which is
a minor pre-existing convention drift in this file but not introduced by this
change — see Non-blocking observations.

## No collateral damage

Both diffs are purely additive: new `ChapterHeaderComponent` import, new
`ChapterHeaderComponent` entry in the `imports: [...]` array, and the new
`<app-chapter-header>` element above the existing `page-header`. No `styles:`
blocks, h1, button, filter-bar, action menu, sr-card grid, or table code
touched.

`./init.sh` exits green (env OK + snapshot regenerated; the verify_command WARN
is the documented `sdd=0` / no-test-suite state, not a regression).

## Build

`pnpm run build` re-run from the worktree root: `EXIT=0`, zero `ERROR` lines,
zero TypeScript errors. The only warnings are the same pre-existing per-component
CSS-budget (≤ 2 kB) warnings that already fire on every Cuaderno page (e.g.
`calendar.component.ts: +1.97 kB`) — no new warnings introduced.

## Scratch / commits

`scripts/visual-smoke-38.mjs` exists as a local-only file in the working tree
(`git ls-files` returns 0 lines for it) and is not part of the commit. This
matches the conventions.md allowance for ephemeral local-only scratch files in
`frontend/scripts/`. No accidental scratch committed.

## Acceptance criteria (from `state/features/038-students_report_chapter_header.md`)

- [x] Ambas pantallas muestran su eyebrow y doble filete correspondiente —
  screenshots `progress/visual_feature38_students_desktop.png` and
  `progress/visual_feature38_student_report_desktop.png` show the eyebrows
  ("ESTUDIANTES · NÓMINA POR CURSO" and "INSPECTORÍA · EXPORTACIÓN DE INFORMES")
  with the double filete below; matching JSON reports `doubleFiletePresent: true`.
- [x] La grilla de tarjetas de Informe estudiantil (sr-card, gradientes, thumbnail)
  no cambia — JSON reports `srCardCount: 5`, screenshot shows all five cards
  (Faltas, Atrasos, Justificaciones, Personalizado, Excel); diff does not
  touch the `styles: [...]` block or any `.sr-*` class.
- [x] La tabla de Administración de estudiantes conserva su comportamiento
  (filtros, búsqueda, menú de acciones) — diff does not touch the table,
  filter-bar, search input, or row-action menu in source.

## Non-blocking observations

- `student-management.component.ts` keeps its pre-existing local-import order
  (shared components at lines 14-15, services at lines 16-17). Strict
  `docs/conventions.md` says models/utils/services should come **before**
  shared components; the new `ChapterHeaderComponent` import follows the
  file's existing convention rather than correcting it. Not introduced by this
  feature; worth a one-line opportunistic re-order whenever it next changes
  for another reason, but not a blocker here.

## Decision

Approved.