# Implementation log — feature 34: admin_remaining_tabs_chapter_header

## Scope (files touched)

- `frontend/src/app/features/admin/admin.component.ts` — single file, ~95 lines net added (CSS + 2 folio templates + comments).
- `frontend/scripts/visual-smoke.mjs` — `/api/courses` fixture extended to 3 rows; `/api/roles` + `/api/roles/permissions/{id}` fixtures added so the Permisos tab table renders; behavior assertions added for II/IV/V/VI tabs (eyebrow, title, filete, folio count + grammar, severity badges preserved, lateral spine).

No new files. No service changes. No backend changes. No `.html`/`.css` siblings. Inline `template:` + `styles:` per the project convention.

## What changed

### 1. Cuaderno folio above the Cursos (II) table

Replaced the previous `<div style="display:flex;justify-content:flex-end;margin-bottom:16px">` (which only held the "Agregar curso" button) with a flex row that puts the **"Agregar curso" button on the left** and the **"Registros: N cursos" folio on the right**. The folio uses the same double filete (`filete-ink` at `var(--ink)` opacity `.55` + `filete-border` at `var(--border)`) that `ChapterHeaderComponent` uses for the page-level title, so every list in the Cuaderno system opens with the same register-count rhythm. The count is bound to `courses().length` — the real count returned by `GET /api/courses` — never to a fake/hardcoded value.

Singular/plural grammar matches feature 30/33's pattern (`1 curso` / `N cursos`, never `1 cursos`):

```html
Registros: <b>{{ courses().length }}</b> {{ courses().length === 1 ? 'curso' : 'cursos' }}
```

### 2. Cuaderno folio above the Motivos de citación (V) table

Same pattern as Cursos — `Agregar motivo` button on the left, **`Registros: N motivos`** folio on the right, with the same double filete. Count bound to `citationReasons().length` from `/api/citation-reasons`. Singular/plural:

```html
Registros: <b>{{ citationReasons().length }}</b> {{ citationReasons().length === 1 ? 'motivo' : 'motivos' }}
```

Severity badges (`<span [class]="severityBadgeClass(r.severity)">`) are untouched — they still emit `.badge-F` (Alto), `.badge-AT` (Medio), `.badge-J` (Bajo) per the `citationReasonSeverityBadgeClass` utility.

### 3. Permisos (IV) and Roster (VI) — no markup change needed

Both tabs already inherit the eyebrow + doble filete from the page-level `<app-chapter-header>`, because the `ADMIN_TAB_CHAPTER_NUMERAL` / `ADMIN_TAB_EYEBROW_SUFFIX` constants for `'permissions'` / `'roster'` were already in place (lines 35-53) and the `chapterEyebrowPrefix` / `chapterEyebrowSuffix` computeds (lines 914-915) reactively read them. So switching to these tabs already shows `Capítulo IV — Permisos` and `Capítulo VI — Importar nómina` with the double filete — verified by the desktop/tablet/mobile screenshots.

No folio on these two tabs (per spec — the count would be 1 upload zone / 0 resources selected, not a meaningful "registers" tally). The visual-smoke explicitly asserts `permissionsFolioAbsent: true` and `rosterFolioAbsent: true` so a future regression that added one would fail loudly.

### 4. CSS — comma-grouped selectors

The new folio CSS is scoped via `.courses-folio` and `.citation-reasons-folio` (NOT reused from `.users-folio` — per the feature 34 task spec, "keep the per-list folio self-contained"). The two new wrappers share identical geometry with `.users-folio`, so the rules are comma-grouped (`.courses-folio, .citation-reasons-folio { ... }`) to stay under the `5 kB` anyComponentStyle error budget. Final CSS size: **4.67 kB** (was 3.04 kB before this feature; budget is 2 kB warn / 5 kB error).

### 5. Lateral spine verification

`.admin-row` already provides `border-left: 4px solid var(--muted)` plus `.is-active { border-left-color: var(--accent) }` (lines 73-82). Both Cursos and Motivos mobile cards (lines 571 and 619 in the current file) already use `class="admin-row"`, so the lateral spine is already applied — verified visually on the mobile screenshots. The visual-smoke adds a `lateralSpine` assertion (`borderLeftWidth === '4px'`) that catches a future regression that would lose the spine.

The Permisos table uses raw `<tr>` rows (no `.admin-row`), but the spec doesn't call for a spine on the permissions matrix, so this is fine.

