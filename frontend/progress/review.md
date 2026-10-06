# Review — feature 37

**Verdict:** APPROVED

## Checkpoints

- C1: [x]
- C2: [x]
- C3: [x]
- C4: [x]
- C5: [x]
- C6: N/A (sdd=0)

## Required Changes (if applicable)

None.

## Verification notes

- `git diff HEAD --stat`: only two files touched —
  - `src/app/features/absences/absences.component.ts` (+8/-1)
  - `src/app/features/justifications/justifications.component.ts` (+7/-1)
- Per-file diffs: only the `ChapterHeaderComponent` import, the imports-array
  entry (with a trailing comma on absences), and the `<app-chapter-header …/>`
  line inserted BEFORE the existing `<div class="page-header"><h1
  class="page-title">…</h1></div>` block. No styles, tabs, or logic touched.
- Eyebrow text exact match per spec:
  - `absences.component.ts` → `icon="event_busy"`, `eyebrowPrefix="Inspectoría"`, `eyebrowSuffix="Registro de asistencia"` (matches sidebar `nav-items.ts:37`).
  - `justifications.component.ts` → `icon="task_alt"`, `eyebrowPrefix="Inspectoría"`, `eyebrowSuffix="Historial de justificaciones"` (matches sidebar `nav-items.ts:38`).
- `<h1 class="page-title">` separation: both files keep their `<div class="page-header"><h1 class="page-title">…</h1></div>` block untouched. No `title` prop on `<app-chapter-header>` — feature 35's correction respected.
- Justifications evidence language preserved: `.just-card`, `.stamp-j`, `.evidence-tile`, `.detail-stamps`, `.evidence-row`, `.evidence-remove`, `.evidence-add-pill` all present and unmodified.
- Absences tabs preserved: `<mat-tab-group>` with Foto / Manual / Voz / Listado / Historial all present (lines 177, 180, 321, 387, 500, 638).
- `pnpm build` — exit 0. Pre-existing CSS budget warnings + `src/styles.css:8` `@import` warning only.
- `./init.sh` — exit 0, `[OK] Environment ready`.
- Visual smoke (Level 4) — six screenshots at desktop 1440x900, tablet 1024x768, mobile 375x667 confirm the eyebrow + double filete render above the filter bar at every viewport, and the h1 stays separate below.
- Smoke JSON behavior assertions (not just selectors):
  - `institutionEyebrow.roman: "Inspectoría"` (both pages).
  - `institutionEyebrow.sub: "Registro de asistencia"` (absences) / `"Historial de justificaciones"` (justifications).
  - `institutionEyebrow.separator: "·"`, `institutionEyebrow.present: true`.
  - `institutionTitle: null` (confirms no `title` prop).
  - `institutionFiletePresent: true` (confirms double filete renders).
- `progress/impl_37.md` — short summary (33 lines), lists diff, verification, and acceptance criteria pass/fail.
