# Requirements — Chapter header / seal avatar API refinements

Scope: **frontend-only** (`attendance_frontend`). Feature 29
(`cuaderno_foundation_chapter_header_seal_breakpoint`) shipped `ChapterHeaderComponent`,
`SealAvatarComponent`, the tablet auto-collapse sidebar behavior, and the admin table
breakpoint widening — merged to `staging` via PR #118 (commits `aa26ab3`, `bd309b1`,
`accafdd`, `72f2b4d`). The **shipped code**, not the original (now-superseded) spec at
`specs/cuaderno_foundation_chapter_header_seal_breakpoint/`, is the baseline for this
feature. 8 declared features (`admin_users_cuaderno_seal`, `admin_years_cuaderno_timeline`,
`admin_institutions_cuaderno_seal`, `admin_remaining_tabs_chapter_header`,
`dashboard_chapter_header`, `calendar_chapter_header`,
`absences_justifications_chapter_header`, `students_report_chapter_header`,
`citations_chapter_header`) depend on feature 29 and cannot be claimed until this feature
is `done` too (the harness gate treats this feature's completion as part of that
dependency chain).

Three concrete defects were confirmed by reading the actual shipped code (not the old
spec) before drafting this document:

1. `ChapterHeaderComponent.title` is a required `@Input()` with no default
   (`@Input() title!: string;`) and the template unconditionally renders `<h1
   class="chapter-title">{{ title }}</h1>`. The 5 non-admin dependent features
   (`dashboard_chapter_header`, `calendar_chapter_header`,
   `absences_justifications_chapter_header`, `students_report_chapter_header`,
   `citations_chapter_header`) each already have their own `<h1 class="page-title">`
   elsewhere on the page (confirmed in `dashboard.component.ts`, `calendar.component.ts`,
   `absences.component.ts`) and only want the eyebrow + double rule from
   `ChapterHeaderComponent` — there is no way today to use the component without also
   forcing a second, unwanted/empty `<h1>`.
2. The eyebrow separator character (`'·'`) is hardcoded inside the template
   (`<span class="chapter-sep">·</span>`), not an input. The 4 admin-tab dependent
   features (`admin_users_cuaderno_seal`, `admin_years_cuaderno_timeline`,
   `admin_institutions_cuaderno_seal`, `admin_remaining_tabs_chapter_header`) need the
   format `"Capítulo <roman> — <subtítulo>"` (em dash), while the 5 non-admin features
   need `"<Categoría> · <subtítulo>"` (middle dot) — confirmed against each feature's own
   description in `state/features/030-*.md` through `039-*.md`.
3. `admin.component.ts` renders exactly **one** `<app-chapter-header>` at the top of the
   page (`icon="admin_panel_settings" roman="I" subtitle="Institucional"
   title="Administración"`), fixed regardless of which of the 7 tabs (`activeTab()`) is
   selected — confirmed by reading the file; no `ADMIN_TAB_CHAPTER_NUMERAL` constant (or
   equivalent) exists anywhere in `src/app`. `admin_users_cuaderno_seal`,
   `admin_years_cuaderno_timeline`, `admin_institutions_cuaderno_seal`, and
   `admin_remaining_tabs_chapter_header` each need their own tab to show its own Roman
   numeral (Usuarios=I, Cursos=II, Años=III, Permisos=IV, Motivos=V, Nómina=VI,
   Instituciones=VII, per the task and confirmed against each feature's own literal
   eyebrow text where given).