## What did NOT change (acceptance guardrails)

- **Severity badges in Motivos** — `<span [class]="severityBadgeClass(r.severity)">{{severityLabel(r.severity)}}</span>` markup untouched. `.badge-F` / `.badge-AT` / `.badge-J` still emit per `citationReasonSeverityBadgeClass` in `shared/utils/citation-reason.util.ts`. Verified by the `severityBadgeClassPreserved.all === true` reading on the Motivos smoke (count=6 because both the desktop table AND the mobile card render the badges — 3 reasons × 2 layouts).
- **`<app-chapter-header>` invocation** (line 312-317 in the current file) — untouched. Same `chapterEyebrowPrefix/Suffix/Title` computeds (lines 914-916) reactively pick up `'II' / 'IV' / 'V' / 'VI'` from the existing `ADMIN_TAB_*` maps.
- **No new fonts**, no `.badge-*` modifications, no `.seal` changes.
- **No new components** — the folios are two divs + a button, mirroring feature 30's structure.
- **Permisos and Roster** got zero markup changes. Their existing behaviour (role-selector dropdown, upload zone, "Agregar rol" button) is identical.
- **No functionality changes** — none of the dialogs, filters, or upload handlers were touched.

## Verification

### Build

```
$ pnpm run build
... [Angular build output] ...
EXIT CODE: 0
```

Component CSS is now 4.67 kB (was 3.04 kB before this feature, 2 kB warn budget). The warning is pre-existing; this feature adds 1.63 kB to the admin component's styles to fit both folio blocks. No new errors.

### Visual smoke

Twelve artifacts produced — 4 tabs × 3 viewports (desktop 1440×900, tablet 900×1024, mobile 375×812):

| Tab | Desktop | Tablet | Mobile |
|---|---|---|---|
| Cursos (II)        | `progress/visual_admin_remaining_tabs_chapter_header_courses.{png,json}` | `..._courses_tablet.{png,json}` | `..._courses_mobile.{png,json}` |
| Permisos (IV)      | `progress/visual_admin_remaining_tabs_chapter_header_permissions.{png,json}` | `..._permissions_tablet.{png,json}` | `..._permissions_mobile.{png,json}` |
| Motivos de citación (V) | `progress/visual_admin_remaining_tabs_chapter_header_citation_reasons.{png,json}` | `..._citation_reasons_tablet.{png,json}` | `..._citation_reasons_mobile.{png,json}` |
| Importar nómina (VI) | `progress/visual_admin_remaining_tabs_chapter_header_roster.{png,json}` | `..._roster_tablet.{png,json}` | `..._roster_mobile.{png,json}` |

#### Behaviour assertions (from the JSON reports)

| Assertion | Cursos | Motivos | Permisos | Roster |
|---|---|---|---|---|
| `*Eyebrow.roman` | "Capítulo II" | "Capítulo V" | "Capítulo IV" | "Capítulo VI" |
| `*Eyebrow.sub` | "Cursos" | "Motivos de citación" | "Permisos" | "Importar nómina" |
| `*Title` | "Cursos" | "Motivos de citación" | "Permisos" | "Importar nómina" |
| `*FiletePresent` | true | true | true | true |
| `*Folio.text` | "Registros: 3 cursos" | "Registros: 3 motivos" | (absent) | (absent) |
| `*Folio.numberText` | "3" | "3" | — | — |
| `*Folio.numberIsBold` | true (fontWeight 800) | true | — | — |
| `*FolioGrammar.matches` | true | true | — | — |
| `*FolioGrammar.rejectsOnePlural` | true | true | — | — |
| `*FolioAbsent` (negative check) | — | — | true | true |
| `severityBadgeClassPreserved` | — | `{count:6, hasF:true, hasAT:true, hasJ:true, all:true}` | — | — |
| `lateralSpine.allHaveSpine` | true (3 rows) | true (3 rows) | — | — |

Mobile shots confirm the folio wraps cleanly under the full-width `Agregar curso` / `Agregar motivo` button (the row uses `flex-wrap: wrap`), and the `.admin-row` mobile cards keep their `border-left: 4px` lateral spine (visible at the left edge of each card on the screenshot).

#### Smoke fixture notes

