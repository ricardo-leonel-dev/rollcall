# Implementation — chapter_header_seal_api_refinements (feature 40)

## Outcome

Implemented all 29 requirements / 17 tasks from
`specs/chapter_header_seal_api_refinements/{requirements.md,design.md,tasks.md}` exactly as designed —
no deviation from the approved spec. Followed the "before" snippets in `design.md` verbatim; re-read
every touched file first and confirmed each "before" snippet matched the actual shipped code byte-for-byte
before applying the "after".

## Scope (files touched)

- `src/app/shared/components/chapter-header/chapter-header.component.ts` — R1–R10
- `src/app/features/admin/admin.component.ts` — R14–R20
- `src/app/shared/layout/layout.component.ts` — R22–R29

No other files touched. `src/app/shared/components/seal-avatar/seal-avatar.component.ts` and
`src/styles.css` are untouched (confirmed via `git diff`, both empty — R11, R12).

## Traceability (R<n> → file:line, evidence)

| R<n> | Code / file:line | Evidence |
|---|---|---|
| R1 | `chapter-header.component.ts:119` (`@Input() eyebrowSeparator = '·';`) | Default value present in source; TS compiles (`pnpm run build` exit 0). |
| R2 | `chapter-header.component.ts:99` (`<span class="chapter-sep">{{ eyebrowSeparator }}</span>`) | Template binds the input instead of a literal `·`. Visual smoke: `admin.component.ts` overrides it to `"—"` and all 3 captured screenshots (`progress/visual_chapter_header_seal_api_refinements_{users,years,institutions}.png`) show `—` between prefix/suffix, confirming the binding is live, not hardcoded. |
| R3 | `chapter-header.component.ts:121` (`@Input() title: string | null = null;`) | Required-with-`!` removed; optional with `null` default. `pnpm run build` has zero new template errors. |
| R4 | `chapter-header.component.ts:102` (`@if (title) { <h1 class="chapter-title">{{ title }}</h1> }`) | Visual smoke: all 3 admin screenshots show the `<h1>` rendering ("Usuarios", "Años lectivos", "Instituciones") since `admin.component.ts` always passes a non-empty `title`. |
| R5 | Same line as R4 — `@if (title)` guards the `<h1>` | Only caller today (`admin.component.ts`) always supplies `title`, so the "omitted" branch isn't exercised at runtime yet; verified by code inspection — `@if (title)` is `false` for `null`/`''`/`undefined`, so no `<h1>` node is created in that case (Angular control-flow `@if`, not `display:none`). |
| R6 | `chapter-header.component.ts:112` (`@Input() icon: string | null = null;`) | Required-with-`!` removed; optional with `null` default. |
| R7 | `chapter-header.component.ts:97` (`@if (icon) { <mat-icon>{{ icon }}</mat-icon> }`) | Visual smoke: all 3 screenshots show the icon (small graduation-cap glyph) rendering since `admin.component.ts` passes `icon="admin_panel_settings"`. |
| R8 | Same line as R7 | Only caller passes a non-empty `icon` today; verified by code inspection (same `@if` mechanism as R5). |
| R9 | `chapter-header.component.ts:115` (`@Input({ required: true }) eyebrowPrefix!: string;`), `:98` (`{{ eyebrowPrefix }}`) | `roman` renamed; `grep -n "roman" src/app/shared/components/chapter-header/chapter-header.component.ts` → 0 matches (only the private `.chapter-roman` CSS class name remains, which R-design explicitly says stays). `pnpm run build` clean (Angular's `strictTemplates` would fail if `admin.component.ts` still bound the old name). |
| R10 | `chapter-header.component.ts:117` (`@Input({ required: true }) eyebrowSuffix!: string;`), `:100` (`{{ eyebrowSuffix }}`) | Same as R9 for `subtitle`→`eyebrowSuffix`; `grep -n "subtitle"` → 0 matches. |
| R11 | n/a (guardrail) | `git diff src/styles.css` → empty. No `.badge-F`/`.badge-AT`/`.badge-J`/`.stamp*` rule touched. |
| R12 | n/a (guardrail) | `git diff src/app/shared/components/seal-avatar/seal-avatar.component.ts` → empty. |
| R13 | n/a (guardrail) | `git diff src/app/shared/layout/layout.component.ts` (full diff reviewed) shows only: new import line 18, `imports` array line 23-24, `.avatar` CSS rule removal, and the avatar template swap (lines 228-234). No line inside the `effect()`/`isTablet`/`isMobile`/`toggleMenu()` block (lines ~320-410) is touched. |
| R14 | `admin.component.ts:34-42` (`ADMIN_TAB_CHAPTER_NUMERAL`) | Exported `Record<string, string>`, 7 keys, values `'I'`–`'VII'` matching `design.md` verbatim. |
| R15 | `admin.component.ts:44-52` (`ADMIN_TAB_EYEBROW_SUFFIX`) | Exported, 7 keys, values copied verbatim from `design.md`. |
| R16 | `admin.component.ts:54-62` (`ADMIN_TAB_TITLE`) | Exported, 7 keys, values copied verbatim from `design.md`. |
| R17 | `admin.component.ts:134-139` (template), `:586-588` (`computed()` signals) | Exactly one `<app-chapter-header>` element; `[eyebrowPrefix]="chapterEyebrowPrefix()"` = `` `Capítulo ${ADMIN_TAB_CHAPTER_NUMERAL[this.activeTab()] ?? ''}` ``. Visual smoke confirms `"Capítulo I"`/`"Capítulo III"`/`"Capítulo VII"` for `users`/`years`/`institutions`. |
| R18 | Same as R17 | Visual smoke: 3 separate screenshots (`?tab=users`, `?tab=years`, `?tab=institutions`) each show distinct eyebrow/title text, proving the header re-renders per `activeTab()` change (query-param-driven navigation, same signal `admin.component.ts` already used for tab content). |
| R19 | `admin.component.ts:137` (`eyebrowSeparator="—"`) | Visual smoke: all 3 screenshots render `—` (em dash) between prefix and suffix. |
| R20 | `admin.component.ts:135` (`icon="admin_panel_settings"`, unchanged), `:140-146` (queue-monitor button, byte-identical) | `git diff src/app/features/admin/admin.component.ts` shows the queue-monitor `@if (auth.isSuperAdmin())` block and its contents unchanged; `icon` literal unchanged; `.page-header` wrapper div unchanged. |
| R21 | n/a | `pnpm run build` → exit code `0`, confirmed via `echo $?` after a clean run to a log file (`/tmp/build_out.log`), zero `error` matches. Only pre-existing budget/optional-chaining warnings in unrelated files (`student-history*.component.ts`, `styles.css` `@import` order, bundle budget) — all present before this feature's changes. |
| R22 | `layout.component.ts:228-234` (`<app-seal-avatar ... />` replacing the old `.avatar` div) | `grep -n "class=\"avatar\"" layout.component.ts` → 0 matches. |
| R23 | `layout.component.ts:229` (`[size]="32"`) | Matches old div's `32px` width/height. |
| R24 | `layout.component.ts:230` (`[src]="isUploadedAvatar() ? (auth.currentUser()?.avatarUrl ?? null) : null"`) | Same condition (`isUploadedAvatar()`) that gated the old `<img>` branch, reused unchanged. |
| R25 | `layout.component.ts:231` (`[icon]="avatarPreset()?.icon ?? null"`) | Same condition (`avatarPreset()`) that gated the old `<mat-icon>` branch. |
| R26 | `layout.component.ts:232` (`[initials]="initials()"`) | Reuses the existing `initials()` helper unchanged. |
| R27 | `layout.component.ts:233` (`[bgColor]="avatarPreset()?.color ?? null"`) | When no preset color is set, `bgColor` is `null` → `SealAvatarComponent`'s own `[style.background]="bgColor || null"` falls through to its CSS default `linear-gradient(135deg, var(--accent), var(--accent-2))` (`seal-avatar.component.ts:39`) instead of the removed hardcoded indigo/purple. Visual smoke (`progress/visual_chapter_header_seal_api_refinements_users.png`) shows the sidebar avatar ("VS" initials) rendering with the indigo/purple `--accent`/`--accent-2` gradient (same visual family as before by coincidence of the theme's default accent colors, but now theme-driven, not hardcoded). |
| R28 | `layout.component.ts:234` (`surface="dark"`) | `SealAvatarComponent`'s `.seal.surface-dark { border-color: var(--paper-deep); }` rule (`seal-avatar.component.ts:68-70`) applies. Visual smoke shows the double ring reading clearly against the `#1c1410` sidebar background in all captured screenshots, including the collapsed-sidebar shot. |
| R29 | `layout.component.ts:227-247` (avatar sits outside the `@if (!collapsed() \|\| isMobile())` block, `user-info` + 2 `matTooltip` buttons block untouched) | `git diff` shows the `user-info`/button block lines unchanged (only the preceding avatar element was replaced); the removed `.avatar` CSS rule (`git diff` shows the 12-line rule deleted, nothing else in `styles:` touched). Visual smoke `progress/visual_chapter_header_seal_api_refinements_sidebar_collapsed.png` confirms the seal avatar still renders when `collapsed()` is `true` (name/role text and buttons correctly hidden, avatar still visible). |

