# Review — feature 36 (calendar_chapter_header)

**Verdict:** APPROVED

## Checkpoints

- C1: [x] `.harness.json`/`harness.db` present, docs filled in, `./init.sh`-equivalent (`pnpm run build`) exits 0.
- C2: [x] Only feature 36 is `in_progress`; session 55 reflects real current work (the eyebrow-text fix on top of commit `e7d0812`); sdd=0 so no test requirement beyond build green (matches `docs/verification.md`/CHECKPOINTS C4 note).
- C3: [x] Change is confined to `src/app/features/calendar/calendar.component.ts` inside `features/calendar/`, matching `docs/architecture.md`'s layer rules; no new dependency; no stray `console.log`/TODOs.
- C4: [x] No automated test suite exists yet for this project (per `docs/conventions.md`/CHECKPOINTS C4 note this only requires `pnpm run build` green) — ran it myself, exit 0, only pre-existing CSS-budget/NG8102 warnings unrelated to this diff.
- C5: [ ] N/A at review time — session not yet logged out (leader will run `log-out`); no stray untracked files present (`git status --porcelain` shows only the one modified file).
- C6: N/A — feature 36 has `sdd=0`.

## Verification detail

- Combined diff (commit `e7d0812` + uncommitted local fix) confined to `frontend/src/app/features/calendar/calendar.component.ts`:
  - Adds `import { ChapterHeaderComponent } from '../../shared/components/chapter-header/chapter-header.component';` (correct import-order slot: after service imports, shared components) and adds it to `imports: [...]`.
  - Adds `<app-chapter-header icon="calendar_month" eyebrowPrefix="Calendario" eyebrowSuffix="Vista mensual de asistencia" />` immediately before `.page-header`, with **no** `title` input — the `<h1 class="page-title">Calendario de Asistencia</h1>` stays in its own `.page-header` block, per feature 35's established correction pattern.
  - Rendered eyebrow text: `Calendario` + default separator `·` + `Vista mensual de asistencia` = "Calendario · Vista mensual de asistencia", matching `state/features/036-calendar_chapter_header.md`'s literal requirement exactly (this was the local fix under review — the initial commit had wrongly copied `Inspectoría · Calendario de Asistencia` from feature 35's pattern).
  - `git diff e7d0812^ -- .../calendar.component.ts` confirms the only touched lines are the import + `<app-chapter-header>` block — `.ledger-card`, `.month-header`, weekday grid, `.stamp-f`/`.stamp-at`, `.today-ring`, and all their styles are byte-for-byte untouched, satisfying the acceptance criterion "El .ledger-card y sus estilos internos no se modifican".
- `pnpm run build` run directly: exit 0. Only pre-existing warnings (CSS budget overages across several unrelated components including calendar's own pre-existing budget warning, `NG8102`/`NG8107` in `student-management.component.ts`, `@import` order in `styles.css`) — none introduced by this diff.
- `git status --porcelain` after build: only `frontend/src/app/features/calendar/calendar.component.ts` modified — no stray temp/debug files.

## Required Changes

None.
