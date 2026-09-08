# Requirements — Cuaderno institucional: chapter header, seal avatar, tablet breakpoint

Scope: **frontend-only** (`attendance_frontend`). This is the shared foundation for the
"Cuaderno institucional" redesign — 9 already-declared features
(`admin_users_cuaderno_seal`, `admin_years_cuaderno_timeline`,
`admin_institutions_cuaderno_seal`, `admin_remaining_tabs_chapter_header`,
`dashboard_chapter_header`, `calendar_chapter_header`,
`absences_justifications_chapter_header`, `students_report_chapter_header`,
`citations_chapter_header`) declare `depends_on:
["cuaderno_foundation_chapter_header_seal_breakpoint"]` and cannot be claimed until this
feature is `done`. New files: `src/app/shared/components/chapter-header/
chapter-header.component.ts`, `src/app/shared/components/avatar-seal/
avatar-seal.component.ts`. Modified files: `src/app/shared/layout/layout.component.ts`,
`src/app/features/admin/admin.component.ts`. No backend change.

## Eyebrow format — the two shapes this feature must support (read before R1–R11)

The 9 dependent features' own descriptions (`state/features/030-*.md` through `039-*.md`)
give literal eyebrow strings that fall into exactly two shapes, neither of which this
feature is allowed to hard-code as "the" shape:

- **Admin chapter tabs** (`admin_users_cuaderno_seal`, `admin_years_cuaderno_timeline`,
  `admin_institutions_cuaderno_seal`, `admin_remaining_tabs_chapter_header`): `"Capítulo
  <roman numeral> — <subtítulo>"`, e.g. `"Capítulo I — Gestión de personal"`, `"Capítulo
  III — Calendario académico"`, `"Capítulo VII — Instituciones del sistema"`.
- **Every other screen** (`dashboard_chapter_header`, `calendar_chapter_header`,
  `absences_justifications_chapter_header`, `students_report_chapter_header`,
  `citations_chapter_header`): `"<Categoría> · <subtítulo>"`, **no roman numeral**, e.g.
  `"Inspectoría · Resumen del período"`, `"Calendario · Vista mensual de asistencia"`.

`ChapterHeaderComponent` (R1–R11) resolves this by **not knowing about either shape**: it
exposes a structured `eyebrowPrefix` / `eyebrowSeparator` / `eyebrowSuffix` contract and
lets each caller compose the leading text (`"Capítulo I"` or `"Inspectoría"`) itself — see
`design.md`'s "Eyebrow API" section for the full rationale and the rejected alternative
(a single free-text `eyebrowText` input).

## `ChapterHeaderComponent`

## R1
The system SHALL provide `ChapterHeaderComponent` as a `standalone: true` Angular
component with `changeDetection: ChangeDetectionStrategy.OnPush` and inline
`template`/`styles` (no `.html`/`.css` siblings), at `src/app/shared/components/
chapter-header/chapter-header.component.ts`, with `selector: 'app-chapter-header'`.

## R2
The system SHALL accept a required `eyebrowPrefix: string` input on
`ChapterHeaderComponent`.

## R3
WHERE an `eyebrowIcon` input is provided, `ChapterHeaderComponent` SHALL render a
`mat-icon` with that icon name before the eyebrow text.

## R4
IF `eyebrowIcon` is not provided THEN `ChapterHeaderComponent` SHALL NOT render a
`mat-icon` element in the eyebrow line.

## R5
WHERE an `eyebrowSuffix` input is provided, `ChapterHeaderComponent` SHALL render the
`eyebrowSeparator` value followed by the `eyebrowSuffix` text immediately after
`eyebrowPrefix` in the eyebrow line.

## R6
IF `eyebrowSuffix` is not provided THEN `ChapterHeaderComponent` SHALL render only
`eyebrowPrefix` in the eyebrow line, without rendering any separator character.

## R7
The system SHALL default `ChapterHeaderComponent`'s `eyebrowSeparator` input to `'·'`
when the caller does not supply a value.

## R8
WHERE a `title` input is provided, `ChapterHeaderComponent` SHALL render an `<h1>`
element with class `chapter-title` containing the `title` text.

## R9
IF `title` is not provided THEN `ChapterHeaderComponent` SHALL NOT render an `<h1>`
element.

## R10
The system SHALL always render — regardless of whether `title`, `eyebrowSuffix`, or
`eyebrowIcon` are provided — a two-line rule element below the eyebrow/title content:
the first line styled with `background: var(--ink)` at `55%` opacity, the second line
styled with `var(--border)` at full opacity (the "doble filete").

## R11
`ChapterHeaderComponent`'s styles SHALL reference only the existing `'Nunito'`
font-family (no new `@import`/`@font-face`) and SHALL NOT declare or modify
`.badge-F`, `.badge-AT`, `.badge-J`, or any `.stamp*` rule.

## `AvatarSealComponent`

## R12
The system SHALL provide `AvatarSealComponent` as a `standalone: true` Angular
component with `changeDetection: ChangeDetectionStrategy.OnPush` and inline
`template`/`styles`, at `src/app/shared/components/avatar-seal/
avatar-seal.component.ts`, with `selector: 'app-avatar-seal'`.

