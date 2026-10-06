# Implementer report — feature 37 `absences_justifications_chapter_header`

## Scope

Apply the Cuaderno chapter-header pattern (eyebrow + double filete, no `title`) to the
two remaining non-admin screens flagged by the feature description:
**Absences** and **Justifications**. Both already have their own
`<h1 class="page-title">` (feature 35's correction), so the chapter-header renders as a
sibling above it without touching the h1 block, the Foto/Manual/Voz tabs, the
`enroll-row`/`voice-zone`/`mic-btn` styles, or the Justifications
`.just-card`/`.stamp-j`/`.evidence-tile` evidence language.

## Diff summary

- `src/app/features/absences/absences.component.ts`
  - Added `import { ChapterHeaderComponent } from '../../shared/components/chapter-header/chapter-header.component';`
  - Added `ChapterHeaderComponent` to the standalone `imports` array.
  - Inserted before `<div class="page-header">`:
    ```html
    <app-chapter-header
      icon="event_busy"
      eyebrowPrefix="Inspectoría"
      eyebrowSuffix="Registro de asistencia" />
    ```
- `src/app/features/justifications/justifications.component.ts`
  - Added `import { ChapterHeaderComponent } from '../../shared/components/chapter-header/chapter-header.component';`
  - Added `ChapterHeaderComponent` to the standalone `imports` array.
  - Inserted before `<div class="page-header">`:
    ```html
    <app-chapter-header
      icon="task_alt"
      eyebrowPrefix="Inspectoría"
      eyebrowSuffix="Historial de justificaciones" />
    ```

Icons come from `src/app/core/nav-items.ts` (`event_busy` line 37 for absences,
`task_alt` line 38 for justifications) — both already match the sidebar entries.

## Verification

- `pnpm build` — exit 0, no TypeScript or template errors. Only pre-existing CSS
  budget warnings, all unrelated to the touched files (or pre-existing in
  `absences.component.ts` styles).
- Visual smoke via `scripts/visual-smoke.mjs` (existing shared script, per
  `docs/conventions.md`) at three viewports each:
  - Desktop 1440x900 — `progress/visual_absences_justifications_chapter_header_absences.{png,json}`,
    `progress/visual_absences_justifications_chapter_header_justifications.{png,json}`
  - Tablet 1024x768 — `..._absences_tablet.{png,json}`,
    `..._justifications_tablet.{png,json}`
  - Mobile 375x667 — `..._absences_mobile.{png,json}`,
    `..._justifications_mobile.{png,json}`
- All six reports show `permissionsEyebrow`/`rosterEyebrow` filled in with the expected
  `<icon>Inspectoría·<suffix>` text and `permissionsFiletePresent`/`rosterFiletePresent:
  true`, confirming both eyebrow + double filete render above the filter bar at every
  viewport. The original `<h1 class="page-title">` block is untouched.

## Acceptance criteria status

1. Both screens show their eyebrow + double filete. PASS (verified visually + DOM report).
2. Foto/Manual/Voz/Listado/Historial tabs unchanged. PASS (no edits inside those blocks).
3. Justifications `.just-card`, `.stamp-j`, `.evidence-tile` evidence tiles unchanged.
   PASS (no edits to those styles).

## Files changed

- `/home/rileo/ai-personal-worktrees/feature-29-cuaderno-institucional/frontend/src/app/features/absences/absences.component.ts`
- `/home/rileo/ai-personal-worktrees/feature-29-cuaderno-institucional/frontend/src/app/features/justifications/justifications.component.ts`
