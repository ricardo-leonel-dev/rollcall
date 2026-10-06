# Implementer report — feature 31 `admin_years_cuaderno_timeline`

## Outcome

Built the proportional Cuaderno-style timeline for `admin.component.ts`'s Años
lectivos tab: replaced the vertical `.quarter-chip-list` with a single
horizontal `.timeline-track` whose segments are sized by each quarter's real
share of the academic-year range, added a vertical `HOY` marker positioned on
today's local date when today lands inside both the year and at least one
configured quarter, and added a 4px left spine to `.admin-row` (accent for the
active year, muted for the rest). Empty-state CTA preserved verbatim.

Single file touched:
- `/home/rileo/ai-personal-worktrees/feature-29-cuaderno-institucional/frontend/src/app/features/admin/admin.component.ts`

## Acceptance criteria mapping

| Acceptance | Where it lives | Evidence |
|---|---|---|
| Segment widths proportional to real `q.endDate - q.startDate` share of `y.endDate - y.startDate` (clamped `[0, 100]`) | `segmentBasis(q, y)` in admin.component.ts; `[style.flex-basis]` on `.timeline-segment` | `progress/visual_admin_years_timeline.png` shows T1 (~31%) / T2 (~32%) / T3 (~37%) widths matching the mock-year fixtures |
| `HOY` marker rendered at the correct position when today is inside the active year AND a configured quarter covers today; suppressed otherwise | `timelineHoy(y, segments)` + `@if (timelineHoy(...); as pct)` | In the smoke (today mocked at 2026-09-08) the marker sits near the T2/T3 boundary inside Q3; gate combines `today ∈ [y.startDate, y.endDate]` with `segments.some(q.startDate ≤ today ≤ q.endDate)` |
| Empty-state (zero configured quarters) preserved exactly | `@if (segments.length > 0) { ... } @else { <span class="period-chip-empty">Sin períodos configurados. <a class="period-chip-cta" (click)="openQuartersDialog(y)">Configurar trimestres</a></span> }` — copy identical to the prior chip-list `@empty` branch | Empty branch code path kept the original `period-chip-empty` / `period-chip-cta` styles untouched in the styles block |
| Lateral spine distinguishes active (accent) from inactive (muted), without changing activate/deactivate behavior | `.admin-row` `border-left: 4px solid var(--muted)` + `.admin-row.is-active { border-left-color: var(--accent); }`; `<div class="admin-row" [class.is-active]="y.isActive">` | Spine visible in the screenshot (accent bar on left of the active row). `activateYear`/`openYearDialog`/`deleteYear`/`openQuartersDialog` code untouched. |

## Scope and exact code shape

### Before

```ts
@for (y of years(); track y.id) {
  <div class="admin-row">
    <div ...>
      <div style="...40x40 inline box...">
        <mat-icon style="color:var(--accent)">calendar_today</mat-icon>
      </div>
      <div>
        <div>{{y.name}}</div>
        <div>{{y.startDate ?? '—'}} → {{y.endDate ?? '—'}}</div>
      </div>
    </div>
    @if (y.isActive) {
      <div class="admin-row-quarters">
        <div class="quarter-chip-list">
          @for (q of rows; track q.id) {
            <span class="period-chip" ...>
              <span class="period-chip-name">{{q.name}}</span>
              <span class="period-chip-range">...</span>
            </span>
          } @empty {
            <span class="period-chip-empty">Sin períodos configurados.
              <a class="period-chip-cta" (click)="openQuartersDialog(y)">Configurar trimestres</a>
            </span>
          }
        </div>
      </div>
    }
    <div class="admin-row-actions">...badge + buttons...</div>
  </div>
}
```

### After

```ts
@for (y of years(); track y.id) {
  <div class="admin-row" [class.is-active]="y.isActive">
    <div ...>
      <app-seal-avatar [size]="36" icon="calendar_today" />
      <div>
        <div>{{y.name}}</div>
        <div>{{y.startDate ?? '—'}} → {{y.endDate ?? '—'}}</div>
      </div>
    </div>
    @if (y.isActive) {
      @let segments = timelineSegmentsFor(y);
      @if (segments.length > 0) {
        <div class="admin-row-quarters">
          <div class="timeline-track">
            @for (q of segments; track q.id) {
              <div class="timeline-segment"
                   [style.flex-basis]="segmentBasis(q, y)"
                   title="{{q.name}} · {{q.startDate ?? '—'}} → {{q.endDate ?? '—'}}">
                <span class="timeline-segment-name">{{q.name}}</span>
              </div>
            }
            @if (timelineHoy(y, segments); as pct) {
              <div class="timeline-hoy" [style.left]="pct">
                <span class="timeline-hoy-label">HOY</span>
              </div>
            }
          </div>
        </div>
      } @else {
        <div class="admin-row-quarters">
          <span class="period-chip-empty">
            Sin períodos configurados.
            <a class="period-chip-cta" (click)="openQuartersDialog(y)">Configurar trimestres</a>
          </span>
        </div>
      }
    }
    <div class="admin-row-actions">...badge + buttons (unchanged)...</div>
  </div>
}
```