## Guardrail verification (design.md's own checklist)

- `git diff --stat src/app/shared/components/seal-avatar/seal-avatar.component.ts src/styles.css` → no output (empty diffs) — R11, R12.
- `git diff src/app/shared/layout/layout.component.ts` — scoped only to: new `SealAvatarComponent` import, `imports` array reformat, `.avatar` CSS rule removal, and the avatar template swap. The `effect()`/`isTablet`/`isMobile`/`toggleMenu()` tablet auto-collapse block is untouched — R13.
- `git diff src/app/features/admin/admin.component.ts` — the queue-monitor button block and its `auth.isSuperAdmin()` condition are byte-identical before/after; only the constants block, `computed()` signals, and the `<app-chapter-header>` bindings changed — R20.

## Verification

- **Level 1 (mandatory)**: `pnpm run build` → exit `0`. Log saved at build time; no new errors. Pre-existing
  warnings only (bundle budget, optional-chaining lints in unrelated files, `@import` ordering in
  `src/styles.css` — all present before this feature).
- **Level 4 (visual smoke)**: ran `scripts/visual-smoke.mjs` (existing script, mocked backend, prod
  build) against 4 scenarios:
  - `progress/visual_chapter_header_seal_api_refinements_users.png` / `.json` — `/admin?tab=users`:
    header shows "CAPÍTULO I — GESTIÓN DE PERSONAL" / "Usuarios"; sidebar avatar circular, double
    ring, "VS" initials on accent gradient.
  - `progress/visual_chapter_header_seal_api_refinements_years.png` / `.json` — `/admin?tab=years`:
    header shows "CAPÍTULO III — CALENDARIO ACADÉMICO" / "Años lectivos" — confirms the header text
    changes per tab (R18).
  - `progress/visual_chapter_header_seal_api_refinements_institutions.png` / `.json` —
    `/admin?tab=institutions`: header shows "CAPÍTULO VII — INSTITUCIONES DEL SISTEMA" / "Instituciones".
  - `progress/visual_chapter_header_seal_api_refinements_sidebar_collapsed.png` / `.json` — same
    `users` tab with `VISUAL_CLICK=".menu-toggle"` to collapse the sidebar: confirms the seal avatar
    keeps rendering (small, icon-rail only) when `collapsed()` is `true`, matching R29.
  - `progress/visual_chapter_header_seal_api_refinements_mobile.png` / `.json` — `390x844` viewport,
    `/admin?tab=users`: confirms the header renders correctly on a mobile width (sidebar hidden by
    default, `isMobile()` true).
  - `progress/visual_chapter_header_seal_api_refinements_mobile_sidebar.png` / `.json` — same mobile
    viewport with `VISUAL_CLICK=".menu-toggle"` to open the mobile drawer: confirms the seal avatar
    renders correctly (circular, double ring, "VS" initials) in the mobile `mobileOpen()` overlay too.
  - The mock user (`MOCK_USER` in `visual-smoke.mjs`) has no `avatarUrl` and no `avatarPreset`, so only
    the `initials` fallback branch of the sidebar avatar was visually exercised; the `src`/`icon`
    branches (R24, R25) were verified by code inspection of the binding expressions instead (see
    traceability table above) since extending the smoke's fixtures for those two branches was out of
    this feature's stated scope.
- **Level 3 (manual smoke against real backend)**: not run — the only `docker compose` stack currently
  running on this host (`frontend`/`backend`/`postgres`/`redis` containers) bind-mounts
  `/home/rileo/ai-personal/frontend/src` (a different checkout), not this worktree
  (`/home/rileo/ai-personal-worktrees/feature-29-cuaderno-institucional/frontend/src`), so hitting
  `http://localhost` would exercise the old, pre-feature code, not this change. Level 1 + Level 4
  (against this worktree's own production build) are the executed evidence; Level 3 against a real
  backend is deferred to whoever merges/deploys this branch into the checkout the running stack mounts.

## Notes / things flagged, not fixed (out of scope per the leader's brief)

- `design.md` itself flags that 4 of `ADMIN_TAB_EYEBROW_SUFFIX`'s 7 values (`courses`, `permissions`,
  `citation-reasons`, `roster`) are explicitly-accepted interim placeholders, not final copy — implemented
  verbatim as specified, not second-guessed.
- No new scope/bugs discovered beyond what's in the spec.
