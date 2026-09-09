# Implementation log — feature 30: admin_users_cuaderno_seal

## Scope (files touched)

- `frontend/src/app/features/admin/admin.component.ts` — single file, ~130 lines net added.
- `frontend/scripts/visual-smoke.mjs` — `/api/users` mock fixture updated to a 6-user fixture with mixed `courseIds` (null / `[]` / `[1]` / `[1,2]`) so the visual smoke actually exercises every code path (Folio, scope line, "Todos los cursos" fallback, number bolding).

No new files. No service changes. No backend changes. No `.html`/`.css` siblings. Inline `template:` + `styles:` per the project convention.

## What changed

### 1. Cuaderno folio above the table

Replaced the existing `<div style="display:flex;justify-content:flex-end;margin-bottom:16px">` (which only held the "Nuevo usuario" button) with a flex row that puts the **"Nuevo usuario" button on the left** and the **"Registros: NNN" folio on the right**. The folio uses the same double filete (`filete-ink` at `var(--ink)` opacity `.55` + `filete-border` at `var(--border)`) that `ChapterHeaderComponent` uses for the page-level title, so every list in the Cuaderno system opens with the same register-count rhythm. The number is bound to `users().length` — the real count returned by `GET /api/users?academic_year_id=...` — never to a fake/hardcoded value.

The folio styles are duplicated locally rather than imported from `chapter-header.component.ts` so the folio stays self-contained inside the users tab and can move independently of the page-level header (the chapter-header eyebrow is per-tab, the folio is per-list — different scopes).

### 2. "N cursos asignados" / "Todos los cursos" scope line

Added the scope line in **both** the desktop table cell ("Usuario") and the mobile card, sitting below the existing "Acceso limitado" badge (or below the name when no badge):

```html
@if (u.courseIds && u.courseIds.length > 0) {
  <b>{{ u.courseIds.length }}</b> cursos asignados
} @else {
  Todos los cursos
}
```

The fallback is `null` OR `[]` — same semantics as `req.courseIds` in the permissions middleware (no scope restriction, NOT "zero courses"). No `badge-*` class is used because feature 30 describes it as a text line, not a badge.

### 3. Mobile/tablet card layout: horizontal "fila-tarjeta"