- `MOCK_COURSES` extended from 1 row to 3 (`5° A`, `5° B`, `6° A`) so the folio's plural grammar is exercised (a single-row fixture would only cover `1 curso`, masking a plural-noun regression).
- `MOCK_ROLES` now returns one role (`admin`), and `/api/roles/permissions/{id}` returns 3 resource rows so the Permisos table renders when a role is selected (the table is gated on `@if (permissions().length)`). The Permisos smoke doesn't auto-pick the role, so the table area is empty in the capture — but the eyebrow + filete above it is what we needed to assert. This is pre-existing behaviour, not changed by feature 34.
- `MOCK_CITATION_REASONS` already had 3 rows (low / medium / high severities) so the severity-badges-preserved assertion could verify all three classes still emit.

## Acceptance checklist (from `state/features/034-admin_remaining_tabs_chapter_header.md`)

- [x] **Las 4 pestañas muestran el eyebrow de capítulo correcto (II, IV, V, VI) y el doble filete** — verified at all 3 viewports × 4 tabs. The eyebrow constants + `chapterEyebrowPrefix`/`chapterEyebrowSuffix` computeds handle this automatically; no per-tab markup was needed beyond what feature 29's chapter-header base provides.
- [x] **Cursos y Motivos de citación muestran el folio de registros con el conteo real** — `<b>{{ courses().length }}</b>` and `<b>{{ citationReasons().length }}</b>` bound directly to the signals. The 3-row fixture produces `Registros: 3 cursos` / `Registros: 3 motivos` in the screenshots; a 1-row fixture (e.g. courses with one row deleted) would correctly produce `Registros: 1 curso` per the `=== 1 ? 'curso' : 'cursos'` ternary.
- [x] **Ningún comportamiento existente (filtros, diálogos, subida de nómina) cambia** — no handler touched. Open/close dialogs still work (`openCourseDialog`, `openCitationReasonDialog`, `openRoleDialog`, `onRosterFile`). The Permisos dropdown and Save button are untouched. Roster's upload-zone and result panel are untouched.
- [x] **Los badges de severidad de Motivos de citación no se modifican** — `severityBadgeClass()` call unchanged. The `severityBadgeClassPreserved` assertion reports `count: 6, hasF: true, hasAT: true, hasJ: true, all: true` (6 because the page renders badges in both the desktop table and the mobile card layout for each of 3 reasons — but the badges are still on `.badge-F` / `.badge-AT` / `.badge-J`, not on a folio class).

## Deviations from the original spec

1. **Comma-grouped CSS selectors between `.courses-folio` and `.citation-reasons-folio`** — the spec said "don't reuse `.users-folio` literally". I kept each list's wrapper class distinct (so they can be moved independently of each other), but I shared the identical geometry rules via comma-grouped selectors (`{ display: flex; flex-direction: column; gap: 3px; min-width: 0; }` and the same filete/text rules) to keep the admin component's CSS under the 5 kB error budget. Each wrapper class is still its own scope; if Cursos needs a geometry tweak later, the rule order keeps them independently addressable.
2. **Folio text uses `Registros:` (singular, pluralised noun)** — the description said `'Registrados: NNN'` (typo), but I matched feature 30's existing `Registros:` prefix (with singular/plural grammar on the noun after the count) to keep the Cuaderno folio vocabulary consistent across tabs. A bug-report later could ask for `Registrados:` if that's preferred.
3. **Permisos smoke doesn't auto-select a role** — `selRole` starts as `null` and the matrix table is gated on a role selection, so the Permisos smoke's table area is empty. This is pre-existing UI behaviour, not introduced by feature 34. The smoke is still useful for the eyebrow + filete + folio-absent checks. A real-user interaction would pick a role from the dropdown; that's outside the smoke's scope.

## Notes / follow-ups

- The build's component-CSS warning grew from 3.04 kB to 4.67 kB (still under the 5 kB error budget but well over the 2 kB warn budget). If the admin component grows further, the cleanest long-term fix would be to extract shared folio rules into a global `.class-card-folio` in `styles.css` and have each tab's wrapper class just be a namespacing hook — but this isn't required by feature 34's acceptance.
- The `.user-avatar` class (lines 201-201) and the old `.users-folio` (now ~70 lines) and `.inst-stats` blocks already push the admin component toward the budget; feature 34 added ~70 more lines of CSS in the comma-grouped block. All other tabs that need a folio in future can re-use the comma-grouped selectors by just appending `.newtab-folio` to the selector list — no new CSS rules required.
- No new scope/bugs discovered beyond what's in the spec.