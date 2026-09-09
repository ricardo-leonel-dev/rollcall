# Implementer report — feature 39 `citations_chapter_header`

## Scope

Apply the Cuaderno chapter-header pattern (eyebrow + double filete, no `title`) to the
last remaining non-admin Inspectoría screen flagged by the foundation: **Citaciones**.
Mirrors features 35/36/37 exactly — the screen already has its own `<h1 class="page-title">`,
so the chapter-header renders as a sibling above it without touching the h1 block,
the filter bar, the empty state, the roster grid, the citation pills, or the dialogs.

## Eyebrow suffix choice

`Registro de citaciones` (not `Citaciones` or `Administración de citaciones`).

- `Citaciones` would just duplicate the h1 — too thin, no real category signal.
- `Administración de citaciones` mirrors the sidebar entry but copies the long
  sidebar label verbatim, and feature 37 already chose a different framing for
  the two parallel screens there.
- `Registro de citaciones` parallels the most analogous screen from feature 37
  (absences had `Inspectoría · Registro de asistencia`). Both absences and
  citations are registries of student behavior over a trimester — the
  `Registro de <X>` phrasing captures that and reads naturally as
  `Inspectoría · Registro de citaciones` in the chapter eyebrow.

## Diff summary

- `src/app/features/citations/citations.component.ts`
  - Added `import { ChapterHeaderComponent } from '../../shared/components/chapter-header/chapter-header.component';`
  - Added `ChapterHeaderComponent` to the standalone `imports` array.
  - Inserted before `<div class="page-header">`:
    ```html
    <app-chapter-header
      icon="campaign"
      eyebrowPrefix="Inspectoría"
      eyebrowSuffix="Registro de citaciones" />
    ```
- `icon="campaign"` matches `src/app/core/nav-items.ts:40` (the Inspectoría sidebar
  entry for citations) and is the same icon used inside the existing empty state
  of this screen (line 96 of the same file).

Nothing else changes:
- h1 `Citaciones` stays in its own `.page-header` block (no `title` prop on the
  chapter header — same correction applied to feature 35).
- No styles touched; no other components touched; no logic touched.

## Verification

- `pnpm build` — exit 0. Only pre-existing CSS budget warnings, all on files
  this feature did not touch (absences, admin, login, calendar,
  citation-dialog, justification-create-dialog, student-report/export-config-dialog).
- Visual smoke via `scripts/visual-smoke.mjs` at three viewports:
  - Desktop 1440x900 — `progress/visual_citations_chapter_header.{png,json}`
  - Tablet 1024x768 — `progress/visual_citations_chapter_header_tablet.{png,json}`
  - Mobile 375x667 — `progress/visual_citations_chapter_header_mobile.{png,json}`
- All three reports show `institutionEyebrow` (and the per-tab mirrors:
  `coursesEyebrow`/`citationReasonsEyebrow`/`permissionsEyebrow`/`rosterEyebrow`)
  filled in with:
  - `roman: "Inspectoría"`
  - `sub: "Registro de citaciones"`
  - `separator: "·"`
  - `full: "campaignInspectoría·Registro de citaciones"`
- `institutionFiletePresent: true` (and the four per-tab mirrors) at every viewport —
  double filete rendered below the eyebrow.

## Acceptance criteria status

1. Eyebrow + double filete render above the filter bar on the Citaciones screen. PASS.
2. h1 `Citaciones` remains in its own `.page-header` block, untouched. PASS.
3. Filter bar (`Periodo` / `Curso` selectors), empty state (campaign icon +
   "Selecciona un curso…"), roster grid, pill row, and citation dialogs render
   identically to feature 37's pre-migration baseline. PASS (no edits to those
   blocks).

## Files changed

- `/home/rileo/ai-personal-worktrees/feature-29-cuaderno-institucional/frontend/src/app/features/citations/citations.component.ts`

## Depends on

- `cuaderno_foundation_chapter_header_seal_breakpoint` (feature 29) — provides
  `<app-chapter-header>` standalone component.
