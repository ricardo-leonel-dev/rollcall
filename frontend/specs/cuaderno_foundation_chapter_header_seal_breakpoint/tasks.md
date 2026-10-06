# Tasks — Cuaderno institucional: chapter header, seal avatar, tablet breakpoint

Work top-to-bottom. The two new components (T1–T12) are independent of the
`LayoutComponent`/`admin.component.ts` changes, but `LayoutComponent`'s avatar swap
(T13) depends on `AvatarSealComponent` existing first, so components come before their
consumers.

## `ChapterHeaderComponent`

- [ ] T1 (R1, R2, R7) Scaffold `ChapterHeaderComponent`
      (`src/app/shared/components/chapter-header/chapter-header.component.ts`):
      `standalone: true`, `ChangeDetectionStrategy.OnPush`, selector
      `app-chapter-header`, inline `template`/`styles`, `@Input({ required: true })
      eyebrowPrefix!: string`, `@Input() eyebrowSeparator = '·'`.
- [ ] T2 (R3, R4) Add `@Input() eyebrowIcon: string | null = null` and render a
      `mat-icon` before the eyebrow text only when it's set.
- [ ] T3 (R5, R6) Add `@Input() eyebrowSuffix: string | null = null`; render
      `eyebrowSeparator` + `eyebrowSuffix` right after `eyebrowPrefix` only when
      `eyebrowSuffix` is set, with no separator rendered otherwise.
- [ ] T4 (R8, R9) Add `@Input() title: string | null = null`; render `<h1
      class="chapter-title">{{ title }}</h1>` only when it's set.
- [ ] T5 (R10) Add the always-rendered two-line rule (`.chapter-rule-ink` at `background:
      var(--ink); opacity: .55`, `.chapter-rule-border` at `background: var(--border)`)
      below the eyebrow/title content.
- [ ] T6 (R11) Confirm the component's `styles` block only references `'Nunito'` (no
      new `@import`/`@font-face`) and does not touch `.badge-*`/`.stamp*`.

## `AvatarSealComponent`

- [ ] T7 (R12, R13) Scaffold `AvatarSealComponent`
      (`src/app/shared/components/avatar-seal/avatar-seal.component.ts`):
      `standalone: true`, `ChangeDetectionStrategy.OnPush`, selector `app-avatar-seal`,
      `@Input({ required: true }) size!: number`, `@Input() imageUrl: string | null =
      null`, `@Input() icon: string | null = null`, `@Input() initials = ''`,
      `@Input() background: string | null = null`.
- [ ] T8 (R14) Implement the `imageUrl` branch: `<img [src]="imageUrl">` filling the
      circle with `object-fit: cover`, taking priority over `icon`/`initials`.
- [ ] T9 (R15) Implement the `icon` branch (when `imageUrl` is unset): render
      `mat-icon`, background = `background` input or the default `accent`→`accent-2`
      gradient.
- [ ] T10 (R16) Implement the `initials`/`'?'` fallback branch (when neither
      `imageUrl` nor `icon` is set), same background rule as T9.
- [ ] T11 (R17) Style the root element as a circle sized by the `size` input, with
      `border: 2px solid var(--paper)` and `outline: 1.5px solid var(--border-soft)`
      at `outline-offset: 2px`.
- [ ] T12 (R18) Confirm the component's `styles` block only references `'Nunito'`.

## `LayoutComponent` — avatar swap

- [ ] T13 (R19, R20) Replace the sidebar `.avatar` `<div>` with `<app-avatar-seal
      [size]="32" [imageUrl]="..." [icon]="..." [background]="..."
      [initials]="initials()">` per `design.md`'s mapping; add
      `AvatarSealComponent` to `LayoutComponent`'s `imports`; verify the surrounding
      `user-info` block's `!collapsed() || isMobile()` condition is untouched.

## `admin.component.ts` — chapter numerals & breakpoint widening

- [ ] T14 (R21) Export `ADMIN_TAB_CHAPTER_NUMERAL: Record<string, string>` from
      `admin.component.ts` mapping `'users'→'I'`, `'courses'→'II'`, `'years'→'III'`,
      `'permissions'→'IV'`, `'citation-reasons'→'V'`, `'roster'→'VI'`,
      `'institutions'→'VII'`.
- [ ] T15 (R22) Replace the Cursos and Motivos de citación tabs' `hidden md:block` /
      `md:hidden` classes with `hidden lg:block` / `lg:hidden`.
- [ ] T16 (R23) Change the Usuarios tab's `.hidden-mobile`/`.hidden-desktop` media
      query from `@media (max-width: 768px)` to `@media (max-width: 1024px)`.

## `LayoutComponent` — tablet-collapsed sidebar

- [ ] T17 (R26) Add `isTabletOrSmaller` signal to `LayoutComponent`, derived from
      `this.bp.observe('(max-width: 1024px)')` via `toSignal(...)`.
- [ ] T18 (R27, R28) Replace `readonly collapsed = signal(false)` with a private
      `_collapsedOverride = signal<boolean | null>(null)` and `readonly collapsed =
      computed(() => this._collapsedOverride() ?? this.isTabletOrSmaller())`; update
      `toggleMenu()`'s non-mobile branch to `this._collapsedOverride.set(!this.collapsed())`.
- [ ] T19 (R31) Verify `isMobile`'s `(max-width: 767px)` query, `mobileOpen`, and the
      `sidebar-hidden` class logic are unchanged by T17/T18.

## Build & verification

- [ ] T20 (R33) Run `pnpm run build` (or `./node_modules/.bin/tsc --noEmit -p .`) and
      confirm exit code `0`. If red, fix and re-run before T21.
- [ ] T21 (R24, R25, R29, R30, R32) Run a manual smoke against `docker compose up -d
      --build frontend` (or an already-running stack) per `docs/verification.md`
      Level 1 + Level 3, recording each step's pass/fail outcome in
      `progress/impl_cuaderno_foundation_chapter_header_seal_breakpoint.md`:
      1. Log in; confirm the sidebar avatar is circular with a visible double ring
         (border + outline), showing the initials/preset icon/uploaded photo exactly
         as before, just circular instead of square.
      2. Resize the browser (or devtools responsive mode) to `1200px` wide: sidebar
         is expanded (`240px`) by default; open `/admin` on a tab with a table
         (Usuarios, Cursos, or Motivos de citación) and confirm the full `<table>`
         renders, not the card variant.
      3. Resize to `900px` wide (inside the new `769–1024px` tablet range): sidebar
         collapses to `64px` icon-only by default without clicking the toggle;
         the same admin tab now shows its card/list variant instead of the table.
      4. At `900px`, click the sidebar toggle to manually re-expand it; resize to
         `1200px` and back to `900px` again — confirm the sidebar stays expanded
         (the manual override persists across the resize, per R28–R30).
      5. Resize below `768px`: confirm the existing mobile off-canvas sidebar
         behavior (hamburger + overlay) is unchanged.
      6. Open browser devtools' computed-styles panel on `.badge-F`/`.badge-AT`/
         `.badge-J` (visible on any absence-listing screen) and confirm their rules
         are byte-identical to `main`/pre-feature (R32).
- [ ] T22 (Level 4, recommended) Capture a screenshot of the sidebar (both a
      `>1024px` and a `769–1024px` viewport) via `scripts/visual-smoke.mjs` or an
      equivalent one-off headless-Chromium check, and attach it to the session log —
      `ChapterHeaderComponent` has no live consumer yet in this feature (the 9
      dependent features exercise it), so its own visual smoke happens once those
      land; this feature's visual footprint is the sidebar seal + breakpoint only.
