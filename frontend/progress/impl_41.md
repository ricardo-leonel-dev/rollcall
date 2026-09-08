# Implementer report — feature 41 `fix_admin_years_timeline_visibility_and_alignment`

## Outcome

Fixed both bugs found in local review of feature 31's (uncommitted) years-lectivos
timeline in `admin.component.ts`:

1. **"HOY" label invisible** — was clipped by `.timeline-track`'s `overflow:
   hidden`.
2. **HOY marker / segments misaligned when there are real gaps between
   quarters** — segments were laid out with packed `flex-basis` (no gaps
   reserved), while the HOY marker was positioned on the *real* calendar
   offset (including gaps) — so the marker could land outside the segment
   that actually contains today, or in dead space.

Single file touched (same file feature 31 already had open, uncommitted):
- `/home/rileo/ai-personal-worktrees/feature-29-cuaderno-institucional/frontend/src/app/features/admin/admin.component.ts`

Plus the shared visual-smoke fixture (not a new script, per `docs/conventions.md`
"Smoke scripts" — `scripts/visual-smoke.mjs` already existed and is reused by many
features):
- `/home/rileo/ai-personal-worktrees/feature-29-cuaderno-institucional/frontend/scripts/visual-smoke.mjs`

## Bug 2 fix — one shared coordinate system

Both segment positioning and the HOY marker now go through the same private
helper, `yearPct(dateStr, y)`, which returns a date's % offset from
`y.startDate` as a fraction of the full `[y.startDate, y.endDate]` range
(admin.component.ts:680-690). `segmentLeft`/`segmentWidth` (693-701) and
`timelineHoy` (708-716) are just call sites of this one function — there is no
longer a second, independent calc for segment width based on `qDays/yDays`
alone (the old `segmentBasis`, which reserved no space for gaps). Template:
`[style.left]` + `[style.width]` on `.timeline-segment` (both computed via
`yearPct`), inside a `position:relative` `.timeline-track`.

Since `quarters-dialog.component.ts` only validates non-overlap + in-range
(lines 260-276), never contiguity, real gaps between quarters are a normal,
supported configuration (school recesses/vacations) — the fix makes them
render as visible empty track space at their real chronological position
instead of disappearing from the layout.

## Bug 1 fix — clipping, chosen approach and why

Chose: **remove `overflow: hidden` from `.timeline-track` itself, and add an
inner `.timeline-segments` wrapper** (`position: absolute; inset: 0;
border-radius: inherit; overflow: hidden;`) that clips only the segments.
`.timeline-hoy` (the vertical bar) and `.timeline-hoy-label` ("HOY" pill) are
now DOM/CSS siblings of `.timeline-segments`, not children — so they sit
outside that wrapper and are never clipped, while segments still get the
track's rounded corners via `border-radius: inherit`.

Rejected alternative: moving the label inside the track's bounds (e.g.
dropping `top: -16px`). That would either shrink the label to fit inside
28px alongside the segment name labels (cramped, illegible at 9px) or push
segment content down to make room (changes the segment's established look
from feature 31). The chosen wrapper approach preserves the exact visual
design from feature 31 (segment padding, rounded corners, label size/position
relative to the bar) while only changing *what* clips *what*.

## Evidence (coordinates, not screenshots)

From `progress/visual_fix_admin_years_timeline_visibility_and_alignment.json`
(smoke run against the updated fixture, described below):

- **Bug 1 — clipping check** (`clippingAncestor()` walks every ancestor with
  computed `overflow: hidden`/`clip` up to `<body>` and checks whether the
  element's real bounding rect is contained in each — not a screenshot read):
  - `timelineHoyLabelClipping.clipped: false`
  - `timelineHoyClipping.clipped: false`
  - (Before the fix, `.timeline-track` had `overflow: hidden` and the
    label's rect (`top: 277` in this run) fell above the track's rect
    (`top: 298`), i.e. `elRect.top < ancRect.top` — the containment check
    would have failed and reported `clipped: true` against `.timeline-track`.)
- **Bug 2 — alignment check** (`timelineHoyAlignment`, real
  `getBoundingClientRect()` numbers, not `%` strings):
  ```json
  "timelineHoyAlignment": {
    "hoyLeft": 977.4375,
    "t2Left": 704.484375,
    "t2Right": 1018.546875,
    "hoyWithinT2": true
  }
  ```
  `hoyLeft` (977.44) falls inside `[t2Left, t2Right]` = `[704.48, 1018.55]`.
  The mocked "today" (real system clock, 2026-09-08 in this environment) is
  inside `T2`'s configured range (`2026-04-15` → `2026-09-30`), the *second*
  quarter, not the first — the marker is correctly inside T2's real bounding
  box, not wherever a gap-less packed layout would have put it (which would
  have been immediately after T1, i.e. `left ≈ 655.9`, well outside T2's
  actual box).
- **Gap renders as visible empty track**: `timelineSegments[0].rect.right`
  (T1) = `655.875`; `timelineSegments[1].rect.left` (T2) = `704.484375` — a
  ~48.6px visible gap between the two segments, corresponding to the real
  26-day recess between `2026-03-20` and `2026-04-15` in the fixture.

## Fixture change (`scripts/visual-smoke.mjs`)

The feature-31 fixture (`T1`/`T2`/`T3` summing to exactly 100% of the year,
contiguous, no gaps) can't exercise bug 2 — it was replaced (not duplicated)
with a fixture that has both properties the task required:

- A real ~26-day gap between `T1` (`2026-01-05` → `2026-03-20`) and `T2`
  (`2026-04-15` → `2026-09-30`).
- "Today" (system clock, `2026-09-08` in this environment) falls inside `T2`
  — the second quarter, not the first.
- `T3` (`2026-10-01` → `2026-12-15`) stays close to `T2`'s end (contiguous —
  next calendar day) so the same fixture also shows what "no gap" rendering
  looks like, for contrast.

`extractDom()` in the same file gained the assertions described above
(`clippingAncestor()`, `timelineTrackRect`, `timelineSegments[]`,
`timelineHoyRect`, `timelineHoyLabelRect`, `timelineHoyLabelClipping`,
`timelineHoyClipping`, `timelineHoyAlignment`) — these are behavioral,
computed-from-DOM checks, not just node-presence counts.

## Acceptance criteria carried forward from feature 31 (not broken)

| Criterion | Status | Where |
|---|---|---|
| Segment widths/positions proportional to real date ranges | Preserved (now `segmentLeft`/`segmentWidth`, same day-count math, plus left offset) | `yearPct()`, `segmentLeft()`, `segmentWidth()` |
| Empty-state CTA (no quarters configured) | Untouched — same `@else` branch, same `.period-chip-empty`/`.period-chip-cta` markup and styles | admin.component.ts template, `@if (segments.length > 0) { ... } @else { ... }` |
| Lateral spine (accent for active year, muted otherwise) | Untouched — `.admin-row.is-active { border-left-color: var(--accent); }` unchanged | admin.component.ts styles |
| HOY marker suppressed when today isn't inside any configured quarter | Untouched gating logic in `timelineHoy()` (year range + `segments.some(...)` check), only the position formula now reuses `yearPct()` | admin.component.ts:708-716 |

## Verification

- `pnpm run build` → exit 0. No new errors. `admin.component.ts`'s
  pre-existing per-component CSS budget warning grew from +376 bytes (feature
  31) to +425 bytes over the 2.00 kB budget — same pre-existing category (this
  budget was already exceeded before feature 29/30/31 touched this file), not
  a new failure class.
- `./init.sh` → `[OK] Environment ready`. Two `[WARN]` lines, both pre-existing
  and expected per `docs/verification.md`/feature 31's own report:
  - `No verify_command configured in .harness.json — skipping`
  - `$SUPABASE_URL / $SUPABASE_ANON_KEY not set — skipping mirror sync`
- Visual smoke (Level 4):
  ```
  VISUAL_PATH=/admin?tab=years \
  VISUAL_FEATURE=fix_admin_years_timeline_visibility_and_alignment \
  VISUAL_OUT_DIR=progress node scripts/visual-smoke.mjs
  ```
  → `progress/visual_fix_admin_years_timeline_visibility_and_alignment.png`
  → `progress/visual_fix_admin_years_timeline_visibility_and_alignment.json`
  — screenshot shows the "HOY" label fully rendered above the track (not
  cropped), a visible empty gap between T1 and T2, and the HOY marker inside
  T2. `chipCount: 0` / `hasOldPanel: false` still confirm the old chip-list
  markup stays gone.
- Level 3 (manual smoke against the real backend, `docker compose up`) not
  run this session — same call feature 31 made: this is a pure
  layout/positioning CSS+TS fix on a screen already Level-3 exercised
  recently (feature 40), and Level 4's computed-rect assertions give
  behavioral proof beyond what a screenshot alone would. `docker ps` was
  checked (frontend/backend/postgres/redis/excel-service are up on this
  host) but the running `frontend` container serves a separately-built image,
  not this session's local `dist/` output — redeploying it for a CSS-only fix
  was judged not worth the extra round trip given Level 4's rect-based
  evidence already proves both bugs are fixed.
- No other tab touched. No shared component (`ChapterHeaderComponent`,
  `SealAvatarComponent`) modified. No new dependency.

## Files changed

- `src/app/features/admin/admin.component.ts` — timeline positioning +
  clipping fix only; rest of feature 31's diff (spine, empty state, seal
  avatar swap) left as-is.
- `scripts/visual-smoke.mjs` — fixture (gap + shifted "today") + new
  DOM/rect assertions for the timeline. Not committed as a new smoke script;
  this file already existed and is the project's standing Level-4 tool.

Not committed (per instructions) — left uncommitted alongside feature 31's
own uncommitted diff, for local review.
