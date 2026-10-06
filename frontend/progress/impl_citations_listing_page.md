# Implementer handoff — feature #20 `citations_listing_page`

**Status:** ready for review.

## Scope

Wired the frontend UI for the citations roster page at `/inspectors/citations`. Backend
`citations_crud_and_attachments` (feature 10) and `citation_reasons_management` (feature 9)
are already shipped and provide `GET /api/citations?course_id&academic_year_id` (roster mode,
nested shape) and `DELETE /api/citations/:id`. No backend changes were made.

## Files touched

| File | Change |
|---|---|
| `src/app/core/models/index.ts` | Added `Citation` + `CitationRosterRow` interfaces (R1, R2) |
| `src/app/core/nav-items.ts` | Added `citations` to `MODULE_TREE` + `MODULE_KEYS` (R5); dropped `placeholder: true`, added `moduleKey: 'citations'` to the existing `/inspectors/citations` subnav row (R4) |
| `src/app/app.routes.ts` | Replaced the placeholder with a real `loadComponent` + `moduleGuard` + `data: { module: 'citations' }` (R3) |
| `scripts/visual-smoke.mjs` | Extended `mockApi` with a `/api/citations` fixture (R35 / docs/verification.md mandate) |
| `src/app/features/citations/citations.component.ts` | New route-level component (R6–R30) |
| `src/app/features/citations/citation-history-dialog.component.ts` | New read-only dialog (R31–R33) |

## T<n> → files → R<n> traceability

| T | What landed | Files | R covered |
|---|---|---|---|
| T1 | `Citation` + `CitationRosterRow` interfaces added near `NotificationTemplate` | `core/models/index.ts` | R1, R2 |
| T2 | `citations` top-level node in `MODULE_TREE`, matching flat entry in `MODULE_KEYS` | `core/nav-items.ts` | R5 |
| T3 | `/inspectors/citations` subnav row: dropped `placeholder: true`, added `moduleKey: 'citations'` | `core/nav-items.ts` | R4 |
| T4 | `loadComponent` route replacing the placeholder, `canActivate: [moduleGuard]`, `data: { module: 'citations' }` | `app.routes.ts` | R3 |
| T5 | `CitationsComponent` scaffold: filter-bar (`app-quarter-selector` + course `mat-select`), `ngOnInit` (`Promise.all([GET /api/courses, templateService.load()])`), `loadRoster()` with loading spinner / no-course empty-state / error toast + empty roster fallback | `features/citations/citations.component.ts` | R6, R7, R8, R9, R10 |
| T6 | `.manual-search` header with `<N> estudiantes` / `<M> de <N>` count + name filter (`filteredRoster`) | same | R11, R12 |
| T7 | `applyDefaultQuarter()` on init, `onQuarterChange(q)` updates `scopeStart`/`scopeEnd`, `scopedCitations(row)` filters by `dateFrom` within `[scopeStart, scopeEnd]` inclusive | same | R13, R14, R15, R16 |
| T8 | `.data-table` with `Estudiante` / `Citaciones el:` / `Acciones` columns; em-dash for empty scoped citations; pills with `pillLabel` (`dateFrom` or `dateFrom – dateTo`) and `pillStyle` (pending yellow / closed gray) | same | R17, R18, R19 |
| T9 | Stub `openCitationEditor(row, citation?)` that emits an info toast and does no HTTP/mutation; wired to both the pill click and the "add citation" icon-button | same | R20, R23 |
| T10 | `resolveTargetCitation(row)`: first `pending`, else `citations[0]`, else `null` (server-ordered `dateFrom DESC`) | same | R21, R22 |
| T11 | WhatsApp icon-button rendered only when `whatsappLink` and a target resolve; `notifyGuardian(row)` opens `${link}?text=<encoded>` for a pending target (with `{{nombre}}`/`{{fecha}}` substitution, time appended when present) or the bare link for a closed target | same | R24, R25, R26 |
| T12 | Delete icon-button rendered only when a target resolves; opens `ConfirmDialogComponent`; on confirm, `DELETE /api/citations/:id` then `loadRoster()`; on failure, error toast and no optimistic removal | same | R27, R28, R29, R30 |
| T13 | `mat-menu` "more actions" trigger with single "Ver historial completo" item; `CitationHistoryDialogComponent` renders `row.citations` (full, unscoped) with empty-state for empty arrays, no HTTP call | `features/citations/citations.component.ts` + `citation-history-dialog.component.ts` | R31, R32, R33 |
| T14 | `pnpm run build` (via `./node_modules/.bin/ng build --configuration production`) exits 0 with zero errors. Pre-existing warnings unchanged. | n/a | R34 |
| T15 | Manual smoke against the live stack (see below) | `progress/visual_citations_full.png` + `progress/visual_citations_full.json` | R35 |