`SealAvatarComponent`'s current public contract (`size`, `src`, `icon`, `initials`,
`bgColor`, `surface`, `alt`) was checked against every fallback shape the 8 dependent
features need (`admin_users_cuaderno_seal`'s user initials seal,
`admin_institutions_cuaderno_seal`'s institution logo-or-initials seal) — no structural
gap was found. This feature therefore makes **no changes** to `SealAvatarComponent`
itself; see `design.md`'s discarded alternatives for the rename that was considered and
rejected.

A fourth item was confirmed by re-reading `src/app/shared/layout/layout.component.ts`:
`LayoutComponent`'s sidebar `user-card` avatar is still a hand-rolled `.avatar` `<div>`
(hardcoded `linear-gradient(135deg, #6366f1, #8b5cf6)`, `border-radius: 8px`, `32px`
square, no tooltip, no click handler) with its own inline `@if (isUploadedAvatar()) { ...
} @else if (avatarPreset()) { ... } @else { {{initials()}} }` branch — `SealAvatarComponent`
already exists, is stable (used in `admin.component.ts` today), and its `surface: 'light'
| 'dark'` input's own doc comment explicitly calls out the sidebar as its intended
dark-surface use case, yet nothing has migrated this call site to it. Ricardo confirmed
this migration belongs in this feature's scope (R22–R29 below), not a future one.

## `ChapterHeaderComponent` — configurable eyebrow separator

## R1
The system SHALL accept an `eyebrowSeparator: string` `@Input()` on
`ChapterHeaderComponent`, defaulting to `'·'` when the caller does not supply a value.

## R2
`ChapterHeaderComponent` SHALL render the `eyebrowSeparator` input's current value in the
eyebrow line, in place of the hardcoded `'·'` character.

## `ChapterHeaderComponent` — optional title (no forced `<h1>`)

## R3
The system SHALL change `ChapterHeaderComponent`'s `title` `@Input()` from required to
optional, with a default value of `null`.

## R4
WHERE `title` is a non-empty string, `ChapterHeaderComponent` SHALL render an `<h1
class="chapter-title">` element containing the `title` text.

## R5
IF `title` is `null` or not provided THEN `ChapterHeaderComponent` SHALL NOT render an
`<h1>` element.

## `ChapterHeaderComponent` — optional icon (same defect class as R3–R5, applied for consistency)

## R6
The system SHALL change `ChapterHeaderComponent`'s `icon` `@Input()` from required to
optional, with a default value of `null`.

## R7
WHERE `icon` is a non-empty string, `ChapterHeaderComponent` SHALL render a `mat-icon`
element with that icon name before the eyebrow text.

## R8
IF `icon` is `null` or not provided THEN `ChapterHeaderComponent` SHALL NOT render a
`mat-icon` element in the eyebrow line.

## `ChapterHeaderComponent` — renamed eyebrow content inputs

## R9
The system SHALL rename `ChapterHeaderComponent`'s `roman` `@Input()` to `eyebrowPrefix`
(required `string`), documented as the leading eyebrow text regardless of whether it is a
Roman numeral (e.g. `"Capítulo I"`) or a plain category word (e.g. `"Inspectoría"`).

## R10
The system SHALL rename `ChapterHeaderComponent`'s `subtitle` `@Input()` to
`eyebrowSuffix` (required `string`), rendered immediately after `eyebrowPrefix` and
`eyebrowSeparator` in the eyebrow line.

## Guardrails — no regressions to adjacent, already-shipped behavior

## R11
This feature SHALL NOT modify the `.badge-F`, `.badge-AT`, `.badge-J`, `.stamp`,
`.stamp-f`, `.stamp-at`, or `.stamp-j` rule definitions, in `src/styles.css` or in any
component's own `styles:` block.

## R12
This feature SHALL NOT modify `SealAvatarComponent`'s public `@Input()` contract
(`size`, `src`, `icon`, `initials`, `bgColor`, `surface`, `alt`) or its selector
(`app-seal-avatar`).

## R13
This feature SHALL NOT modify `LayoutComponent`'s tablet auto-collapse `effect()` /
`isTablet` signal, `isMobile` signal, or `toggleMenu()` behavior introduced in feature 29.

## `admin.component.ts` — per-tab chapter numeral and eyebrow content

## R14
The system SHALL export an `ADMIN_TAB_CHAPTER_NUMERAL: Record<string, string>` constant
from `admin.component.ts`, keyed by the existing `activeTab()` tab-key strings (`'users'`,
`'courses'`, `'years'`, `'permissions'`, `'citation-reasons'`, `'roster'`,
`'institutions'`), mapping each key to its Roman numeral — `'I'`, `'II'`, `'III'`, `'IV'`,
`'V'`, `'VI'`, `'VII'` respectively, in that order.

## R15
The system SHALL export an `ADMIN_TAB_EYEBROW_SUFFIX: Record<string, string>` constant
from `admin.component.ts`, keyed the same as `ADMIN_TAB_CHAPTER_NUMERAL` (R14), with
values `'Gestión de personal'` (`users`), `'Cursos'` (`courses`), `'Calendario
académico'` (`years`), `'Permisos'` (`permissions`), `'Motivos de citación'`
(`citation-reasons`), `'Importar nómina'` (`roster`), and `'Instituciones del sistema'`
(`institutions`).

## R16
The system SHALL export an `ADMIN_TAB_TITLE: Record<string, string>` constant from
`admin.component.ts`, keyed the same as `ADMIN_TAB_CHAPTER_NUMERAL` (R14), with values
`'Usuarios'`, `'Cursos'`, `'Años lectivos'`, `'Permisos'`, `'Motivos de citación'`,
`'Importar nómina'`, and `'Instituciones'` for their respective keys.

## R17
`admin.component.ts` SHALL render exactly one `<app-chapter-header>` element, whose
`eyebrowPrefix`, `eyebrowSuffix`, and `title` inputs are computed from the current
`activeTab()` value via `ADMIN_TAB_CHAPTER_NUMERAL` (R14), `ADMIN_TAB_EYEBROW_SUFFIX`
(R15), and `ADMIN_TAB_TITLE` (R16) respectively, with `eyebrowPrefix` equal to the string
`'Capítulo '` concatenated with `ADMIN_TAB_CHAPTER_NUMERAL[activeTab()]`.

## R18
WHEN `activeTab()`'s value changes, `admin.component.ts`'s `<app-chapter-header>` SHALL
re-render with the new tab's `eyebrowPrefix`, `eyebrowSuffix`, and `title` values (R17).

## R19
`admin.component.ts` SHALL pass `'—'` (em dash) as the `eyebrowSeparator` input to its
`<app-chapter-header>` element.

## R20
This feature SHALL NOT change `admin.component.ts`'s `icon` value passed to
`<app-chapter-header>` (`'admin_panel_settings'`), the queue-monitor button's visibility
condition (`auth.isSuperAdmin()`) or position, or the `<app-chapter-header>` element's
placement inside the existing `.page-header` container.

## Build verification

## R21
The implementer SHALL run `pnpm run build` and SHALL confirm it exits `0` before
declaring this feature done, per `docs/verification.md` Level 1.

## `LayoutComponent` sidebar avatar adopts the seal

## R22
The system SHALL replace `LayoutComponent`'s sidebar `.avatar` `<div>` (in the
`user-card` block) with `<app-seal-avatar>`.

