# Feature 38 — students_report_chapter_header

**Status:** implemented; awaiting review.

## Scope

Two pages migrated to the Cuaderno institucional chapter-header:

1. **`features/students/student-management.component.ts`** — "Administración de estudiantes"
   - Eyebrow: `Estudiantes · Nómina por curso`
   - Icon: `groups` (already used as the empty-state icon on this page; consistent)
2. **`features/student-report/student-report.component.ts`** — "Informe estudiantil"
   - Eyebrow: `Inspectoría · Exportación de informes`
   - Icon: `summarize` (signals "report" specifically; pairs with the per-card
     icons already on the page: `event_busy`, `schedule`, `task_alt`, `tune`,
     `grid_on`)

`features/students/student-history.component.ts` is explicitly **out of
scope** per the feature description.

## Pattern used

Strictly the corrected pattern from feature 35 (commit `a81a484`):

- `<app-chapter-header>` is inserted **above** the existing `<div class="page-header"><h1>...</h1></div>`, **not** wrapping it.
- `title` is **not** passed — each host page keeps its own `<h1 class="page-title">` (this matches what feature 35 corrected after the initial deviated commit).
- `eyebrowSeparator` left at the component default (`·`), so the visual is `Estudiantes · Nómina por curso` and `Inspectoría · Exportación de informes`.
- Import order follows `docs/conventions.md`: `@angular/core` → other `@angular/*` → `@angular/material/*` → local services / models / shared components / sibling dialogs. `ChapterHeaderComponent` is added alongside `WhatsappIconComponent` in `student-management.component.ts` (shared components group) and as a new line between `MatDialog` and `ExportConfigDialogComponent` in `student-report.component.ts`.
- `imports: [...]` updated in each `@Component` decorator.
- **No** `.scss`/`.css` changes — the chapter-header brings its own styles.

## Files changed

```
src/app/features/students/student-management.component.ts
src/app/features/student-report/student-report.component.ts
scripts/visual-smoke-38.mjs                       # new, feature-38 visual capture
```

## Verification

- `pnpm run build` — **EXIT=0**, zero errors. The only warnings are the same
  pre-existing per-component CSS-budget warnings (≤ 2 kB) that already exist on
  every Cuaderno page; none are introduced by this change.
- Visual smoke (`scripts/visual-smoke-38.mjs`) captured desktop + mobile
  screenshots of both pages. Results from the run:

  | Page | Eyebrow | Icon | h1 | Double filete | Acceptance |
  | --- | --- | --- | --- | --- | --- |
  | `/students/manage` (desktop) | `Estudiantes · Nómina por curso` | `groups` | `Administración de estudiantes` | ✓ | matches "Estudiantes" + "Nómina por curso" |
  | `/students/manage` (mobile) | `Estudiantes · Nómina por curso` | `groups` | `Administración de estudiantes` | ✓ | matches |
  | `/inspectors/student-report` (desktop) | `Inspectoría · Exportación de informes` | `summarize` | `Informe estudiantil` | ✓ | `srCardCount: 5` — all five export cards still render |
  | `/inspectors/student-report` (mobile) | `Inspectoría · Exportación de informes` | `summarize` | `Informe estudiantil` | ✓ | `srCardCount: 5` |

  - `srCardCount: 5` on `/inspectors/student-report` proves the F/AT/J/CUSTOM/EXCEL grid is unchanged.
  - `/students/manage` shows its empty state (`Sin matrículas` because the visual smoke doesn't pre-select courses) — the table is conditionally hidden, which is its pre-existing behaviour. The h1, the "Nuevo estudiante" button, the filter bar (Curso selector + search field), and the row action menu are all unchanged in source.

Artifacts under `progress/`:
```
visual_feature38_students_desktop.png
visual_feature38_students_mobile.png
visual_feature38_student_report_desktop.png
visual_feature38_student_report_mobile.png
visual_feature38_students_desktop.json
visual_feature38_students_mobile.json
visual_feature38_student_report_desktop.json
visual_feature38_student_report_mobile.json
```

## Deviations from the canonical pattern

None. Both pages follow feature 37's commit shape exactly: chapter-header
above `page-header`, h1 stays, no `title` input, no scss edits, single commit.

## Open follow-ups (not part of this feature)

- `features/students/student-history.component.ts` was deliberately excluded
  (the description flagged it for "evaluar si conviene extender ahí también al
  implementar"). If/when decided yes, the same mechanical insertion applies —
  eyebrow candidates would be `Estudiantes · Historial por curso` and a
  `history` icon.