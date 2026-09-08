# Design — Chapter header / seal avatar API refinements

## Files touched

- `src/app/shared/components/chapter-header/chapter-header.component.ts` — modified
  (R1–R10).
- `src/app/features/admin/admin.component.ts` — modified (R14–R20).
- `src/app/shared/components/seal-avatar/seal-avatar.component.ts` — **not touched**
  (see "Discarded alternative: rename `SealAvatarComponent`" below).
- `src/app/shared/layout/layout.component.ts` — modified (R22–R29): the sidebar
  `user-card` avatar is migrated from a hand-rolled `.avatar` `<div>` to
  `<app-seal-avatar>`. R13's guardrail (no change to the tablet auto-collapse `effect()`
  / `isTablet` signal, `isMobile` signal, or `toggleMenu()`) still applies — this feature
  touches this file only for the avatar swap, nothing else in it.

No backend, `core/services/`, `core/models/`, or other `features/` change.

## Existing usages that must keep working (verified before designing, not assumed)

1. **Admin institution/user seal avatars** (`admin.component.ts` lines using
   `<app-seal-avatar>`) — untouched; `SealAvatarComponent`'s contract doesn't change
   (R12).
2. **Admin table/card tablet breakpoint** (`hidden-mobile`/`hidden-desktop` classes,
   `@media (max-width: 1024px)` in `admin.component.ts`'s `styles:`) — untouched, no
   requirement here touches it.
3. **Sidebar tablet auto-collapse** (`LayoutComponent`'s `effect()` + `isTablet` signal)
   — untouched (R13).
4. **Sidebar user-card avatar** — verified via `grep -rn "SealAvatar" src/app` that
   `LayoutComponent` does **not** use `SealAvatarComponent`; it still renders its own
   hand-rolled `.avatar` `<div>` (gradient background + `<img>`/`mat-icon`/initials
   branch inline in the template). This was expected to be migrated per the original
   (superseded) spec but never was. **Now in scope** (R22–R29) — Ricardo confirmed this
   migration belongs in this feature rather than a follow-up one. See "`LayoutComponent`
   sidebar avatar migration" below for the before/after and the two visual-change
   decisions (shape, gradient) this migration deliberately makes, not just preserves.

## `ChapterHeaderComponent` changes (R1–R10)

```ts
// before
@Input() icon!: string;
@Input() roman!: string;
@Input() subtitle!: string;
@Input() title!: string;
```
```html
<div class="chapter-eyebrow">
  <mat-icon>{{ icon }}</mat-icon>
  <span class="chapter-roman">{{ roman }}</span>
  <span class="chapter-sep">·</span>
  <span class="chapter-sub">{{ subtitle }}</span>
</div>
<h1 class="chapter-title">{{ title }}</h1>
```

```ts
// after
/** Material icon name shown at the start of the eyebrow row. Omit for no icon. */
@Input() icon: string | null = null;
/** Leading eyebrow text — a Roman numeral ("Capítulo I") or a plain category word
 *  ("Inspectoría"); the component has no opinion on which. */
@Input({ required: true }) eyebrowPrefix!: string;
/** Text rendered after `eyebrowPrefix` + `eyebrowSeparator`. */
@Input({ required: true }) eyebrowSuffix!: string;
/** Character(s) between `eyebrowPrefix` and `eyebrowSuffix`. */
@Input() eyebrowSeparator = '·';
/** Optional page/tab h1. Omit when the host page already has its own `.page-title`. */
@Input() title: string | null = null;
```
```html
<div class="chapter-eyebrow">
  @if (icon) { <mat-icon>{{ icon }}</mat-icon> }
  <span class="chapter-roman">{{ eyebrowPrefix }}</span>
  <span class="chapter-sep">{{ eyebrowSeparator }}</span>
  <span class="chapter-sub">{{ eyebrowSuffix }}</span>
</div>
@if (title) { <h1 class="chapter-title">{{ title }}</h1> }
```

Internal CSS class names (`chapter-roman`, `chapter-sep`, `chapter-sub`,
`chapter-title`) are **not** renamed — they're private to the component's own
`styles:` block, not part of its public `@Input()` contract, so renaming them would be
pure churn with no consumer-visible benefit.

`@Input({ required: true })` (rather than a non-null assertion with no default) is used
for `eyebrowPrefix`/`eyebrowSuffix` so a missing binding is a **compile-time** template
error (Angular's `strictTemplates`, already enabled per `docs/conventions.md`) instead of
silently rendering `undefined` — this directly prevents a future dependent feature from
reintroducing defect #1's failure mode (a required-but-defaultless input silently
rendering something broken) for these two fields.

### Discarded alternative: keep `roman`/`subtitle` names, only add docs clarifying dual use

Leave the `@Input()` names as `roman`/`subtitle` and just broaden the JSDoc comment to
say "not necessarily a Roman numeral." **Rejected**: 5 of the 8 dependent features
(`dashboard_chapter_header`, `calendar_chapter_header`,
`absences_justifications_chapter_header`, `students_report_chapter_header`,
`citations_chapter_header`) never pass a Roman numeral at all (`"Inspectoría"`,
`"Calendario"`, `"Estudiantes"`, ...) — a field literally named `roman` holding
`"Inspectoría"` is exactly the kind of name/content mismatch `docs/conventions.md`'s
"Extreme homogeneity" principle warns against, and the rename costs nothing: `grep -rn
"ChapterHeaderComponent" src/app` (excluding the component's own file) confirms exactly
one call site (`admin.component.ts`), which this feature is already rewriting for R17.

### Discarded alternative: rename `SealAvatarComponent` to `AvatarSealComponent`

The original (superseded) spec for feature 29 called this component
`AvatarSealComponent` at `shared/components/avatar-seal/`; the shipped code named it
`SealAvatarComponent` at `shared/components/seal-avatar/` instead. Renaming it now to
match the old spec was considered, purely for consistency with that document.
**Rejected**: the old spec was never implemented as written and carries no authority over
the shipped code (per this feature's own task description); the rename is cosmetic,
breaks the four already-shipped, working call sites in `admin.component.ts` for zero
functional benefit, and none of the 8 dependent features' descriptions reference either
name — they just call `<app-seal-avatar>`. Renaming would be scope creep against a
component that, per the "Existing usages" investigation above, has no actual defect.

## `admin.component.ts` changes (R14–R20)

```ts
// new exports, module level
export const ADMIN_TAB_CHAPTER_NUMERAL: Record<string, string> = {
  users: 'I',
  courses: 'II',
  years: 'III',
  permissions: 'IV',
  'citation-reasons': 'V',
  roster: 'VI',
  institutions: 'VII',
};

export const ADMIN_TAB_EYEBROW_SUFFIX: Record<string, string> = {
  users: 'Gestión de personal',
  courses: 'Cursos',
  years: 'Calendario académico',
  permissions: 'Permisos',
  'citation-reasons': 'Motivos de citación',
  roster: 'Importar nómina',
  institutions: 'Instituciones del sistema',
};

export const ADMIN_TAB_TITLE: Record<string, string> = {
  users: 'Usuarios',
  courses: 'Cursos',
  years: 'Años lectivos',
  permissions: 'Permisos',
  'citation-reasons': 'Motivos de citación',
  roster: 'Importar nómina',
  institutions: 'Instituciones',
};
```

`ADMIN_TAB_EYEBROW_SUFFIX`'s `users`/`years`/`institutions` values are copied verbatim
from `admin_users_cuaderno_seal`/`admin_years_cuaderno_timeline`/
`admin_institutions_cuaderno_seal`'s own descriptions (`state/features/030-*.md`,
`031-*.md`, `033-*.md`) — those 3 already specify the exact literal text. The remaining
4 values (`courses`, `permissions`, `citation-reasons`, `roster`) have no literal text
specified anywhere yet (`admin_remaining_tabs_chapter_header`'s description only says
"the chapter eyebrow for II/IV/V/VI", not the wording) — these 4 are **interim
placeholders reusing this same file's own existing `<!-- SECTION -->` template comments
and tab labels** (`<!-- CURSOS -->`, `<!-- PERMISOS -->`, `<!-- MOTIVOS DE CITACIÓN -->`,
`<!-- IMPORTAR NÓMINA -->`), not invented marketing copy — `admin_remaining_tabs_
chapter_header` can freely override them later; this feature only needs *something*
correct-shaped in place so the header isn't blank/wrong for those 4 tabs today (see
"Visual regression check" below). **Flagged for explicit review** — see final report.

Component class changes (imports `computed`, not currently imported):

```ts
// before
import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';

// after
import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from '@angular/core';
```

```ts
readonly chapterEyebrowPrefix = computed(() => `Capítulo ${ADMIN_TAB_CHAPTER_NUMERAL[this.activeTab()] ?? ''}`);
readonly chapterEyebrowSuffix = computed(() => ADMIN_TAB_EYEBROW_SUFFIX[this.activeTab()] ?? '');
readonly chapterTitle = computed(() => ADMIN_TAB_TITLE[this.activeTab()] ?? '');
```

Template change:

```html
<!-- before -->
<div class="page-header">
  <app-chapter-header
    icon="admin_panel_settings"
    roman="I"
    subtitle="Institucional"
    title="Administración" />
  @if (auth.isSuperAdmin()) { ... queue monitor button ... }
</div>

<!-- after -->
<div class="page-header">
  <app-chapter-header
    icon="admin_panel_settings"
    [eyebrowPrefix]="chapterEyebrowPrefix()"
    eyebrowSeparator="—"
    [eyebrowSuffix]="chapterEyebrowSuffix()"
    [title]="chapterTitle()" />
  @if (auth.isSuperAdmin()) { ... queue monitor button (unchanged) ... }
</div>
```

The `<app-chapter-header>` element's **position** doesn't change (still one element,
still inside `.page-header`, still above the shared tab-content card, still beside the
queue-monitor button) — only its **content** becomes reactive to `activeTab()` (R18).

### Discarded alternative: one `<app-chapter-header>` duplicated inside each `@if (activeTab() === '<tab>')` block

Move the header inside each of the 7 tab-content `@if` branches (7 separate
`<app-chapter-header>` elements, one per tab), instead of one reactive instance outside
them. **Rejected**: the header's position in the layout is identical for every tab (top
of `.page-header`, sharing space with the superadmin-only queue-monitor button) — only
its text content varies by tab. Duplicating the element 7× would mean 7 places to keep
in sync with the queue-monitor button's placement/condition and 7 places `admin_users_
cuaderno_seal`/`admin_years_cuaderno_timeline`/etc. would each have to independently
edit later instead of one shared computed lookup; it also doesn't match how the *rest*
of `admin.component.ts` already isolates cross-tab-invariant chrome (the queue-monitor
button, the outer rounded card) outside the per-tab `@if` blocks and only puts genuinely
tab-specific markup inside them.

### Discarded alternative: inline per-tab ternary/switch in the template instead of an exported constant

Compute the Roman numeral inline in the template (e.g. a template expression or a
private, non-exported method) rather than an exported `ADMIN_TAB_CHAPTER_NUMERAL`
constant. **Rejected**: `admin_users_cuaderno_seal`, `admin_years_cuaderno_timeline`,
`admin_institutions_cuaderno_seal`, and `admin_remaining_tabs_chapter_header` each need
this exact mapping themselves once they add their own per-tab content (folio counts,
seal avatars, timeline spine color) inside their own tab bodies — an exported, named
constant is the only shape that lets 4 independent future features import the same
numeral assignment instead of four independently hand-typed (and driftable) copies.

## `LayoutComponent` sidebar avatar migration (R22–R29)

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
<app-seal-avatar
  [size]="32"
  [src]="isUploadedAvatar() ? (auth.currentUser()?.avatarUrl ?? null) : null"
  [icon]="avatarPreset()?.icon ?? null"
  [initials]="initials()"
  [bgColor]="avatarPreset()?.color ?? null"
  surface="dark" />
```

```ts
// LayoutComponent imports — add SealAvatarComponent
import { SealAvatarComponent } from '../components/seal-avatar/seal-avatar.component';
// ...
imports: [RouterOutlet, RouterLink, FormsModule, MatIconModule, MatButtonModule,
          MatTooltipModule, MatSelectModule, SealAvatarComponent],
```

The `.avatar` CSS rule (32px, 8px radius, hardcoded indigo/purple gradient, 13px/700
font) is removed from `LayoutComponent`'s `styles:` block — nothing else references the
`.avatar` class after the swap. `SealAvatarComponent`'s own `[style.--seal-size]` /
internal font/icon scaling (already shipped, unchanged per R12) take over sizing.
`isUploadedAvatar()`, `avatarPreset()`, and `initials()` — all pre-existing computed
helpers in `LayoutComponent` — are reused as-is; none of their own logic changes.

Two properties of the old `.avatar` div are **deliberately not preserved** — flagged
explicitly since they're not obvious from `SealAvatarComponent`'s API alone:

- **Shape**: `.avatar` was a rounded square (`border-radius: 8px`); `<app-seal-avatar>`
  is always circular with a double ring (2px `--paper-deep` inner border + 1.5px
  `--border-soft` outline, per R28's `surface="dark"`). This is an intentional part of
  adopting the "seal" visual language, not an accidental side effect.
- **Gradient**: `.avatar`'s hardcoded `linear-gradient(135deg, #6366f1, #8b5cf6)`
  (indigo→purple, unrelated to the app's `--accent`/`--accent-2` theme tokens) is
  replaced by `SealAvatarComponent`'s default `accent`→`accent-2` gradient whenever
  `avatarPreset()?.color` is unset (R27) — this is the same gradient every other seal
  avatar in the app already uses (admin institution/user rows), which is the point of
  this migration.

No tooltip or click handler exists on the `.avatar` div today (verified by re-reading
`layout.component.ts`'s template) — the two `matTooltip` buttons (`Mi perfil`, `Cerrar
sesión`) are separate sibling elements in `.user-card`, untouched by this migration
(R29). The avatar element sits outside the `!collapsed() || isMobile()` conditional
block both before and after, so it keeps rendering at all sidebar widths (R29).

### Discarded alternative: preserve the old rounded-square shape via a custom `border-radius` override

Pass a `bgColor` but keep some way to force `border-radius: 8px` on `<app-seal-avatar>`
(e.g. a new `shape` input, or an inline host style override) so the sidebar avatar's
silhouette doesn't change at all. **Rejected**: `SealAvatarComponent` has no `shape`
input and adding one only for this one call site would reintroduce exactly the kind of
one-off, host-specific escape hatch `docs/conventions.md`'s Reusability section warns
against ("no host-specific assumptions baked into a shared component's public
contract"). The circular double-ring shape is the "seal" look this entire redesign is
converging every avatar toward (admin institution/user rows already use it); keeping the
sidebar as the one remaining rounded-square exception defeats the purpose of migrating
it at all.

### Discarded alternative: keep the old hardcoded indigo/purple gradient via `bgColor`

Pass `bgColor="linear-gradient(135deg, #6366f1, #8b5cf6)"` explicitly so the sidebar
avatar's color is pixel-identical to today. **Rejected**: that gradient predates the
Cuaderno redesign and isn't derived from `--accent`/`--accent-2` at all — keeping it
would make the sidebar the only seal avatar in the app not using the shared accent
gradient, for no stated reason. `avatarPreset()?.color` (a user-chosen preset color, when
set) already takes precedence via `bgColor`, exactly as it does today — only the
*default*, no-preset case changes color.

## Guardrail verification (R11–R13, R20)

- `grep -n "badge-F\|badge-AT\|badge-J\|stamp" src/styles.css src/app/features/admin/admin.component.ts` before/after — diff must be empty (R11).
- `grep -n "@Input" src/app/shared/components/seal-avatar/seal-avatar.component.ts` before/after — diff must be empty (R12).
- `git diff src/app/shared/layout/layout.component.ts` — the diff must be scoped **only**
  to the `.avatar` → `<app-seal-avatar>` swap (template, `imports` array, and removing
  the now-unused `.avatar` CSS rule) — the `effect()`/`isTablet`/`isMobile`/`toggleMenu()`
  tablet auto-collapse logic must be byte-identical before/after (R13).
- `git diff src/app/features/admin/admin.component.ts` — the queue-monitor button block
  and its `auth.isSuperAdmin()` condition must be byte-identical before/after (R20).

## Verification

Per `docs/verification.md`: Level 1 (`pnpm run build`, R21) is mandatory. Level 4
(visual smoke, `scripts/visual-smoke.mjs`) is recommended since this touches rendered
templates — the existing `VISUAL_FEATURE` fixture setup already mocks `/api/users`,
`/api/roles`, `/api/courses`, `/api/institutions`, which is enough surface for the admin
page's `users`/`courses`/`institutions` tabs; capture at least two tabs' screenshots
(e.g. `users` and `years`) to visually confirm the Roman numeral and eyebrow suffix
actually change between tabs (R18). Level 3 (manual smoke against a real backend) should
click through all 7 admin tabs and confirm each shows its own numeral/suffix/title from
`ADMIN_TAB_CHAPTER_NUMERAL`/`ADMIN_TAB_EYEBROW_SUFFIX`/`ADMIN_TAB_TITLE`, and confirm the
5 non-admin dependent features remain unaffected (none of them exist yet in code, so this
just means: `pnpm run build` has no new template errors anywhere else in the app that
consumes `ChapterHeaderComponent` — currently only `admin.component.ts` does).

For the sidebar avatar migration (R22–R29), Level 3 should specifically check, at both
`collapsed()` states and on mobile: (1) a user with an uploaded photo avatar (`src`
branch — circular, cropped, dark ring), (2) a user with an `avatarPreset()` icon/color
(`icon` + `bgColor` branch), and (3) a user with neither (`initials` branch, default
`accent`→`accent-2` gradient) — confirming the double ring reads correctly against the
sidebar's dark `#1c1410` background (`surface="dark"`, R28) in all three cases.
