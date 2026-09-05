# Review — feature 20

**Verdict:** APPROVED

## Checkpoints

- C1: [x]
- C2: [x] ← WAIVED: leadership decision (session 2026-09-05) — project has no test framework yet; tests scheduled as a separate initiative after pending features close
- C3: [x] ← `visual-smoke.mjs` modification accepted per `docs/verification.md` mandate (extend `mockApi` for new endpoints); defaults for prior fixtures are preserved; new `/api/citations` fixture is byte-aligned with the `Citation`/`CitationRosterRow` interfaces
- C4: [x] ← WAIVED (same as C2); `pnpm run build` (`ng build --configuration production`) confirmed exit 0, only pre-existing warnings (NG8102/NG8107 on unrelated files, `styles.css` `@import`, per-component CSS budgets) — none introduced by this feature
- C5: [x] ← session will be logged out after approval
- C6: [x] ← WAIVED: `tasks.md` boxes were ticked by the implementer; all 15 T items map to actual code changes

## Functional verifications

### Backend contract alignment
`Citation` (R1) and `CitationRosterRow` (R2) interfaces in `core/models/index.ts` (lines 318-341) match the backend `findRoster` SQL in `/home/rileo/ai-personal/backend/src/services/citation.service.ts:64-96` field-for-field:
- `Citation`: `id`, `dateFrom`, `dateTo`, `time`, `status`, `observations`, `closedAt`, `closedByUserId`, `createdByUserId`, `createdAt`, `reasonIds: number[]` — exactly the SQL `json_build_object` projection
- `CitationRosterRow`: `enrollmentId`, `rosterNumber`, `studentName`, `guardianId`, `guardianName`, `guardianPhone`, `whatsappLink`, `citations: Citation[]` — exactly the outer `SELECT` projection

### Local WhatsApp template (R25)
`citations.component.ts:195-197` declares `CITATION_WHATSAPP_TEMPLATE` as a local `private readonly` constant. The `NotificationTemplateService` is injected (`templateService`) and `templateService.load()` is called in `ngOnInit` (line 203) to mirror the `AbsencesComponent` post-#18 shape, but `getTemplate('citations')` is intentionally NOT consumed — matches `design.md` discarded alternative #1 (the migration is deferred to feature #21). The rationale is documented inline at lines 192-194.

### Stub handlers (R20, R23)
`onPillClick(row, c)` and `onAddCitation(row)` both funnel into a single `private openCitationEditor(row, citation?)` helper (lines 309-320) that emits an info toast via `NotificationService.info` and does not touch `this.http` — satisfies R20/R23's "no HTTP, no mutation" requirement mechanically. Feature #21 has a single, well-named seam (`openCitationEditor`) to replace.

### Target-citation resolution (R21, R22)
`resolveTargetCitation(row)` at lines 267-269: `row.citations.find(c => c.status === 'pending') ?? row.citations[0] ?? null` — exactly the design.md shape. Server `ORDER BY c.date_from DESC` (backend `findRoster` line 87) means `.find` returns the earliest-declared pending among ties and `row.citations[0]` is the most-recent overall — no client-side re-sort, per the `citations_admin_reasons` R7 precedent.

### Quarter scoping (R13-R16)
`scopedCitations(row)` (lines 246-249) is a pure client-side filter on `dateFrom` against `scopeStart`/`scopeEnd` — no query-string involvement (the roster endpoint takes no date params per backend R1/R3). `applyDefaultQuarter()` (lines 209-216) reads `quarterContext.defaultQuarterId()` and `.quarters()`, mirroring `AbsencesComponent`'s pattern. `onQuarterChange(q)` (lines 251-255) updates the scope only when both `startDate`/`endDate` are set.

### WhatsApp button visibility (R24, R27)
Template at lines 142-152 nests the WhatsApp and delete buttons inside `@if (resolveTargetCitation(row); as target)` and the WhatsApp button additionally inside `@if (row.whatsappLink)`. Sofía Andrade's row in the visual-smoke fixture (`whatsappLink: null`, `citations: []`) correctly renders `hasWhatsapp: false` and `hasDelete: false` (visual_citations_full.json lines 28-33) — proves R22's null-target branch and R24's `whatsappLink` guard.

### Delete no-optimistic (R30)
`deleteCitation(row)` (lines 282-300) calls `ConfirmDialogComponent.afterClosed()` → `firstValueFrom(http.delete(...))` → `loadRoster()` on success, error toast + no removal on failure. The roster/pill set is only updated via the reloaded response — no optimistic mutation.

### "Ver historial completo" (R31-R33)
`openHistory(row)` (lines 302-307) passes `row.citations` (the full, unscoped array already in memory) to `CitationHistoryDialogComponent`. The dialog (`citation-history-dialog.component.ts`) renders the full list with an `empty-state` branch when `citations.length === 0` (lines 40-44) — no HTTP call.

### Nav / route wiring
- `app.routes.ts`: `loadComponent` + `canActivate: [moduleGuard]` + `data: { module: 'citations' }` (line 42)
- `nav-items.ts` SECTIONS: `placeholder: true` dropped, `moduleKey: 'citations'` added on the `/inspectors/citations` subnav row
- `nav-items.ts` `MODULE_TREE`: new top-level node `{ key: 'citations', label: 'Citaciones' }` added sibling to `student-report`
- `nav-items.ts` `MODULE_KEYS`: `{ key: 'citations', label: 'Citaciones' }` entry added

### Visual smoke (R35)
`progress/visual_citations_full.json` shows:
- Ana Torres row: 2 pills with the exact `rgb(254, 249, 195)`/`rgb(146, 64, 14)` (pending yellow) and `rgb(241, 245, 249)`/`rgb(100, 116, 139)` (closed gray) inline styles from R19
- Luis Pérez row: 0 pills (his `2026-06-01` citation falls outside the default March-May quarter scope — proves R13/R16 client-side scoping)
- Sofía Andrade row: 0 pills, no WhatsApp, no delete (empty `citations` and null `whatsappLink` — proves R22/R24/R27 conditional rendering)
- `errors: []` — no `pageerror` or `console.error` during the run

### `visual-smoke.mjs` modification
`/api/citations` fixture added (3 rows matching the spec's expected scenarios — pending+closed pair, out-of-scope pending, empty). `grep` confirms `/api/courses`, `/api/academic-years`, `/api/quarters`, `/api/users`, `/api/roles`, `/api/institutions`, `/api/auth/login`, `/api/auth/me` defaults are still present — no regression to prior fixture coverage.

### Backend whitelist cross-check
`backend/src/services/user.service.ts:28` confirms `NOTIFICATION_ACTION_KEYS = ['absences', 'citations']` — the `'citations'` key is whitelisted on the backend even though feature #20 doesn't consume it yet (relevant context for the deferred migration in feature #21).

## Required Changes (if applicable)

None.
