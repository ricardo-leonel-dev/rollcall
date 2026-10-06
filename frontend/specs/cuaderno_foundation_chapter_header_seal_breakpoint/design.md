# Design — Cuaderno institucional: chapter header, seal avatar, tablet breakpoint

## Files touched

- `src/app/shared/components/chapter-header/chapter-header.component.ts` — **new file**
  (R1–R11).
- `src/app/shared/components/avatar-seal/avatar-seal.component.ts` — **new file**
  (R12–R18).
- `src/app/shared/layout/layout.component.ts` — swap the `.avatar` `<div>` for
  `<app-avatar-seal>` (R19, R20); add `isTabletOrSmaller` signal and rework `collapsed`
  from a plain `signal(false)` into an override+computed pair (R26–R30); `toggleMenu()`
  updated accordingly (R28).
- `src/app/features/admin/admin.component.ts` — export `ADMIN_TAB_CHAPTER_NUMERAL`
  (R21); widen the Cursos/Motivos `md:` classes to `lg:` (R22) and the Usuarios tab's
  custom media query from `768px` to `1024px` (R23).

No backend, `core/services/`, `core/models/`, `nginx.conf`, or other `features/`
change. `admin.component.ts`'s per-tab visual restyle (actually placing
`<app-chapter-header>`/`<app-avatar-seal>` inside each tab's markup) is **out of
scope** — that's `admin_users_cuaderno_seal` / `admin_years_cuaderno_timeline` /
`admin_institutions_cuaderno_seal` / `admin_remaining_tabs_chapter_header`'s job, once
unblocked by this feature. This feature only touches `admin.component.ts` for the two
pieces its own acceptance criteria own outright: the chapter-numeral map (a shared
constant those 4 features will import) and the breakpoint widening (a behavior change,
not a visual one).

## Eyebrow API — structured inputs, not a free-text string

`ChapterHeaderComponent` takes `eyebrowPrefix` (required), `eyebrowSeparator` (defaults
to `'·'`), `eyebrowSuffix` (optional), `eyebrowIcon` (optional), `title` (optional).
Callers compose the pieces:

```html
<!-- admin_users_cuaderno_seal (future) -->
<app-chapter-header
  [eyebrowPrefix]="'Capítulo ' + ADMIN_TAB_CHAPTER_NUMERAL['users']"
  eyebrowSeparator="—"
  eyebrowSuffix="Gestión de personal"
  title="Usuarios">
</app-chapter-header>

<!-- dashboard_chapter_header (future) -->
<app-chapter-header
  eyebrowPrefix="Inspectoría"
  eyebrowSuffix="Resumen del período">
</app-chapter-header>
```