## R23
`LayoutComponent`'s `<app-seal-avatar>` SHALL be passed `size="32"`, matching the
`.avatar` div's current `32px` width/height.

## R24
`LayoutComponent`'s `<app-seal-avatar>` SHALL be passed `src` equal to the current
user's `avatarUrl` when `isUploadedAvatar()` is `true`, and `null` otherwise — matching
the condition that currently gates the `.avatar` div's `<img>` branch.

## R25
`LayoutComponent`'s `<app-seal-avatar>` SHALL be passed `icon` equal to
`avatarPreset()?.icon` when set, and `null` otherwise — matching the condition that
currently gates the `.avatar` div's `<mat-icon>` branch.

## R26
`LayoutComponent`'s `<app-seal-avatar>` SHALL be passed `initials` equal to the existing
`initials()` value.

## R27
`LayoutComponent`'s `<app-seal-avatar>` SHALL be passed `bgColor` equal to
`avatarPreset()?.color` when set, and `null` otherwise — replacing the `.avatar` div's
current hardcoded `linear-gradient(135deg, #6366f1, #8b5cf6)` with
`SealAvatarComponent`'s default `accent`→`accent-2` gradient whenever no preset color is
set.

## R28
`LayoutComponent`'s `<app-seal-avatar>` SHALL be passed `surface="dark"`, so the seal's
inner ring renders in `var(--paper-deep)` instead of `var(--paper)` against the
sidebar's dark (`#1c1410`) background.

## R29
This feature SHALL leave `LayoutComponent`'s `user-info` block (name/role text) and its
existing `!collapsed() || isMobile()` visibility condition, and the two `matTooltip`
buttons (`Mi perfil`, `Cerrar sesión`) next to it, unchanged when migrating the avatar
(R22–R28) — the avatar SHALL continue to render regardless of `collapsed()`'s value,
matching current behavior, and this feature SHALL remove the now-unused `.avatar` CSS
rule from `LayoutComponent`'s `styles:` block.