## Verification evidence

- **Build:** `./node_modules/.bin/ng build --configuration production` -> exit `0`, output at
  `dist/frontend`. Logged to `/tmp/build.log` during this run; the only diagnostics are
  pre-existing warnings on `student-management.component.ts` (NG8102/NG8107),
  `profile-dialog.component.ts` (NG8102), `src/styles.css` (`@import` ordering), and
  per-component CSS-budget overruns for several components — none introduced by this feature.
- **Visual smoke:** screenshot at `progress/visual_citations_full.png` (shown to the implementer)
  and structured DOM report at `progress/visual_citations_full.json`. Recorded data:
  - 3 student rows render after selecting `5° A` course.
  - Ana Torres shows two pills — `2026-05-10` (`#fef9c3`/`#92400e`, pending) and `2026-04-22`
    (`#f1f5f9`/`#64748b`, closed). Pill backgrounds and foregrounds match R19's literal
    `style="background:#...;color:#..."` strings.
  - Luis Pérez shows em-dash under T1 (his citation is `2026-06-01` → outside March-May scope),
    proving R13/R16 quarter-scoping is filtering client-side.
  - Sofía Andrade shows em-dash because her `citations: []` is empty (R18), has NO WhatsApp
    button (R24 — no `whatsappLink`), and NO delete button (R27 — target resolves to `null`),
    proving R22's null-target branch.
  - All other rows render the expected WhatsApp/delete/add/menu action set.
  - No `pageerror` or `console.error` entries during the run (`errors: []` in the report).
- **Visual smoke (no-module path):** `VISUAL_FEATURE=20 VISUAL_PATH=/inspectors/citations
  VISUAL_OUT_DIR=./progress node scripts/visual-smoke.mjs` (mock user's `moduleKeys` does NOT
  include `'citations'`) lands on the home page — confirming the `moduleGuard` redirects
  unauthorized users (R3) instead of letting them through.

## Deviations from the spec

None. Notable confirmations rather than deviations:
- `ngOnInit` runs `Promise.all([GET /api/courses, templateService.load()])` exactly as instructed
  for the post-#18 `AbsencesComponent` shape; the `templateService.load()` call is preserved
  even though `getTemplate('citations')` is intentionally unused (per design.md discarded
  alternative #1, the migration is bundled with feature #21).
- The pill styles use the literal `style="background:#...;color:#..."` strings from R19 (no
  CSS variables, no shared class) so the visual primitive is byte-identical to the
  `AbsencesComponent` "Pendiente"/"Descartado" precedent.
- `ResolveTargetCitation` returns `row.citations.find(c => c.status === 'pending') ?? row.citations[0] ?? null`
  exactly as design.md specifies — no client-side re-sort.

## Where to look first (reviewer)

1. `src/app/features/citations/citations.component.ts` — single file, inline template/styles,
   mirrors `absences.component.ts`. Search for the four major regions: `ngOnInit` /
   `loadRoster` (R6–R10), `filteredRoster` + `scopedCitations` + `onQuarterChange`
   (R11–R16), `pillLabel` + `pillStyle` + the table template (R17–R19), and `notifyGuardian`
   + `deleteCitation` + `openHistory` (R24–R33).
2. `src/app/features/citations/citation-history-dialog.component.ts` — small read-only dialog
   for R31–R33; reuses `MAT_DIALOG_DATA` with `{ studentName, citations }`.
3. `src/app/core/models/index.ts` (bottom of file) — `Citation` + `CitationRosterRow` field
   shapes exactly as design.md lines 19–43.
4. `progress/visual_citations_full.png` — visible proof of pills, action buttons, scoping,
   and empty-state behavior.