The component itself never computes a roman numeral and never hard-codes `'—'` vs.
`'·'` — it only knows "prefix, optional separator + suffix, optional icon, optional
h1, always a double rule." This is why it can serve both known eyebrow shapes (see
`requirements.md`'s "Eyebrow format" section) without a mode flag or `format: 'chapter'
| 'category'` branch: the branch, if it existed, would just be re-deriving what the
caller already knows about itself.

`title` is optional because the 5 non-admin dependent features
(`dashboard_chapter_header`, `calendar_chapter_header`,
`absences_justifications_chapter_header`, `students_report_chapter_header`,
`citations_chapter_header`) explicitly describe adding *only* "el eyebrow ... + doble
filete ... arriba de los filtros" — their existing `<h1 class="page-title">` (e.g.
`"Dashboard"`, `"Calendario de Asistencia"`) is untouched and lives elsewhere in the
page; their acceptance criteria never mention it. The 4 admin-tab dependent features,
by contrast, need an actual `<h1>` inside each tab body (today's tabs have no heading
at all beyond the tab label) — they'll pass `title="Usuarios"` etc. Making `title`
required would force the non-admin features to either duplicate their page-title or
fight the component; making it always-optional keeps the component honest about doing
exactly one job (eyebrow + optional h1 + rule) regardless of who's asking.

### Discarded alternative: single free-text `eyebrowText: string` input

Let each caller pass the fully composed string (`"Capítulo I — Gestión de personal"`
or `"Inspectoría · Resumen del período"`) and have the component just print it
verbatim. **Rejected**: this technically "supports both shapes" too, but it pushes all
visual-grammar enforcement (which separator character, how much space around it,
whether "Capítulo" is capitalized, where the icon sits relative to the text) out to 9
independent call sites with no shared checkpoint — exactly the inconsistency risk this
foundation feature exists to prevent. The structured version still leaves 100% of the
*content* decisions (numeral, category name, subtitle wording) to each caller; it only
centralizes the *layout* decisions (icon slot, separator glyph slot, suffix slot),
which is the appropriate boundary for a shared presentational component per
`docs/conventions.md`'s Reusability section ("keep the component's own template/styles
ignorant of which page it's rendered on" — ignorant of *content*, not of *structure*).

## `ChapterHeaderComponent` skeleton

```ts
// src/app/shared/components/chapter-header/chapter-header.component.ts
import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chapter-header',
  imports: [MatIconModule],
  styles: [`
    .chapter-header { margin-bottom: 24px; }
    .chapter-eyebrow {
      font-family: 'Nunito', sans-serif;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--muted-strong);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .chapter-eyebrow mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .chapter-eyebrow-sep { opacity: .6; }
    .chapter-title {
      font-family: 'Nunito', sans-serif;
      color: var(--ink);
      @apply text-3xl font-semibold tracking-tight;
      margin: 0 0 10px 0;
    }
    .chapter-rule-ink { height: 1px; background: var(--ink); opacity: .55; }
    .chapter-rule-border { height: 1px; background: var(--border); margin-top: 3px; }
  `],
  template: `
    <div class="chapter-header">
      <div class="chapter-eyebrow">
        @if (eyebrowIcon) { <mat-icon>{{ eyebrowIcon }}</mat-icon> }
        {{ eyebrowPrefix }}
        @if (eyebrowSuffix) {
          <span class="chapter-eyebrow-sep">{{ eyebrowSeparator }}</span>
          {{ eyebrowSuffix }}
        }
      </div>
      @if (title) { <h1 class="chapter-title">{{ title }}</h1> }
      <div class="chapter-rule-ink"></div>
      <div class="chapter-rule-border"></div>
    </div>
  `,
})
export class ChapterHeaderComponent {
  @Input({ required: true }) eyebrowPrefix!: string;
  @Input() eyebrowIcon: string | null = null;
  @Input() eyebrowSuffix: string | null = null;
  @Input() eyebrowSeparator = '·';
  @Input() title: string | null = null;
}
```

Uses `@Input()` decorators (including `@Input({ required: true })` for
`eyebrowPrefix`) rather than the signal `input()`/`input.required()` function —
matching this codebase's **existing** convention (`TimelineComponent`,
`WhatsappIconComponent` in `shared/components/` both use plain `@Input()`; no
component in this codebase uses the signal-input API yet). `docs/architecture.md` §4's
signal rule governs *state*, not component inputs, and `docs/conventions.md`'s
"Extreme homogeneity" principle wins over adopting a newer Angular API for its own
sake in a brand-new file. `.chapter-title` intentionally reuses the exact Tailwind
utility classes
`styles.css`'s `.page-title` already uses (`text-3xl font-semibold tracking-tight`) —
same typographic scale, no new scale invented — rather than picking new numbers.

## `AvatarSealComponent` skeleton

```ts
// src/app/shared/components/avatar-seal/avatar-seal.component.ts
import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-avatar-seal',
  imports: [MatIconModule],
  styles: [`
    .seal {
      border-radius: 50%;
      border: 2px solid var(--paper);
      outline: 1.5px solid var(--border-soft);
      outline-offset: 2px;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Nunito', sans-serif;
      font-weight: 700;
      flex-shrink: 0;
      overflow: hidden;
    }
    .seal img { width: 100%; height: 100%; object-fit: cover; }
  `],
  template: `
    <div class="seal"
         [style.width.px]="size" [style.height.px]="size"
         [style.font-size.px]="fontSize()"
         [style.background]="imageUrl ? 'transparent' : (background ?? defaultGradient)">
      @if (imageUrl) {
        <img [src]="imageUrl" alt="">
      } @else if (icon) {
        <mat-icon [style.font-size.px]="iconSize()" [style.width.px]="iconSize()" [style.height.px]="iconSize()">{{ icon }}</mat-icon>
      } @else {
        {{ initials || '?' }}
      }
    </div>
  `,
})
export class AvatarSealComponent {
  @Input({ required: true }) size!: number;
  @Input() imageUrl: string | null = null;
  @Input() icon: string | null = null;
  @Input() initials = '';
  @Input() background: string | null = null;