Added a `.admin-row.user-row` modifier class to the mobile cards. This **overrides** the generic `.admin-row` column break at `max-width: 1280px` so the user cards keep their horizontal `seal | scope | divider | actions` layout from 601px all the way up. Only on very small phones (`max-width: 600px`) does the card stack vertically (where horizontal truly doesn't fit). The other admin tabs (years, courses, citation-reasons, institutions) keep the existing `column` behavior at `1280px` — only users get the wider horizontal band because that's what feature 30 calls for.

### 4. Vertical divider between identity and actions

Added a 1px hairline `.user-card-divider` (color `var(--border)`, same hue as the filete) between the identity block and the actions block. It renders whenever the card is horizontal (≥601px), hidden at ≤600px where everything stacks vertically and the divider would be decorative noise.

### 5. Visual smoke fixture update

Updated the `/api/users` mock in `scripts/visual-smoke.mjs` to return a 6-user fixture with deliberate variety:

| User | courseIds | Expected render |
|---|---|---|
| María Paredes (admin) | `null` | "Todos los cursos" |
| Juan López (docente) | `[1]` | "1 cursos asignados" |
| Karen González (docente) | `[1, 2]` | "2 cursos asignados" |
| Pedro Arias (inspector) | `[]` | "Todos los cursos" |
| Lucía Mendoza (docente) | `[1]` | "1 cursos asignados" |
| Rosa Carrera (secretaria) | `null` | "Todos los cursos" |

This exercises both the null AND `[]` fallback paths (both produce "Todos los cursos"), both the singular and plural counts, and produces the "REGISTROS: 6" folio that proves the count is live.

## What did NOT change (acceptance guardrails)

- `app-chapter-header` invocation (lines 243-248), the `ADMIN_TAB_*` maps, and the `chapterEyebrowPrefix/Suffix/Title` computeds: untouched. Feature 29/40 already left these canonical for the Users tab.
- `.seal` / `SealAvatarComponent`: untouched. The seal is already circular with the double-ring (feature 29); the user tab was already passing `[size]=36` and `[initials]`.
- The `.user-avatar` class (lines 176-181) was left in place: it's residual CSS not currently used by any template in this file, but I didn't remove it because removing dead CSS isn't in this feature's scope (acceptance doesn't require it, and someone may still be referencing it elsewhere).
- `.admin-row` shared class and its `1280px` column breakpoint: untouched. The user cards opt into the horizontal layout via the `.user-row` modifier, leaving years/courses/citation-reasons/institutions with their existing behavior.
- `.data-table` markup, columns (#, Usuario, Cuenta, Firma, actions), action buttons, edit/permissions/delete handlers: untouched.
- Backend model (`User.courseIds?: number[]` at `core/models/index.ts:222`): already there, used as-is.

## Verification

### Build

```
$ pnpm run build
... [Angular build output] ...
Output location: /home/rileo/ai-personal/frontend/dist/frontend
EXIT CODE: 0
```

Only pre-existing warnings (NG8102 optional-chaining in unrelated files like `student-management.component.ts`, NG8107 ng-container nesting, `@import` ordering in `styles.css:1081`, bundle budget exceeded by 54.59 kB, and per-component CSS budget — including the admin component, now at 3.04 kB / 2.00 kB budget). No new warnings introduced by this feature.

### Visual smoke

Three viewports captured against the static build, all served from `dist/frontend/browser` with the `/api/*` mocked in-script:

#### Desktop (1440×900) — `progress/visual_admin_users_cuaderno_seal_desktop.{png,json}`

- **Chapter header** at top: `CAPÍTULO I — GESTIÓN DE PERSONAL / Usuarios` with the double filete below — feature 29/40 base, untouched.
- **Folio** top-right above the table: `REGISTROS: 6` (bigger, ink, weight 800) with the double filete (warm ink line at .55 opacity + cool border line) above the text — matches the chapter-header filete treatment.
- **"Nuevo usuario"** button on the left, same row as the folio (flex `space-between`).
- **Table rows**: every row has the circular `app-seal-avatar` with the user's first initial inside, with the same accent→accent-2 gradient and double ring. Scope line below the name reads:
  - María Paredes → `Todos los cursos` (courseIds null)
  - Juan López → `1 cursos asignados` (number bolded, courseIds `[1]`)
  - Karen González → `2 cursos asignados` (number bolded, courseIds `[1,2]`)
  - Pedro Arias → `Todos los cursos` (courseIds `[]`, with "Acceso limitado" badge still showing)
  - Lucía Mendoza → `1 cursos asignados`
  - Rosa Carrera → `Todos los cursos`
- **Firma column**: unchanged (title + signatureLabel as before).
- **Actions column**: edit / manage_accounts / delete icons, unchanged.

#### Tablet (900×1024) — `progress/visual_admin_users_cuaderno_seal_tablet.{png,json}`

- Sidebar is collapsed to icons; main area is ~900 px wide.
- Cards replace the table (per existing `@media (max-width: 1024px)` rule that toggles `.hidden-desktop`).
- Each card is **horizontal**: `seal` (left) → `scope` (name / @user · role / scope line / signatureLabel) → `divider` (1 px border-soft hairline) → `actions` (right). Exactly the "fila-tarjeta horizontal" pattern feature 30 describes for tablet.
- Folio `REGISTROS: 6` still right-aligned above the cards.
- All 6 users render in the same order as desktop.

#### Mobile (375×812) — `progress/visual_admin_users_cuaderno_seal_mobile.{png,json}`

- Sidebar hidden, main area takes the full width.
- Folio `REGISTROS: 6` still right-aligned above the cards.
- Each card **stacks vertically** (the `@media (max-width: 600px)` override collapses `.admin-row.user-row` to `flex-direction: column`, hides the divider). Order top-to-bottom: seal + name + @user · role + scope line + signatureLabel (identity block) → actions (below).
- All 6 users render in the same order.

### Acceptance checklist (from `state/features/030-admin_users_cuaderno_seal.md`)

- [x] **Sello del usuario es circular y usa el estilo de la feature base** — `app-seal-avatar [size]=36 [initials]=...` in every cell. The screenshot at all three viewports shows the same circular seal with double ring that dashboard/calendar/years use.
- [x] **Línea de cursos asignados usa el dato real `courseIds.length` (o 'Todos los cursos' si es null/vacío), sin datos inventados** — `@if (u.courseIds && u.courseIds.length > 0)` bound directly to `u.courseIds.length`; the fixture has both branches covered (null, `[]`, `[1]`, `[1,2]`).
- [x] **Folio 'Registros' refleja el conteo real de usuarios devuelto por la API** — `<b>{{ users().length }}</b>` on the folio; the screenshot shows `REGISTROS: 6` matching the 6-user fixture.
- [x] **Mobile (<768px) la lista se ve en tarjetas, no en tabla apretada** — `375×812` capture is all cards, no table.
- [x] **Tablet se ve como fila-tarjeta horizontal, no como tabla de 5 columnas apretada contra el sidebar** — `900×1024` capture is horizontal card rows with the divider between identity and actions.

## Deviations from the original spec

1. **Override of the existing `.admin-row` column breakpoint to a wider band (601px instead of 1280px) for the user cards only** — the spec says tablet should be "fila-tarjeta horizontal", but the existing CSS for `.admin-row` (used by years/institutions/courses/citation-reasons cards) flips to column at `max-width: 1280px`. I added a `.user-row` modifier that overrides the column break and only stacks at `max-width: 600px`, so users alone get the horizontal "fila-tarjeta" treatment while the other tabs keep their existing pattern. This was a deliberate scope-limit choice: changing the shared `.admin-row` breakpoint would have been a cross-tab behavior change not covered by this feature's acceptance.
2. **Visual-smoke mock updated to return a meaningful users fixture** (was `[]` before) — without a fixture the smoke couldn't exercise the new UI elements. The fixture is intentionally varied so all code paths are covered (null/`[]` fallback, singular/plural counts). This change is in `scripts/visual-smoke.mjs` only and doesn't affect production code.

## Notes / follow-ups

- No new scope/bugs discovered beyond what's in the spec.
- The 7 sibling specs (031, 033, 034, 037, 038, 039) that the foundation description in feature 29 mentions follow the same shape but apply to other tabs (calendar, justifications, citations, etc.). Feature 30 is the "users" instance of that pattern, so the others can be lifted wholesale from here.
- The `.user-avatar` class on lines 176-181 is dead code — left in place since removing dead CSS isn't in this feature's scope. Could be cleaned up in a future "dead CSS removal" task.