# Design — Deep-link a edición de ausencia existente desde el diálogo de conflictos

## Files touched

- `src/app/features/absences/absence-save-result-dialog.component.ts` — widen
  `AbsenceSaveResultConflict`, add the "Editar inasistencia" button and its click handler.
- `src/app/features/absences/absences.component.ts` — stop stripping `enrollmentId` when building
  the `conflicts` array passed to the dialog at its three call sites.
- `src/app/app.routes.ts` — one new route entry.
- `src/app/features/absences/absence-edit.component.ts` — **new file**, the standalone edit
  screen.

No backend or `excel-service` change (see requirements.md's "Backend dependency reassessment").

## Backend dependency reassessment — the detailed version

The harness feature description for this feature (`state/features/016-...md`) was written
assuming two backend gaps that, on inspection of the sibling `attendance_backend` repo (read-only;
no file there was edited as part of drafting this spec), already don't exist:

1. `backend/src/controllers/absence.controller.ts`:
   ```ts
   router.get('/',       requirePermission(R,'read'),   ...)  // enrollment_id, date_from, date_to, ...
   router.post('/',      requirePermission(R,'create'), ...)  // createRange — returns skippedDetails without an id
   router.put('/:id',    requirePermission(R,'update'), ...)  // already wired to svc.update
   router.delete('/:id', requirePermission(R,'delete'), ...)  // already wired to svc.remove (cascades justification cleanup)
   ```
   `PUT`/`DELETE` by id are live endpoints today, already consumed by this frontend
   (`absence-dialog.component.ts:100`, `absences.component.ts:1169`).
2. `backend/src/services/absence.service.ts`'s `findAll()` (backing the `GET /` route above)
   already accepts `enrollmentId`+`dateFrom`+`dateTo` and returns the full row shape (including
   `id`, `notes`, `isJustified` via a computed `EXISTS` subquery, `studentName`, `course`,
   `academicYear`). The table has a soft-delete-aware `UNIQUE(enrollment_id, date)` constraint
   (see the comment above `createRange`'s soft-delete/restore branch, lines 144-146) — so for a
   given enrollment and date there is at most one active row, which is precisely the "existing
   absence" a same-day conflict is about.

Given that, resolving "which absence is this conflict referring to" does not need a new
`existingId` field on `POST /api/absences`'s response — the frontend already knows the
conflicting `enrollmentId` and `date` at the point it wants to look the absence up (see
"Conflict dialog changes" below), and can ask the existing `GET /` endpoint for exactly that pair.
This is not a workaround/mock standing in for missing backend work: it is a real, already-shipped
endpoint used for exactly this filter shape elsewhere in this same file
(`absences.component.ts:815` for the "today" badges, `:840` for the Listado tab). No cross-project
Notion card is created for this feature as a result — flagged explicitly here since the original
task description assumed one would be needed.

## Conflict dialog changes

### Widening the conflict shape

```ts
export interface AbsenceSaveResultConflict {
  date: string;
  existingType: 'F' | 'AT';
  enrollmentId: number;   // new — every call site already has this in scope
}
```

All three call sites in `absences.component.ts` already have `enrollmentId` in scope at the point
they build this array — this is a pure additive change, no new lookups:

- `saveAbsenceRange()`: `partition.conflicts.map(c => ({ ...c, enrollmentId: enrollment.enrollmentId }))`
  (single enrollment for the whole call).
- `confirmVoiceAbsence()`: same pattern, `enrollmentId: r.enrollmentId`.
- `confirmPhotoAbsences()`: the local `conflicts` array built inside the loop **already** carries
  `enrollmentId` per entry (line 1005, `conflicts.push({ ...c, enrollmentId: item.enrollmentId, studentName: item.studentName })`)
  — today it is dropped by the `.map(({ date, existingType }) => ({ date, existingType }))` at
  line 1034 right before being handed to the dialog. Stop dropping it.

### "Editar inasistencia" button + resolve-and-navigate

`AbsenceSaveResultDialogComponent` currently has no `HttpClient`/`Router` dependency — it adds
both:

```ts
private readonly http = inject(HttpClient);
private readonly router = inject(Router);
private readonly dialogRef = inject(MatDialogRef<AbsenceSaveResultDialogComponent>);
readonly resolving = signal<string | null>(null); // holds the date being resolved, for a per-row spinner

async editConflict(c: AbsenceSaveResultConflict): Promise<void> {
  this.resolving.set(c.date);
  try {
    const matches = await firstValueFrom(this.http.get<Absence[]>(
      `/api/absences?enrollment_id=${c.enrollmentId}&date_from=${c.date}&date_to=${c.date}`
    ));
    if (matches.length !== 1) {
      this.notify.error('No se pudo encontrar la inasistencia existente');
      return;
    }
    this.dialogRef.close();
    await this.router.navigate(['/inspectors/absences/edit', matches[0].id], {
      queryParams: { enrollmentId: c.enrollmentId, date: c.date },
    });
  } finally {
    this.resolving.set(null);
  }
}
```

Template: each conflict `<li>` gains a small stroked/text button ("Editar inasistencia",
`edit` icon) next to its existing "ya registrado como ..." text, disabled while
`resolving() === c.date` for that row (per-row, not a single dialog-wide spinner, since a user
could plausibly click a different row while one resolves — unlikely in practice given conflicts
are usually one row, but cheap to get right and avoids a shared boolean masking which row is
busy).

`NotificationService` is injected the same way `AbsenceDialogComponent` already does it.

## New route

`src/app/app.routes.ts`, as a sibling of the existing `inspectors/absences` entry (same
`children` array, same precedent as the flat multi-segment `students/list`/`students/enrollments`
redirect entries already in that file):

```ts
{ path: 'absences',      loadComponent: () => import('./features/absences/absences.component').then(m => m.AbsencesComponent), canActivate: [moduleGuard], data: { module: 'absences' } },
{ path: 'absences/edit/:id', loadComponent: () => import('./features/absences/absence-edit.component').then(m => m.AbsenceEditComponent), canActivate: [moduleGuard], data: { module: 'absences' } },
```

Full path: `/inspectors/absences/edit/:id?enrollmentId=<n>&date=<yyyy-mm-dd>`. `:id` is the
canonical resource identifier (used directly by the `PUT`/`DELETE` calls); `enrollmentId`/`date`
are carried as query params purely so the page can re-fetch the absence's display data (`notes`,
`isJustified`, `studentName`, `course`, `academicYear`) from the existing list endpoint without a
`GET /api/absences/:id` endpoint existing. A URL containing all three values is self-sufficient —
pasting it fresh, or hitting reload, reconstructs the page from scratch (this is the literal
"deep-linkable" requirement from the feature's own acceptance criteria).

## `AbsenceEditComponent`

Standalone, `OnPush`, page-level component (not a `MatDialog`) — mirrors the field set already
established for editing in `AbsenceDialogComponent`'s `edit` mode (date/type/notes,
`FormsModule`+`ngModel`, `MatDatepickerModule`/`MatSelectModule`/`MatInputModule`), rendered under
a `.page-header`/`.card` shell like `AbsencesComponent`'s own top-level layout, not the dialog's
`mat-dialog-content` chrome (it isn't a dialog).

```ts
readonly route = inject(ActivatedRoute);
readonly router = inject(Router);
readonly http = inject(HttpClient);
readonly dialog = inject(MatDialog);
readonly notify = inject(NotificationService);

readonly state = signal<'loading' | 'not-found' | 'ready'>('loading');
readonly saving = signal(false);
absence: Absence | null = null;
date: Date | null = null;
type: 'F' | 'AT' = 'F';
notes = '';

async ngOnInit(): Promise<void> {
  const id = Number(this.route.snapshot.paramMap.get('id'));
  const enrollmentId = this.route.snapshot.queryParamMap.get('enrollmentId');
  const dateParam = this.route.snapshot.queryParamMap.get('date');
  if (!id || !enrollmentId || !dateParam) { this.state.set('not-found'); return; }
  try {
    const matches = await firstValueFrom(this.http.get<Absence[]>(
      `/api/absences?enrollment_id=${enrollmentId}&date_from=${dateParam}&date_to=${dateParam}`
    ));
    const found = matches.find(a => a.id === id) ?? null;
    if (!found) { this.state.set('not-found'); return; }
    this.absence = found;
    this.date = dateStringToDate(found.date);
    this.type = found.type;
    this.notes = found.notes ?? '';
    this.state.set('ready');
  } catch {
    this.state.set('not-found');
  }
}
```

`save()`, `delete()`, `cancel()` mirror `AbsenceDialogComponent.save()` and
`absences.component.ts`'s `deleteAbsence()` respectively (same `PUT`/`DELETE` calls, same
`ConfirmDialogComponent` data shape and `isJustified`-conditional message, same
`NotificationService.success`/`.error` calls), ending in
`this.router.navigateByUrl('/inspectors/absences')` on success or on cancel. No new shared
abstraction is introduced for the save/delete HTTP calls themselves — they are one-liner
`firstValueFrom` calls already following the established `try/catch` convention from
`docs/architecture.md` §3, not complex enough to warrant extraction, and the page-level component
and the dialog are different enough (route vs. modal, different surrounding chrome) that sharing a
base class would add more indirection than it removes per `docs/conventions.md`'s "Reusability"
bias (build shared abstractions once a *third* similar need appears, not preemptively for two).

### Not-found state

Rendered when `state() === 'not-found'` — an `.empty-state` block (same CSS class other empty
states in this app already use) with a short explanation ("No se pudo cargar esta inasistencia —
puede que ya haya sido eliminada.") and a link/button back to `/inspectors/absences`.

## Discarded alternatives

1. **Reuse `AbsenceDialogComponent` as a nested `MatDialog`, opened directly from
   `AbsenceSaveResultDialogComponent`'s click handler, instead of a new routed page.** Rejected:
   the business ask is explicit about a "pantalla standalone" (see the harness feature
   description), and the acceptance criteria explicitly want a URL that reflects the id
   ("deep-linkable"). A `MatDialog` has no independent URL — it can't be bookmarked, shared, or
   reached again after being dismissed without re-triggering the original conflict flow, and
   stacking a second `MatDialog` on top of an already-open one has known focus-trap/z-index
   footguns in Angular Material that a routed page avoids entirely by construction (the first
   dialog is explicitly closed, per R11, before the route activates).
2. **Add the backend `existingId` field to `skippedDetails` and a `GET /api/absences/:id`
   endpoint, treating this as a genuine cross-project dependency (as the harness feature
   description originally assumed).** Rejected after verifying the sibling backend repo: both
   capabilities already exist in equivalent form (`GET /` with `enrollment_id`+`date_from`+
   `date_to`, `PUT`/`DELETE /:id`). Introducing a parallel, narrower `existingId`/`GET /:id` pair
   of endpoints purely to save one HTTP round-trip and a client-side array-of-one filter is not
   worth a cross-project coordination cost (Notion card, backend session, backend review, waiting
   on `approve-spec`/`claim` there) for a feature this frontend can already deliver end-to-end
   today. If a future feature needs a true single-absence-by-id fetch for other reasons, that's a
   separate, independently justified backend feature — not manufactured here.
3. **Pass the full `Absence` object via Angular Router navigation `state`
   (`router.navigate([...], { state: { absence } })`) instead of `enrollmentId`/`date` query
   params.** Rejected: `Router` navigation `state` lives only in the browser's `history.state` for
   that specific navigation — a fresh tab, a bookmark, or a hard reload of the same URL has no
   `state` to read, which directly contradicts the "deep-linkable" requirement (R6/R7). Query
   params make the URL alone sufficient.

## Error handling

- `editConflict()` (dialog): non-1-match `GET` result and network failures both surface via
  `NotificationService.error`, dialog stays open — no navigation happens on failure (R12).
- `AbsenceEditComponent.ngOnInit()`: any fetch failure (network error, no match, missing/invalid
  route params) converges on the same `not-found` state (R8) rather than a raw error toast, since
  there's nothing actionable for the user beyond "go back" — consistent with how other empty
  states in this app are handled (`.empty-state` blocks, not toasts, for "there's nothing here").
- `save()`/`delete()`: `try/catch` around `firstValueFrom`, `NotificationService.error(err?.error?.error ?? '...')`
  on failure, matching `AbsenceDialogComponent.save()`'s existing pattern exactly.

## Verification

No automated test suite exists in this project (`docs/verification.md`). Verification is
`pnpm run build` (or `tsc` fallback) plus the manual smoke scenario in requirements.md's R22, run
against `docker compose up -d --build frontend`.