  readonly defaultGradient = 'linear-gradient(135deg, var(--accent), var(--accent-2))';
  fontSize(): number { return Math.round(this.size * 0.4); }
  iconSize(): number { return Math.round(this.size * 0.5); }
}
```

Same `@Input()`-decorator convention as `ChapterHeaderComponent` above, for the same
homogeneity reason.

`fontSize`/`iconSize` scale with `size` so the component reads correctly at every
known consumer size (32px sidebar today, 36px admin `.user-avatar` in
`admin_users_cuaderno_seal`, 96px institution seal in
`admin_institutions_cuaderno_seal`) without each caller having to pick a matching
inner font size by hand.

### Discarded alternative: keep the seal look as global CSS classes in `styles.css`

Add `.avatar-seal` (+ modifiers) directly to `styles.css`, the same way `.avatar` /
`.user-avatar` are defined today inside their own components' `styles:` blocks (i.e.
not even centralized there either). **Rejected**: every consumer (`LayoutComponent`
today, `admin_users_cuaderno_seal` and `admin_institutions_cuaderno_seal` later) would
still have to hand-write the `<img>` / `mat-icon` / initials `@if` branching
themselves, which is exactly the "duplicated markup" this foundation feature exists to
eliminate — a shared *class* only centralizes the border/outline/gradient CSS, not the
three-way content branch. A real component (matching this codebase's own
`QuarterSelectorComponent` precedent, cited in `docs/conventions.md`'s Reusability
section) centralizes both.

## `LayoutComponent` changes (R19, R20, R26–R30)

### Avatar swap (R19, R20)

```html
<!-- before -->
<div class="avatar" [style.background]="isUploadedAvatar() ? 'transparent' : (avatarPreset()?.color ?? null)">
  @if (isUploadedAvatar()) {
    <img [src]="auth.currentUser()?.avatarUrl" style="width:100%;height:100%;border-radius:8px;object-fit:cover">
  } @else if (avatarPreset()) {
    <mat-icon style="font-size:18px;width:18px;height:18px">{{avatarPreset()!.icon}}</mat-icon>
  } @else {
    {{initials()}}
  }
</div>

<!-- after -->
<app-avatar-seal
  [size]="32"
  [imageUrl]="isUploadedAvatar() ? auth.currentUser()?.avatarUrl ?? null : null"
  [icon]="avatarPreset()?.icon ?? null"
  [background]="avatarPreset()?.color ?? null"
  [initials]="initials()">
</app-avatar-seal>
```

`AvatarSealComponent` is added to `LayoutComponent`'s `imports` array. The surrounding
`user-info` block (name/role text, hidden when collapsed) is untouched — R20 exists
specifically to make explicit that this swap is scoped to the avatar element only.

This is the one concrete usage of `AvatarSealComponent` this feature ships (proving
R12–R18 against a real, always-visible screen) since the other two known consumers
(admin Usuarios tab, admin Instituciones tab) are explicitly owned by
`admin_users_cuaderno_seal` and `admin_institutions_cuaderno_seal` — this feature must
not touch `admin.component.ts`'s avatar markup itself (see "Files touched" above).

### Tablet-collapsed sidebar (R26–R30)

```ts
// before
readonly collapsed = signal(false);

toggleMenu(): void {
  if (this.isMobile()) { this.mobileOpen.update(v => !v); }
  else { this.collapsed.update(v => !v); }
}

