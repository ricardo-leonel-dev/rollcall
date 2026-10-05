# Implementation log — feature 35: dashboard_chapter_header

## Scope (files touched)

- `frontend/src/app/features/dashboard/dashboard.component.ts` — single file, 7 lines net added.

No new files. No CSS changes. No service changes. No backend changes.

## What changed

The pre-existing `<div class="page-header"><h1 class="page-title">Dashboard</h1><span>{{today}}</span></div>` block at the top of the dashboard template was replaced with the Cuaderno redesign's `<app-chapter-header>` component, keeping the today-date span on the right of the same `.page-header` flex container. Two imports were added: `ChapterHeaderComponent` (shared component from feature 29, API refined in feature 40) and its entry in the component's standalone `imports` array.

Inputs passed (chapter-header API as of feature 40):
- `icon="dashboard"` — Material `dashboard` glyph, accent-tinted, matches admin's `admin_panel_settings` pattern.
- `eyebrowPrefix="Inspectoría"` — required, rendered in `--ink` (heavier weight).
- `eyebrowSuffix="Resumen del período"` — required, rendered in `--muted-strong` (lighter weight).
- `eyebrowSeparator` — omitted, defaults to `·` (matches the spec's literal text "Inspectoría · Resumen del período").
- `title="Dashboard"` — optional, preserves the existing `<h1 class="page-title">Dashboard</h1>` semantics inside the chapter header (Nunito 30px weight 600 ink, identical to the removed `.page-title` rule in `styles.css:343-347`).

## What did NOT change (acceptance guardrails)

- `.stat-card`, `.card`, `.card-header`, `.card-title`, `.badge-F`, `.badge-AT`, `.badge-J`, `.stamp`, `.stamp-f`, `.stamp-at`, `.period-pill`, `.filter-bar`, `.alert-bar` — none touched. `git diff` against this file is exactly 7+/2−.
- Chart.js wiring (`barChart`, `donutChart`, `courseChart`): untouched. `renderCharts()` and the three `<canvas>` bindings render identically.
- Top 10 table with its `.badge-F`/`.badge-AT`/`.badge-J`/`.stamp-f`/`.stamp-at`/`.detail-stamps` decorations: untouched.
- Period pills + custom date range inputs (`mat-datepicker`): untouched.

## Verification

- **Build**: `./node_modules/.bin/ng build --configuration production` in the worktree → exit 0. Only pre-existing warnings (bundle budget, styles.css `@import` ordering, optional-chaining lints in unrelated files like `student-history*.component.ts` and `profile.component.ts` — all present before this feature's changes).
- **End-to-end against running stack**: applied the same edit to the main checkout (`/home/rileo/ai-personal/frontend`) so the running `frontend` container (port 80) could serve the new build. Rebuilt the image, restarted the container, then drove Playwright headless: login as `superadmin`/`Admin2026!`, land on `/home`, navigate to `/dashboard`, wait for charts, screenshot to `/tmp/feature-35/dashboard.png`.
- **Outcome** (from `/tmp/feature-35/dashboard.png`):
  - Eyebrow row: small Material `dashboard` icon in accent + `INSPECTORÍA · RESUMEN DEL PERÍODO` (uppercase, 11px Nunito 700, 0.08em tracking — spec-correct).
  - Title: `Dashboard` (Nunito 30px weight 600 ink) — preserved exactly where the old `<h1 class="page-title">` was.
  - Double filete: warm `--ink` line at 0.55 opacity + cool `--border` line below, both at `chapter-header.component.ts:74-92`.
  - Today date: `martes, 8 de septiembre de 2026` sits on the right of the `.page-header` flex container, vertically centered with the eyebrow + filete block (`.page-header` uses `flex items-center justify-between`).
  - Below the header: filters (Período + Curso), period pills, alert bar, stat cards, charts (bar chart for inasistencias + donut chart for faltas vs atrasos) — all rendering identically to the pre-change screenshot in memory.
  - Zero console errors / page errors during the navigation chain.

## Commit

- Branch: `feature/35-dashboard-chapter-header` (already existed pointing at staging; checkout reused via the existing worktree at `/home/rileo/ai-personal-worktrees/feature-29-cuaderno-institucional`).
- Commit: `21776b0 feat(frontend): add chapter header to dashboard (feature 35)`.
- Spec: `state/features/035-dashboard_chapter_header.md` updated to `status: shipped`, both acceptance items checked, implementer notes appended.

## Notes / follow-ups

- The main checkout's `frontend/src/app/features/dashboard/dashboard.component.ts` was temporarily edited to drive the screenshot, then **reverted** (so the only persistent record of the change is commit `21776b0` on the feature branch). If a reviewer notices the live stack serving feature-35 code, that's expected: the running container was rebuilt to serve the worktree's build.
- No new scope/bugs discovered beyond what's in the spec. The 7 sibling specs (030, 031, 033, 034, 036, 037, 038, 039) follow the exact same pattern; this PR serves as a worked example.
