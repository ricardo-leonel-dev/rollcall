# Implementer report — feature 35 `dashboard_chapter_header`

## Context

The feature's code already existed via commit `21776b0` ("feat(frontend): add chapter
header to dashboard (feature 35)"), which never went through the harness (no `claim`).
That commit's chapter-header integration was correct in spirit but deviated from the
approved spec for feature 40
(`specs/chapter_header_seal_api_refinements/{design,requirements}.md`): it passed
`title="Dashboard"` to `<app-chapter-header>`, collapsing the page's `<h1
class="page-title">Dashboard</h1>` into the chapter-header's own optional `title` input.

`requirements.md` R1 and `design.md`'s "Existing usages that must keep working" section
explicitly document that the 5 non-admin dependent features
(`dashboard_chapter_header`, `calendar_chapter_header`,
`absences_justifications_chapter_header`, `students_report_chapter_header`,
`citations_chapter_header`) each already have their own `<h1 class="page-title">`
elsewhere on the page and must keep it — the `title` input on `ChapterHeaderComponent`
exists for the admin screens only. This was an already-approved user decision (feature
40), not something to reinterpret.

## Scope of this session

Single-file, minimal fix in `src/app/features/dashboard/dashboard.component.ts` — this
was the only deviation; everything else in the `21776b0` commit (import, `imports:`
array, position inside `.page-header`'s sibling `<span>` for the date) was already
correct and untouched.

### Before (commit `21776b0`)

```html
<div class="page-header">
  <app-chapter-header
    icon="dashboard"
    eyebrowPrefix="Inspectoría"
    eyebrowSuffix="Resumen del período"
    title="Dashboard" />
  <span style="color:var(--muted);font-size:13px">{{today}}</span>
</div>
```

### After (this session)

```html
<app-chapter-header
  icon="dashboard"
  eyebrowPrefix="Inspectoría"
  eyebrowSuffix="Resumen del período" />
<div class="page-header">
  <h1 class="page-title">Dashboard</h1>
  <span style="color:var(--muted);font-size:13px">{{today}}</span>
</div>
```

### Layout reasoning

Putting `app-chapter-header` (no `title`), `<h1 class="page-title">`, and the date
`<span>` as three siblings *inside the same* `.page-header` flex row (as the task's
illustrative snippet showed literally) does not render correctly: `.page-header` is
`flex items-center justify-between flex-wrap gap-2` (`styles.css:340`), and with 3 flex
items `justify-content: space-between` spreads them evenly — the `<h1>` ends up floating
in the middle of the row instead of on the left, next to the date on the far right.

Instead, `<app-chapter-header>` (no `title`) is rendered as its own block **immediately
before** the original, unmodified `.page-header` div (`<h1>` + date `<span>`, exactly as
it was before `21776b0`). This:
- Matches `requirements.md`'s own phrasing that the `<h1>` lives "elsewhere on the page"
  relative to the chapter-header's eyebrow/filete, not nested inside the same 3-item row.
- Reuses the exact pre-existing `.page-header` structure/CSS (h1 left, date right) with
  zero changes to its internals — lowest risk.
- Confirmed visually correct (see smoke below): eyebrow + double filete sit on their own
  line above, `Dashboard` sits on the left of the row below it, the date sits on the
  right of that same row — matching the layout that existed before `21776b0`, with the
  chapter eyebrow/filete now inserted above it.
- Still satisfies the feature's own acceptance criteria (`state/features/035-*.md`):
  "El eyebrow y doble filete aparecen arriba de los filtros existentes" — the
  chapter-header sits above `.page-header`, which sits above `.filter-bar`.

Nothing else changed: imports, stat cards, charts, filters, `.stamp-f`/`.stamp-at`
badges all untouched (confirmed via `git diff`, single hunk).

## Verification

- `pnpm run build` — exit 0. No new errors. Pre-existing warnings unrelated to this
  change (NG8102/NG8107 in `student-management.component.ts`, `@import` ordering in
  `styles.css`, bundle/component CSS budget warnings on files not touched here).
- Visual smoke: `VISUAL_PATH=/dashboard VISUAL_FEATURE=dashboard_chapter_header_fix
  VISUAL_PORT=4322 node scripts/visual-smoke.mjs` (reused the existing shared script per
  `docs/conventions.md` — no new `.mjs` created) →
  `progress/visual_dashboard_chapter_header_fix.png` /`.json`. Screenshot confirms:
  - Eyebrow "INSPECTORÍA · RESUMEN DEL PERÍODO" with Material `dashboard` icon and the
    double filete (ink + border rules) render above everything else.
  - `<h1 class="page-title">Dashboard</h1>` renders on the left of its own row, the
    formatted date ("martes, 8 de septiembre de 2026") on the right of that same row —
    identical positioning to the pre-`21776b0` layout.
  - Filter bar (Período/Curso), period pills, stat cards, and charts render unchanged
    below (chart values show `NaN`/empty only because the smoke's generic API mock
    fallback returns `{}` for `/api/dashboard/summary`, unrelated to this fix — not a
    real regression).

## Files changed

- `/home/rileo/ai-personal-worktrees/feature-29-cuaderno-institucional/frontend/src/app/features/dashboard/dashboard.component.ts`

## Traceability (sdd=0 feature — no formal requirements/tasks files)

This feature is `sdd=0`; the reference for correctness is
`state/features/035-dashboard_chapter_header.md`'s acceptance criteria plus the
already-approved feature 40 spec's documented constraint on `title` usage (see
`specs/chapter_header_seal_api_refinements/requirements.md` R1 and `design.md`'s
"Existing usages that must keep working"), not a per-feature spec.