// after
readonly isTabletOrSmaller = toSignal(
  this.bp.observe('(max-width: 1024px)').pipe(map(r => r.matches)),
  { initialValue: false }
);
private readonly _collapsedOverride = signal<boolean | null>(null);
readonly collapsed = computed(() => this._collapsedOverride() ?? this.isTabletOrSmaller());

toggleMenu(): void {
  if (this.isMobile()) { this.mobileOpen.update(v => !v); }
  else { this._collapsedOverride.set(!this.collapsed()); }
}
```

`1024px` is reused verbatim as both the table-card breakpoint (R22–R25) and the
sidebar tablet-collapse threshold (R26) — one shared number instead of two
independently-tunable ones, so resizing the window doesn't make the sidebar and the
admin tables disagree about whether the viewport currently "is" tablet or desktop.

Once `_collapsedOverride` is set (by any manual `toggleMenu()` call outside mobile), it
permanently wins over the breakpoint-derived default until the page reloads — resizing
across `1024px` afterward no longer changes `collapsed()`. This matches "sin romper el
toggle manual existente" literally: today's toggle has no breakpoint awareness at all,
so a user's manual choice is never silently reverted by a resize event either before or
after this feature.

### Discarded alternative: reset the manual override on every breakpoint crossing

Instead of a persistent override, re-derive `collapsed` purely from
`isTabletOrSmaller()` and drop `toggleMenu()`'s effect as soon as the viewport crosses
`1024px` again. **Rejected**: this would fight a user who deliberately expanded the
sidebar while in the tablet range — the next resize event (even one pixel) would
silently re-collapse it, which is a worse regression than the `false`-always default
this feature replaces. The acceptance criterion "sin romper el toggle manual" is best
read as "toggle keeps working, indefinitely," not "toggle works until the next
resize."

### Discarded alternative: custom `900px` Tailwind breakpoint instead of the built-in `lg` (`1024px`)

The feature's own description says "~900-1024px", loosely. Introducing a custom
`tailwind.config.js` `screens: { tablet: '900px' }` entry was considered.
**Rejected**: it adds a config change and a second breakpoint concept for zero
behavioral benefit over reusing Tailwind's existing `lg` (`1024px`), which this project
doesn't use anywhere yet (verified: no `lg:` utility class exists in `src/app` today)
and which is already the exact upper bound the description gives. Picking the built-in
value keeps the table breakpoint (R22, R23), the sidebar breakpoint (R26), and any
future Tailwind utility class in this range all expressible with the same `lg:`
prefix / `1024px` media query, with nothing new to configure.

## `admin.component.ts` changes (R21–R23)

`ADMIN_TAB_CHAPTER_NUMERAL` is a module-level exported `const`, colocated in
`admin.component.ts` (not `core/` or `shared/`) because its keys are
`admin.component.ts`'s own `activeTab()` tab-key strings and its only 4 consumers all
edit this same file:

```ts
export const ADMIN_TAB_CHAPTER_NUMERAL: Record<string, string> = {
  users: 'I',
  courses: 'II',
  years: 'III',
  permissions: 'IV',
  'citation-reasons': 'V',
  roster: 'VI',
  institutions: 'VII',
};
```

The Cursos/Motivos de citación tabs' two `hidden md:block` / `md:hidden` pairs (today
at admin.component.ts's `data-table-wrap`/mobile-list divs) become `hidden lg:block` /
`lg:hidden`. The Usuarios tab's own `.hidden-mobile`/`.hidden-desktop` custom classes
keep their current definitions; only the `@media (max-width: 768px)` query wrapping
them changes to `@media (max-width: 1024px)`.

## Verification

No automated test suite exists in this project (`docs/verification.md` "Current
state"). Verification is `pnpm run build` (R33) plus a manual smoke at three viewport
widths (`tasks.md`'s final task) — Level 1 + Level 3/4 per `docs/verification.md`.
Both new components' `template:`/`styles:` blocks are in scope for the
`frontend-design` skill per `docs/architecture.md`'s Design Workflow — load it before
writing either component's markup, even though this feature's own visual footprint
(sidebar avatar only) is small; the two components' look is what all 9 dependent
features will inherit unmodified.
