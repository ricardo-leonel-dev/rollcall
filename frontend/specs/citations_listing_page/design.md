# Design — Citations listing page (roster + pills + actions column)

## Files touched

| File | Change |
|---|---|
| `src/app/core/models/index.ts` | Add `Citation` (R1) and `CitationRosterRow` (R2) interfaces, placed near `Absence`/`Justification` since they're the same "backend DTO" grouping. |
| `src/app/app.routes.ts` | Replace `inspectors/citations`'s `...placeholder('Administración de citaciones')` with a real `loadComponent` entry (R3). |
| `src/app/core/nav-items.ts` | Update the `/inspectors/citations` subnav row (R4); add a `citations` node to `MODULE_TREE` and `MODULE_KEYS` (R5). |
| `src/app/features/citations/citations.component.ts` | New — the route-level component (R6–R33 except R32's dialog body). |
| `src/app/features/citations/citation-history-dialog.component.ts` | New — small read-only dialog for "Ver historial completo" (R31–R33). |

No backend files are touched by this feature — see the "not yet approved" scope note in
`requirements.md`.

## Data model (`core/models/index.ts`)

```ts
export interface Citation {
  id: number;
  dateFrom: string;
  dateTo: string;
  time: string | null;
  status: 'pending' | 'closed';
  observations: string | null;
  closedAt: string | null;
  closedByUserId: number | null;
  createdByUserId: number;
  createdAt: string;
  reasonIds: number[];
}

export interface CitationRosterRow {
  enrollmentId: number;
  rosterNumber: number | null;
  studentName: string;
  guardianId: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  whatsappLink: string | null;
  citations: Citation[];
}
```

These mirror backend feature 10's R1/R2 draft field-for-field (camelCase, same nullability). No
`Enrollment` reuse: `CitationRosterRow` is a distinct roster shape (no `courseId`/`academicYearId`/
`teacher`/etc. — the roster-mode response is deliberately narrower than `/api/enrollments`), so
inventing a shared supertype would leak fields neither endpoint actually returns for the other.

## `CitationsComponent` (`features/citations/citations.component.ts`)

Standalone, `OnPush`, following `AbsencesComponent`'s shape (same imports category order per
`docs/conventions.md`: Angular core → Angular common/http/router/forms → Material modules → RxJS →
local models/utils/services → shared components → sibling dialogs).

```ts
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatSelectModule, MatFormFieldModule, MatButtonModule, MatIconModule,
            MatTooltipModule, MatMenuModule, WhatsappIconComponent, QuarterSelectorComponent],
  styles: [ /* .manual-search block copy-pasted verbatim from absences.component.ts per
               docs/conventions.md's "extreme homogeneity" — no shared extraction, this is the
               second, not third, occurrence (see "Reusability" in conventions.md: two similar
               inline blocks is still fine) */ ],
  template: `...`,
})
export class CitationsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  readonly academicYearContext = inject(AcademicYearContextService);
  private readonly quarterContext = inject(QuarterContextService);

  readonly courses = signal<Course[]>([]);
  readonly roster = signal<CitationRosterRow[]>([]);
  readonly rosterLoading = signal(false);

  selCourse: number | null = null;
  selYear: number | null = null;
  manualSearch = '';
  private scopeStart: string | null = null; // R13–R16
  private scopeEnd: string | null = null;

  async ngOnInit(): Promise<void> { /* R6, R13/R14 */ }
  async onCourseChange(): Promise<void> { /* R7, R8 */ }
  private async loadRoster(): Promise<void> { /* R7, R9, R10 */ }
  filteredRoster(): CitationRosterRow[] { /* R12 */ }
  scopedCitations(row: CitationRosterRow): Citation[] { /* R16 */ }
  onQuarterChange(q: Quarter | null): void { /* R15 */ }
  pillLabel(c: Citation): string { /* R19 */ }
  pillStyle(c: Citation): string { /* R19 */ }
  onPillClick(row: CitationRosterRow, c: Citation): void { /* R20 — stub, see below */ }
  onAddCitation(row: CitationRosterRow): void { /* R23 — stub, see below */ }
  resolveTargetCitation(row: CitationRosterRow): Citation | null { /* R21, R22 */ }
  notifyGuardian(row: CitationRosterRow): void { /* R24–R26 */ }
  deleteCitation(row: CitationRosterRow): void { /* R27–R30 */ }
  openHistory(row: CitationRosterRow): void { /* R31–R33 */ }
}
```

### Stub handlers (R20, R23) — exact shape

