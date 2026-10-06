# Tasks — Citations listing page (roster + pills + actions column)

- [x] T1 (R1, R2) Add `Citation` and `CitationRosterRow` interfaces to `core/models/index.ts`.
- [x] T2 (R5) Add a top-level `citations` node to `nav-items.ts`'s `MODULE_TREE` and a matching
  entry to `MODULE_KEYS`.
- [x] T3 (R4) Update `nav-items.ts`'s `/inspectors/citations` subnav row: drop `placeholder: true`,
  add `moduleKey: 'citations'`.
- [x] T4 (R3) Replace `app.routes.ts`'s `inspectors/citations` placeholder entry with a real
  `loadComponent` route (`canActivate: [moduleGuard]`, `data: { module: 'citations' }`).
- [x] T5 (R6, R7, R8, R9, R10) Scaffold `CitationsComponent` (`features/citations/citations.component.ts`):
  filter bar (`app-quarter-selector` + course `mat-select`), `ngOnInit` fetching `GET /api/courses`,
  course-change handler fetching `GET /api/citations?course_id=...&academic_year_id=...` with loading
  spinner / no-course empty-state / error notification + empty-roster fallback.
- [x] T6 (R11, R12) Add the `.manual-search`-pattern header (student count + name filter) above the
  data-table, filtering `roster()` client-side.
- [x] T7 (R13, R14, R15, R16) Implement quarter-scoping: apply the default quarter's date range on
  init when available, update it on `app-quarter-selector`'s `quarterChange`, and implement
  `scopedCitations(row)` filtering each row's citations by `dateFrom` within `[scopeStart, scopeEnd]`
  (or all citations when no scope is set).
- [x] T8 (R17, R18, R19) Render the `.data-table` (Estudiante / Citaciones el: / Acciones columns),
  one row per `CitationRosterRow`, with an em dash for rows whose scoped citations are empty and one
  pending/closed-styled pill (per the design's `pillLabel`/`pillStyle`) per scoped citation otherwise.
- [x] T9 (R20, R23) Implement the shared `openCitationEditor(row, citation?)` stub (info toast, no
  HTTP call) and wire both the pill click handler and the "add citation" icon-button to it.
- [x] T10 (R21, R22) Implement `resolveTargetCitation(row)` (first `pending`, else `citations[0]`,
  else `null`).
- [x] T11 (R24, R25, R26) Implement the WhatsApp icon-button: render only when `whatsappLink` is set
  and a target citation resolves; on click, open a templated message for a `pending` target or the
  bare link for a `closed` one.
- [x] T12 (R27, R28, R29, R30) Implement the delete icon-button: render only when a target citation
  resolves; on click, open `ConfirmDialogComponent`; on confirm, `DELETE /api/citations/:id` and
  reload the roster on success, or notify an error and leave the roster untouched on failure.
- [x] T13 (R31, R32, R33) Add the `mat-menu` "more actions" trigger with a single "Ver historial
  completo" item; create `CitationHistoryDialogComponent`
  (`features/citations/citation-history-dialog.component.ts`) rendering the row's full, unscoped
  `citations` array (reusing already-loaded data, no new HTTP call) with an empty-state for zero
  citations.
- [x] T14 (R34) Run `pnpm run build` and confirm it exits `0` with zero new errors.
- [x] T15 (R35) Perform the manual Level 3 smoke test described in `requirements.md`'s R35 against
  `docker compose up -d --build frontend`, and record the steps/outcome in
  `progress/impl_citations_listing_page.md`.