## R13
The system SHALL accept a required numeric `size` input (pixel diameter) on
`AvatarSealComponent`, plus optional `imageUrl: string | null`, `icon: string | null`,
`initials: string`, and `background: string | null` inputs.

## R14
WHERE `imageUrl` is a non-empty string, `AvatarSealComponent` SHALL render an `<img>`
element with that `src`, filling the circular area with `object-fit: cover`, and SHALL
NOT render the `icon` or `initials` content in that case.

## R15
IF `imageUrl` is not set AND `icon` is a non-empty string THEN `AvatarSealComponent`
SHALL render a `mat-icon` with that name, with the element's background set to the
`background` input value when provided, or the default `accent`→`accent-2` gradient
otherwise.

## R16
IF neither `imageUrl` nor `icon` is set THEN `AvatarSealComponent` SHALL render the
`initials` input text, or the literal `'?'` when `initials` is empty or not provided,
with the element's background set to the `background` input value when provided, or the
default `accent`→`accent-2` gradient otherwise.

## R17
The system SHALL render `AvatarSealComponent`'s root element as a circle
(`border-radius: 50%`, width and height equal to the `size` input in pixels) with a
`2px solid var(--paper)` border and a `1.5px solid var(--border-soft)` outline offset
by `2px`.

## R18
`AvatarSealComponent`'s styles SHALL reference only the existing `'Nunito'`
font-family (no new `@import`/`@font-face`).

## `LayoutComponent` sidebar avatar adopts the seal

## R19
The system SHALL replace the sidebar `.avatar` `<div>` in `LayoutComponent`'s
`user-card` block with `<app-avatar-seal>`, passing: `imageUrl` = the current user's
`avatarUrl` when `isUploadedAvatar()` is `true` (else `null`); `icon` =
`avatarPreset()?.icon` when set (else `null`); `background` = `avatarPreset()?.color`
when set (else `null`); `initials` = the existing `initials()` value; `size` = `32`.

## R20
The system SHALL leave the sidebar `user-info` block's existing `!collapsed() ||
isMobile()` visibility condition unchanged when adopting `AvatarSealComponent` (R19).

## Admin chapter numerals (shared by 4 dependent features)

## R21
The system SHALL export an `ADMIN_TAB_CHAPTER_NUMERAL` constant (a `Record<string,
string>` keyed by the existing `activeTab()` tab-key strings — `'users'`, `'courses'`,
`'years'`, `'permissions'`, `'citation-reasons'`, `'roster'`, `'institutions'`) from
`admin.component.ts`, mapping each key to its roman numeral (`'I'` through `'VII'`
respectively, in that tab order) for reuse by `admin_users_cuaderno_seal`,
`admin_years_cuaderno_timeline`, `admin_institutions_cuaderno_seal`, and
`admin_remaining_tabs_chapter_header`.

## Admin table breakpoint widening

## R22
The system SHALL replace `admin.component.ts`'s Cursos and Motivos de citación tabs'
`hidden md:block` / `md:hidden` Tailwind classes with `hidden lg:block` / `lg:hidden`
respectively.

## R23
The system SHALL change `admin.component.ts`'s `.hidden-mobile`/`.hidden-desktop`
media query from `@media (max-width: 768px)` to `@media (max-width: 1024px)`.

## R24
WHEN the viewport width is between `769px` and `1024px` inclusive, the admin Usuarios,
Cursos, and Motivos de citación tabs SHALL render their card/list variant instead of
the `<table>` variant.

## R25
WHEN the viewport width is `1025px` or greater, the admin Usuarios, Cursos, and
Motivos de citación tabs SHALL render the `<table>` variant, matching today's behavior
above the old `768px` cut.

## Sidebar collapsed-by-default in the tablet range

## R26
The system SHALL add an `isTabletOrSmaller` signal to `LayoutComponent`, derived from
`BreakpointObserver.observe('(max-width: 1024px)')`.

## R27
The system SHALL derive `LayoutComponent`'s `collapsed` signal as a `computed()` of a
private override signal (initial value `null`), falling back to `isTabletOrSmaller()`
when the override is `null`.

## R28
WHEN the user invokes `toggleMenu()` while `isMobile()` is `false`, the system SHALL
set the private override signal (R27) to the negation of `collapsed()`'s value at the
time of the call.

## R29
WHILE the private override signal (R27) is `null` and `isTabletOrSmaller()` is `true`,
the sidebar SHALL render collapsed (`64px` width, icon-only nav) without requiring any
manual toggle.

## R30
WHILE the private override signal (R27) is `null` and `isTabletOrSmaller()` is
`false`, the sidebar SHALL render expanded (`240px` width), matching today's default
above `1024px`.

## R31
This feature SHALL NOT change `isMobile`'s existing `(max-width: 767px)` threshold or
the mobile off-canvas/overlay sidebar behavior (`mobileOpen`, `sidebar-hidden`).

## Guardrails & build

## R32
This feature SHALL NOT modify the `.badge-F`, `.badge-AT`, `.badge-J`, `.stamp`,
`.stamp-f`, `.stamp-at`, or `.stamp-j` rule definitions in `src/styles.css`.

## R33
The implementer SHALL run `pnpm run build` and SHALL confirm it exits `0` before
declaring this feature done, per `docs/verification.md` Level 1.