Both `onPillClick` and `onAddCitation` call a single private helper so feature #21 has one seam to
replace:

```ts
private openCitationEditor(row: CitationRosterRow, citation?: Citation): void {
  // TODO(feature #21 citations_schedule_dialog): open the real create/edit dialog here.
  this.notify.info('El editor de citaciones estará disponible próximamente.');
}
```

This satisfies R20/R23's "no HTTP request, no data mutation" requirement mechanically (the body
never touches `this.http`) and gives feature #21 a single, obviously-named method to replace rather
than two independent stub bodies that could drift.

### Quarter scoping (R13–R16)

`onQuarterChange`/`ngOnInit`'s default-quarter application set `scopeStart`/`scopeEnd` exactly like
`AbsencesComponent.onQuarterChange`/`applyDefaultQuarter` set `dateFrom`/`dateTo` — the difference is
these two fields never feed a query string (the roster endpoint takes no date params, backend R1/R3),
they only feed the pure client-side filter `scopedCitations`:

```ts
scopedCitations(row: CitationRosterRow): Citation[] {
  if (!this.scopeStart || !this.scopeEnd) return row.citations;
  return row.citations.filter(c => c.dateFrom >= this.scopeStart! && c.dateFrom <= this.scopeEnd!);
}
```

(String comparison is safe here because `dateFrom` is always `YYYY-MM-DD`, same convention already
relied on elsewhere in this codebase, e.g. `quarter-context.service.ts`'s sort.)

### Target-citation resolution (R21, R22)

```ts
resolveTargetCitation(row: CitationRosterRow): Citation | null {
  return row.citations.find(c => c.status === 'pending') ?? row.citations[0] ?? null;
}
```

`row.citations` is already server-ordered `dateFrom` descending (backend R2), so `.find` naturally
returns the earliest-declared pending citation among ties and `row.citations[0]` is the most recent
overall when none is pending — no client-side re-sort needed (consistent with the
`citations_admin_reasons` spec's R7 "no client-side re-sort" precedent).

### WhatsApp action (R24–R26)

```ts
private readonly CITATION_WHATSAPP_TEMPLATE =
  'Estimado apoderado, se ha registrado una citación para {{nombre}} el {{fecha}}. ' +
  'Por favor confirmar asistencia.';

notifyGuardian(row: CitationRosterRow): void {
  const target = this.resolveTargetCitation(row);
  if (!row.whatsappLink || !target) return; // guarded by R24 at render time too
  if (target.status === 'closed') { window.open(row.whatsappLink, '_blank'); return; }
  const dateLabel = target.time ? `${target.dateFrom} a las ${target.time}` : target.dateFrom;
  const message = this.CITATION_WHATSAPP_TEMPLATE
    .replace(/\{\{nombre\}\}/g, row.studentName)
    .replace(/\{\{fecha\}\}/g, dateLabel);
  window.open(`${row.whatsappLink}?text=${encodeURIComponent(message)}`, '_blank');
}
```

This mirrors `AbsencesComponent.notifyGuardian`'s `isJustified` branch/template-substitution
mechanics exactly (see "Discarded alternatives" below for why this template is local instead of
routed through `NotificationTemplateService`).

### Delete action (R27–R30)

Identical pattern to `AbsencesComponent.deleteAbsence`: `ConfirmDialogComponent` → `afterClosed()` →
`firstValueFrom(this.http.delete(...))` → reload. No optimistic update (R30) — the row's pill set only
changes after `loadRoster()` re-resolves from the reloaded response.

### "Ver historial completo" (R31–R33)

`CitationHistoryDialogComponent` (new, `citation-history-dialog.component.ts`) takes
`MAT_DIALOG_DATA: { studentName: string; citations: Citation[] }` and renders a simple list (one row
per citation: date range, time, status badge reusing the R19 style, observations or `—`) with an
`empty-state` block when `citations.length === 0` (R33). It performs no HTTP calls — `openHistory`
passes `row.citations` (the full, unscoped array already in memory) directly:

```ts
openHistory(row: CitationRosterRow): void {
  this.dialog.open(CitationHistoryDialogComponent, {
    width: '480px',
    data: { studentName: row.studentName, citations: row.citations },
  });
}
```

## Route / nav wiring

`app.routes.ts`'s citations entry becomes:

```ts
{ path: 'citations', loadComponent: () => import('./features/citations/citations.component').then(m => m.CitationsComponent), canActivate: [moduleGuard], data: { module: 'citations' } },
```

`nav-items.ts`'s `inspectors` section's citations row becomes:

```ts
{ route: '/inspectors/citations', icon: 'campaign', label: 'Administración de citaciones', moduleKey: 'citations' },
```

`MODULE_TREE` gains a new top-level sibling of `student-report`:

```ts
{ key: 'citations', label: 'Citaciones' },
```

`MODULE_KEYS` gains:

```ts
{ key: 'citations', label: 'Citaciones' },
```

(Both lists are otherwise untouched — no nested children, since this feature has no per-sub-area
split the way `absences`/`admin` do.)

## Discarded alternatives

1. **Route the WhatsApp message through `NotificationTemplateService.getTemplate('citations')`**
   (the service introduced by sibling frontend feature `notification_templates_settings_ui`, #18 in
   the harness, since shipped). Discarded: that service is now in place and the backend's
   `NOTIFICATION_ACTION_KEYS` already whitelists `'citations'` (see `user.service.ts`), so this is
   technically feasible today. We're deferring the migration anyway because the matching UX surface
   — adding a `'citations'` entry to `NOTIFICATION_TEMPLATE_SECTIONS` in the profile dialog so
   users can configure their own per-action template — is intentionally bundled with feature #21
   `citations_schedule_dialog` (the create/edit flow). Wiring the service in `#20` without the
   dialog section would expose a template configuration UI but no way to actually create citations,
   which is incoherent; a local `CITATION_WHATSAPP_TEMPLATE` constant (see above) keeps this
   feature buildable and testable in isolation, and a small follow-up at the end of #21 can swap
   the constant for `templateService.getTemplate('citations')` plus the matching dialog entry.
2. **Resolve `reasonIds` to reason names** via `GET /api/citation-reasons` (backend feature 9 /
   frontend feature `citations_admin_reasons`, #19 in the harness, since shipped) for display in
   pills or the history dialog. Discarded: while both dependencies are now in place, this would add
   a second load + a join step per row render for a cosmetic enhancement the feature card doesn't
   actually ask for (the card's pill description only calls for pending/closed styling, not reason
   text). Pills and the history dialog show only the fields the roster-mode response provides
   (dates, status, observations) — resolving `reasonIds` to reason names via a second pass (fetch
   all reasons, build an id→reason map once, use it in pill/history rendering) is a plausible
   near-term follow-up but is out of scope for this feature.
3. **Filter the roster call itself by date range** (passing `date_from`/`date_to` query params
   alongside `course_id`/`academic_year_id`). Discarded: backend feature 10's R1/R3 draft explicitly
   defines roster mode as accepting only `course_id` + `academic_year_id` (R3 even 400s if
   `academic_year_id` is missing) — there is no server-side date filter to call. Quarter-scoping is
   therefore implemented client-side against each row's already-loaded `citations` array (R13–R16).
4. **Issue a second request per "Ver historial completo" click**, using pending-detection mode
   (`GET /api/citations?enrollment_id=<id>`, backend R5–R8) to fetch a fresh, unscoped list.
   Discarded: backend R2 already returns every non-deleted citation (pending **and** closed) per
   roster row in the single initial `GET /api/citations` call — a second request would be redundant
   network traffic for data already in memory. `openHistory` reuses `row.citations` directly.

## Error / exception paths

- `GET /api/citations` (R7) failure → `NotificationService.error`, roster set to `[]` (R10) — no
  perpetual spinner.
- `DELETE /api/citations/:id` (R29) failure → `NotificationService.error`, no optimistic removal
  (R30) — mirrors `AbsencesComponent.deleteAbsence`'s implicit behavior (it doesn't optimistically
  remove either, though it doesn't currently wrap that call in try/catch — this feature's
  `deleteCitation` explicitly does, per `docs/conventions.md`'s "never fail silently" rule).
- Stub handlers (R20, R23) never throw and never call `this.http` — there is no error path to
  design for them until feature #21 replaces the body.

## Visual direction

Per `docs/architecture.md`/`docs/conventions.md`, the `frontend-design` skill must be loaded before
writing this component's `template`/`styles` block. This design intentionally reuses, verbatim,
every visual primitive already established for list/table screens (`.filter-bar`, `.manual-search`,
`.data-table-wrap`/`.data-table`, `.empty-state`, `.spinner-center`, `.badge` + inline status
colors) rather than introducing new CSS — the only new visual element is the pill's inline
`style="background:...;color:..."` pair (R19), which itself is copied from an existing precedent
(`AbsencesComponent`'s voice-log-history "Pendiente"/"Descartado" badges) rather than invented.
