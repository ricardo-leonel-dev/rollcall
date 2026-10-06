# Feature 33 — admin_institutions_cuaderno_seal (implementation log)

## What changed

### Frontend models — `src/app/core/models/index.ts`
- Added `InstitutionStats` interface (`students`, `courses`, `users`) matching the
  shape backend service `institution.service.ts:InstitutionStats` already returns
  via `findAll()` (backend feature #17). The fields are populated server-side by
  `attachStats()` and shipped on every `GET /api/institutions` response.
- Made the new field optional (`stats?: InstitutionStats`) on `Institution` so
  every existing call site stays type-safe — only the admin Instituciones tab
  actually reads it.

### Admin screen — `src/app/features/admin/admin.component.ts`
- Replaced the previous "logo + name + actions in a row" Instituciones tab with a
  ficha-style tarjeta that follows the same Cuaderno rhythm feature 30 introduced
  for admin Usuarios:
  - **Sello circular** via `app-seal-avatar`: `logoUrl` real when present,
    initials of `inst.name` otherwise (per spec — replacing the old `corporate_fare`
    icon fallback). Same double-ring component (`border 2px + outline 1.5px`)
    the rest of the system uses.
  - **Identity block**: institution name + stats line directly below.
  - **Stats line** (the new bit): `"<b>N</b> estudiantes · <b>N</b> cursos · <b>N</b> usuarios"`
    driven by `inst.stats`. Singular/plural grammar matches feature 30's pattern
    (`1 estudiante` / `N estudiantes`, never `1 estudiantes`). Separator dots
    sit on `--border` with `margin: 0 6px` so they read as punctuation, not data.
    When the backend hasn't returned `stats` (e.g. signature drift in a future
    refactor), the row shows an italic muted `Sin estadísticas disponibles`
    placeholder instead of fabricating numbers — this matches the "nunca datos
    de ejemplo" acceptance criterion.
  - **Vertical divider** between identity and actions blocks, hidden below
    600px via the same media query pattern feature 30 uses for `user-card-divider`.
  - **Actions block**: preserved verbatim — color pickers, upload logo, edit
    button, active/inactive badge, deactivate button. No functionality changed.
- CSS additions are scoped (`.admin-row.inst-row`, `.inst-card-divider`,
  `.inst-stats`, `.inst-stats-sep`, `.inst-stats-empty`) and follow the
  `user-row` precedent — every list in the Cuaderno system opens with the same
  horizontal tarjeta rhythm, so the eye doesn't have to re-learn the layout
  between tabs.
- Eyebrow `"Capítulo VII — Instituciones del sistema"` is wired through the
  existing `ADMIN_TAB_CHAPTER_NUMERAL['institutions']` / `ADMIN_TAB_EYEBROW_SUFFIX`
  constants and the page-level `<app-chapter-header>` — no inline eyebrow markup,
  no per-tab duplication of the double filete.
- **No INS-001 folio** was added (acceptance criterion #4). The previous
  right-aligned "Agregar institución" button is the only thing on that side of
  the row; the stats line replaces what could have been a folio without
  inventing a code.

### Visual smoke — `scripts/visual-smoke.mjs`
- Extended the `/api/institutions` mock fixture to return two institutions with
  realistic `stats` payloads (one with multi-digit counts to exercise the plural
  grammar, one with all-1 counts to exercise the singular grammar).
- Added `VISUAL_ROLE` env-var override on `MOCK_USER.roleName` so the
  institutions tab (which is gated on `auth.isSuperAdmin()`) renders in the
  smoke; default stays `'admin'` so other smokes don't break.
- Added behavior assertions (not structural node counts) for the Cuaderno
  Instituciones tab, matching the per-tab pattern from feature 30:
  - `institutionEyebrow`: reads "Capítulo VII" + "Instituciones del sistema"
    + "—" separator.
  - `institutionTitle`: reads "Instituciones".
  - `institutionFiletePresent`: both filete rules rendered.
  - `institutionRowCount`: number of `.admin-row.inst-row` rows.
  - `institutionStatsLines[]`: per-row text, bold count, plural grammar match,
    separator count. A buggy `inst.stats` wiring would fail one of these even
    if the page rendered.
  - `institutionSeals[]` / `institutionSealsAllCircular`: every seal has
    `border-radius: 50%`, double-ring (`border-top-width: 2px` + `outline-style: solid`).
  - `institutionCardLayout`: horizontal `flex-direction: row` on desktop,
    vertical on mobile (<600px).
  - `institutionFolioAbsent`: explicitly checks there's no folio element (so a
    later regression that adds INS-001 or similar would fail loudly).

## Verification

### Build
```
pnpm exec ng build --configuration development
→ Application bundle generation complete. [7.925 seconds]
→ Initial total | 2.07 MB
```
No new errors. The pre-existing warnings in student components and styles.css
are unrelated to this change.

### Visual smoke
Desktop (1440x900, superadmin, /admin?tab=institutions):
- Eyebrow: `Capítulo VII—Instituciones del sistema` ✅
- Title: `Instituciones` ✅
- Double filete present ✅
- 2 institution rows render ✅
- Stats lines: `"248 estudiantes · 12 cursos · 34 usuarios"` and
  `"1 estudiante · 1 curso · 1 usuario"` — bold values, 2 separators, correct
  singular/plural ✅
- Both seals: `border-radius: 50%`, double ring (border 2px + outline solid) ✅
- Card layout: horizontal row with divider ✅
- No folio ✅

Mobile (414x800, superadmin, /admin?tab=institutions):
- Same stats render correctly ✅
- Card layout switches to vertical column (media query @max-width: 600px) ✅

## Out of scope (per spec)

- No folio or INS-001 code (acceptance #4).
- No changes to the "Agregar institución" button — only its visual position
  (now flows naturally inside the tarjeta).
- No new fonts, no `.badge-F/.badge-AT/.badge-J` touches.
- The stats line intentionally does not link to per-institution drill-downs;
  that would be a follow-up feature, not part of this acceptance.