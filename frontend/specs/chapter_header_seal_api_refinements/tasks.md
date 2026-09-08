# Tasks — Chapter header / seal avatar API refinements

- [x] T1 (R9, R10) In `chapter-header.component.ts`, rename `@Input() roman!: string` to
      `@Input({ required: true }) eyebrowPrefix!: string` and `@Input() subtitle!: string`
      to `@Input({ required: true }) eyebrowSuffix!: string`; update JSDoc comments;
      update the two `{{ }}` bindings in the template.

- [x] T2 (R1, R2) In `chapter-header.component.ts`, add `@Input() eyebrowSeparator =
      '·';` and replace the template's hardcoded `<span class="chapter-sep">·</span>`
      with `<span class="chapter-sep">{{ eyebrowSeparator }}</span>`.

- [x] T3 (R3, R4, R5) In `chapter-header.component.ts`, change `@Input() title!: string`
      to `@Input() title: string | null = null;` and wrap the `<h1 class="chapter-title">`
      element in `@if (title) { ... }`.

- [x] T4 (R6, R7, R8) In `chapter-header.component.ts`, change `@Input() icon!: string`
      to `@Input() icon: string | null = null;` and wrap the `<mat-icon>` element in
      `@if (icon) { ... }`.

- [x] T5 (R14) In `admin.component.ts`, add the exported `ADMIN_TAB_CHAPTER_NUMERAL:
      Record<string, string>` constant (module level, values `'I'`–`'VII'` per
      `design.md`).

- [x] T6 (R15) In `admin.component.ts`, add the exported `ADMIN_TAB_EYEBROW_SUFFIX:
      Record<string, string>` constant (module level, values per `design.md`).

- [x] T7 (R16) In `admin.component.ts`, add the exported `ADMIN_TAB_TITLE: Record<string,
      string>` constant (module level, values per `design.md`).

- [x] T8 (R17, R18) In `admin.component.ts`, import `computed` from `@angular/core` and
      add `chapterEyebrowPrefix`, `chapterEyebrowSuffix`, `chapterTitle` as `computed()`
      signals reading `this.activeTab()` against the three new constants (T5–T7).

- [x] T9 (R17, R19, R20) In `admin.component.ts`'s template, replace the single fixed
      `<app-chapter-header icon="admin_panel_settings" roman="I" subtitle="Institucional"
      title="Administración" />` with `<app-chapter-header icon="admin_panel_settings"
      [eyebrowPrefix]="chapterEyebrowPrefix()" eyebrowSeparator="—"
      [eyebrowSuffix]="chapterEyebrowSuffix()" [title]="chapterTitle()" />`, leaving the
      surrounding `.page-header` div and the queue-monitor button block byte-identical.

- [x] T10 (R11, R12) Guardrail check: run `git diff` scoped to
      `src/app/shared/components/seal-avatar/seal-avatar.component.ts` and confirm it is
      empty; `grep -n "badge-F\|badge-AT\|badge-J\|stamp" src/styles.css` before/after
      this feature's changes and confirm no diff.

- [x] T11 (R21) Run `pnpm run build` and confirm it exits `0`.

- [x] T12 (R18) Manual/visual smoke: load `/admin`, switch between at least 3 tabs
      (e.g. Usuarios, Años lectivos, Instituciones) and confirm the eyebrow's Roman
      numeral, suffix text, and `<h1>` title all change per `ADMIN_TAB_CHAPTER_NUMERAL`
      / `ADMIN_TAB_EYEBROW_SUFFIX` / `ADMIN_TAB_TITLE`, and that the queue-monitor button
      (superadmin only) still renders in the same place. Record screenshots/notes in
      `progress/impl_chapter_header_seal_api_refinements.md`.

- [x] T13 (R22, R23, R28) In `layout.component.ts`, import `SealAvatarComponent` and add
      it to the component's `imports` array; replace the `.avatar` `<div>` in the
      `user-card` block with `<app-seal-avatar [size]="32" ... surface="dark" />`.

- [x] T14 (R24, R25, R26, R27) Bind `<app-seal-avatar>`'s `src`, `icon`, `initials`, and
      `bgColor` inputs exactly as specified in `design.md`'s before/after block, reusing
      the existing `isUploadedAvatar()`, `avatarPreset()`, and `initials()` helpers
      unchanged.

- [x] T15 (R29) Remove the now-unused `.avatar` CSS rule from `layout.component.ts`'s
      `styles:` block; confirm (by re-reading the template) that the `user-info` block,
      its `!collapsed() || isMobile()` condition, and the two `matTooltip` buttons are
      untouched.

- [x] T16 (R13) Guardrail check: `git diff src/app/shared/layout/layout.component.ts`
      and confirm the only changes are the avatar swap (T13–T15) — the
      `effect()`/`isTablet`/`isMobile`/`toggleMenu()` tablet auto-collapse code is
      byte-identical to before this feature.

- [x] T17 (R22–R28) Manual/visual smoke: with `collapsed()` both `true` and `false` (and
      on a mobile viewport), confirm the sidebar avatar renders correctly for a user with
      an uploaded photo, a user with an `avatarPreset()` icon/color, and a user with
      neither (initials fallback) — the double ring should read clearly against the dark
      sidebar background in all three cases. Record notes/screenshots in
      `progress/impl_chapter_header_seal_api_refinements.md`.