### Styles changes (inline `styles:` block)

- `.admin-row`: kept `border-top/right/bottom: 1px solid var(--border)` and split out `border-left: 4px solid var(--muted)` so the spine is a distinct, thicker bar without touching the existing 1px envelope on the other three sides. Padding remains the same (`12px 16px`).
- `.admin-row.is-active { border-left-color: var(--accent); }` toggles the accent for the active year.
- Removed `.quarter-chip-list` and `.period-chip*` styles (`.period-chip-name`/`.period-chip-range` came out together with the chip list). `.period-chip-empty` and `.period-chip-cta` styles kept for the empty CTA.
- Added `.timeline-track`, `.timeline-segment`, `.timeline-segment-name`, `.timeline-hoy`, `.timeline-hoy-label` with `--paper`, `--paper-deep`, `--accent-soft`, `--ink`, `--border-soft`, `--border` from `src/styles.css`. No new colors, no new fonts.

### Component additions (helper methods)

```ts
todayStr(): string { return dateToDateString(new Date()); }

daysBetween(start: string, end: string): number | null {
  const a = dateStringToDate(start);
  const b = dateStringToDate(end);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

timelineSegmentsFor(y: AcademicYear): readonly Quarter[] {
  if (!y.startDate || !y.endDate) return [];
  return this.quarterRowsFor(y.id).filter(q => !!q.startDate && !!q.endDate);
}

segmentBasis(q: Quarter, y: AcademicYear): string {
  // yDays and qDays gated; pct clamped to [0,100]; returns '0%' on any
  // missing-input edge case so the template binding is always a string.
}

timelineHoy(y: AcademicYear, segments: readonly Quarter[]): string | null {
  // 1. y has dates; 2. yDays > 0; 3. today in [y.startDate, y.endDate];
  // 4. at least one segment's date range covers today; 5. clamp + format.
}
```

All helpers live in the same file (no new shared utility), use the existing
`shared/utils/date.util` `dateStringToDate` / `dateToDateString` (local-time
parsing already documented in feature 15), and keep `quarterRowsFor` /
`setQuartersForYear` / the `_quartersByYear` signal untouched.

## Deviations from the task brief

None on the four acceptance criteria. Two judgment calls worth noting:

- **Avatar swapped**: replaced the bespoke 40x40 inline `<div><mat-icon>calendar_today</mat-icon></div>` box in the row header with `<app-seal-avatar [size]="36" icon="calendar_today" />` (matches feature 30's row-header pattern for users / feature 33 for institutions). The brief explicitly listed this as the "your call" option.
- **HOY gate**: the brief required the marker to be suppressed "if no cae dentro de ningún trimestre configurado" — the implementation gates on both the academic-year range AND at least one configured segment covering today. When `y` has no dates at all, `timelineSegmentsFor(y)` returns `[]`, the `@else` branch in the template shows the empty CTA, and `timelineHoy(...)` is never queried (the marker can't exist on a year that has no timeline track).

## Verification

- `pnpm run build` → exit 0. The only Angular CSS-budget warnings on
  `admin.component.ts` are pre-existing per-line thresholds (>2.00 kB by
  376 bytes — same magnitude as before this change); no new compile errors, no
  new warnings unrelated to existing budget tuning.
- `./init.sh` would re-run the same build; the `[WARN]` about
  `verify_command` being unset is the long-standing, expected warning (no test
  framework installed yet), per `docs/verification.md`.
- Visual smoke (Level 4):
  `VISUAL_PATH=/admin?tab=years VISUAL_FEATURE=admin_years_timeline
   VISUAL_OUT_DIR=progress node scripts/visual-smoke.mjs`
  → `progress/visual_admin_years_timeline.png`
  → `progress/visual_admin_years_timeline.json`
  - Sees: chapter-header eyebrow "CAPÍTULO III — CALENDARIO ACADÉMICO" +
    doble filete; h1 "Años lectivos"; row with `<app-seal-avatar>` (calendar_today
    icon, double ring) on the left; `Año Lectivo 2026` name + dates; proportional
    timeline with T1/T2/T3 segments; `HOY` vertical marker + label inside Q3
    near its start (today mocked at 2026-09-08, T3 begins 2026-09-01); accent
    spine on the left of the active-year row; `Activo` badge + actions on the
    right.
  - `chipCount: 0` and `hasOldPanel: false` confirm the old `.quarter-chip-list`
    / `.inline-quarters-summary` markup is gone.
  - Dev stack (frontend on :80, backend on :3000, postgres, redis,
    excel-service) is up on this host per `docker ps` — the smoke runs against
    the static prod build with the existing `mockApi` fixture (mock-only), per
    `docs/verification.md` Level 4 rules (Level 3 manual smoke against the real
    backend was not run in this session — the same screen was last Level-3
    exercised for feature 40's API refinements).
- No new dependency, no other tab touched, `ChapterHeaderComponent` and
  `SealAvatarComponent` not modified.

## Files changed

- `src/app/features/admin/admin.component.ts` (timeline + spine + helpers;
  no other tab touched, no shared component modified)
