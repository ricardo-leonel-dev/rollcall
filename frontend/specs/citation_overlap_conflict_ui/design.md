# Design — Readable conflict message in the citation dialog

## Files to touch

### Edited (only file)
- `src/app/features/citations/citation-dialog.component.ts`:
  - Add a `CitationConflictInfo` interface and a `conflict` signal.
  - Widen `save()`'s `catch` block to branch on whether the error is a scheduling conflict.
  - Add a conflict banner to the template, styled distinctly from the existing `.pending-banner`.
  - Add `(ngModelChange)` handlers on the date/time inputs to clear the banner (R11).

### Not touched
- `src/app/features/citations/citations.component.ts` — no change; the conflict never reaches the
  roster/listing, it's fully handled inside the dialog before `dialogRef.close()` would fire.
- `src/app/core/models/index.ts` — `CitationConflictInfo` is dialog-local (see "Discarded
  alternatives" #4 for why it's not promoted to a shared model).
- `src/app/shared/utils/citation-date.util.ts` — `formatCitationDateLabelShort` already exists
  and already takes exactly `(date: string, time: string)`; reused as-is (R4).
- Backend (`../backend`) — the 409 contract (`{ error, conflict }`) already shipped in
  `citation_guardian_conflict_validation`; this feature is a pure consumer of it.

## `CitationConflictInfo` and state

```ts
interface CitationConflictInfo {
  id: number;
  date: string;
  time: string;
  studentName?: string;
  guardianName?: string;
  guardianPhone?: string;
  courseName?: string;
}
```

Every optional field is modeled as *independently* optional (not "all four or none") even though
the backend only ever sends all four together or none of them — this is the same defensive
posture `docs/conventions.md`'s "Reusability" bias recommends: the component's own logic (R5/R6)
already renders each field conditionally, so there's no extra cost to not assuming the all-or-
nothing invariant holds forever, and it means a future backend change that redacts, say, only
`guardianPhone` degrades gracefully instead of type-erroring.

```ts
readonly conflict = signal<CitationConflictInfo | null>(null);
```

Placed alongside the existing `saving`/`reasons`/`existingAttachments`/`removingAttachmentId`
signals, same declaration style.

## `save()` changes

```ts
async save(): Promise<void> {
  if (!this.canSave || this.saving()) return;
  this.saving.set(true);
  this.conflict.set(null); // R10 — clear any stale conflict before a new attempt
  const base = { /* unchanged */ };
  const payload = /* unchanged */;
  try {
    const saved = this.isEdit
      ? await firstValueFrom(this.http.put<Citation>(`/api/citations/${this.data.citation!.id}`, payload))
      : await firstValueFrom(this.http.post<Citation>('/api/citations', payload));
    /* unchanged: attachment upload, success toast, dialogRef.close(true) */
  } catch (err: any) {
    const conflict = err?.status === 409 ? err?.error?.conflict as CitationConflictInfo | undefined : undefined;
    if (conflict) {
      this.conflict.set(conflict); // R1, R3-R6, R9 — same branch for create and update
    } else {
      this.notify.error(err?.error?.error ?? 'No se pudo guardar la citación'); // R7, R8 unchanged
    }
  } finally {
    this.saving.set(false);
  }
}
```

This is the entire behavioral change to `save()`: one new line at the top (R10), and the
`catch` block's single `notify.error(...)` call becomes an `if/else` keyed on
`err?.status === 409 && err?.error?.conflict`. `dialogRef.close(true)` is only ever reached on the
success path, already above the `catch` — so R2 ("don't close the dialog on conflict") requires no
new code, it falls out of the existing `try`/`catch` structure. Nothing about `date`/`time`/
`observations`/`reasonIds`/`pendingFiles` is touched in either branch of the `catch`, satisfying
R2's "preserve entered data" the same way: by simply not writing to them.

## Template changes

A new block, placed directly below the existing `pending-banner`/`isOrphanCitation` banners (same
position in the visual flow — before the date/time fields), conditionally rendered:

```html
@if (conflict(); as c) {
  <div class="conflict-banner">
    <div class="conflict-banner-title">
      <mat-icon style="font-size:16px;width:16px;height:16px">event_busy</mat-icon>
      {{lastConflictError}}
    </div>
    <div class="conflict-banner-line">{{formatCitationDateLabelShort(c.date, c.time)}}</div>
    @if (c.studentName) { <div class="conflict-banner-line">Estudiante: {{c.studentName}}</div> }
    @if (c.guardianName) { <div class="conflict-banner-line">Representante: {{c.guardianName}}</div> }
    @if (c.guardianPhone) { <div class="conflict-banner-line">Teléfono: {{c.guardianPhone}}</div> }
    @if (c.courseName) { <div class="conflict-banner-line">Curso: {{c.courseName}}</div> }
  </div>
}
```

`lastConflictError` is a plain class field (not a signal — same category as `date`/`time`, purely
descriptive text that's only ever read alongside `conflict()`), set to `err.error.error` in the
same `catch` branch that calls `this.conflict.set(conflict)`. Kept separate from the typed
`CitationConflictInfo` interface (which mirrors exactly the backend's `conflict` object) rather
than smuggling the heading text into it as a fifth field.

Date/time inputs gain `(ngModelChange)="onScheduleFieldChanged()"` in addition to their existing
`[(ngModel)]`:

```html
<input matInput [matDatepicker]="picker" [(ngModel)]="date" (ngModelChange)="onScheduleFieldChanged()">
...
<input matInput type="time" [(ngModel)]="time" (ngModelChange)="onScheduleFieldChanged()">
```

```ts
onScheduleFieldChanged(): void {
  if (this.conflict()) this.conflict.set(null); // R11
}
```

## Styling

New `.conflict-banner` rule, visually distinct from the existing yellow `.pending-banner` (which
means "heads up, informational") — this one signals a hard block, so it uses the same red/rose
tone already established elsewhere in this codebase for destructive/blocking states (e.g.
`justifications.component.ts`'s `#b91c1c`/`#fee2e2` pair, `absences.component.ts`'s "Fallido"
badge):

```css
.conflict-banner {
  background: #fee2e2; color: #991b1b;
  border: 1px solid #fecaca; border-radius: 10px;
  padding: 10px 14px; margin-bottom: 14px; font-size: 13px;
}
.conflict-banner-title { font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
.conflict-banner-line { font-size: 12px; color: #7f1d1d; padding: 1px 0; }
```

Per `docs/architecture.md`'s "Design Workflow", this is a small, self-contained banner addition to
an existing screen (not a new screen), consistent in shape with the file's own pre-existing
`.pending-banner` — no new canvas/mockup pass is warranted for a same-pattern, same-file addition
this size; the `frontend-design` judgment already embodied by the existing banner (rounded card,
icon + title, muted-on-tint body text) is reused directly.

## Error handling

- `save()`'s single `try/catch` around the `firstValueFrom` create/update call is the only place a
  scheduling conflict can originate — `closeCitation()` calls `PUT /api/citations/:id/close`,
  which never runs `assertNoGuardianConflict` (see `../backend/src/services/citation.service.ts`'s
  `close()`, which only calls `findOwned`), so it cannot 409 with a `conflict` body and needs no
  change.
- Attachment upload (`POST /api/citations/:id/attachments`) only runs after a successful
  create/update, past the point a conflict could have fired — unaffected.
- Every other existing `catch` block in this file (`ngOnInit`'s reason-loading,
  `removeExistingAttachment`) is untouched; they don't call `create`/`update` and cannot receive
  this shape of `409`.

## Discarded alternatives

1. **Reuse `AbsenceSaveResultDialogComponent`'s pattern: close the citation dialog and open a new,
   dedicated "conflict result" `MatDialog` on top.** Rejected: that pattern fits a **post-save**
   summary (some rows created, some skipped, nothing left to edit) where closing the original form
   makes sense. Here nothing was saved — the user's in-progress edits (date, time, observations,
   reasons, pending file attachments) are still exactly what they want to submit, just with a
   date/time that needs adjusting. Closing the form would either discard that state or require
   re-opening it prefilled, which is strictly more code than staying open, and would violate R2's
   explicit "form data already entered is preserved" acceptance criterion more directly than an
   inline banner does.
2. **Deep-link/navigate to view or edit the conflicting citation, mirroring
   `deep_link_to_edit_existing_conflicting_absence` (#16).** Rejected for reasons that don't apply
   to the absence case:
   - **Scope safety.** `citation.service.ts`'s `findOwned()` enforces `courseIds` scope on every
     `GET`/`PUT`/`DELETE` by id (`assertEnrollmentInScope` when `courseIds !== null`). A
     course-scoped caller (teacher, block inspector) can receive a `409` for a conflicting citation
     that belongs to a course they have no access to (the conflict check is deliberately
     institution-wide, per that spec's R15) — the backend already redacts `studentName`/
     `guardianName`/etc. for exactly this reason. Offering a "view/edit" action for a resource the
     same request would 404 on if followed is worse than not offering it.
   - **No stable target screen even for full-scope users.** In the absence case, the conflicting
     row is always the *same enrollment, same day* — trivially resolved by
     `GET /api/absences?enrollment_id=...&date_from=...&date_to=...` and edited via the existing
     per-enrollment `absences.component.ts` roster. Here the conflicting citation can belong to a
     **different student** (shared guardian) and a **different course/academic year** than the
     one whose roster is currently open — there is no single "go here" screen; building one would
     mean constructing the equivalent of `AbsenceEditComponent` (a new routed by-id editor) from
     scratch, which is disproportionate to this feature's two-bullet acceptance criteria (readable
     message + preserved data — neither mentions navigation).
   - The harness feature description itself only asks for a message, not an action — adding
     navigation would be scope creep relative to what was actually requested.
3. **Show the conflict as a `NotificationService.error()` toast instead of an inline banner.**
   Rejected: a toast is transient and single-line by convention in this app (see
   `NotificationService`/`ToastComponent` usage elsewhere — short strings, auto-dismissing); the
   acceptance criteria wants a message that identifies four-plus distinct facts (date, time,
   student, representative, phone, course) legibly and durably while the user decides what to
   change, which an auto-dismissing snackbar is a poor fit for. The existing `.pending-banner`
   precedent in this exact file already established that persistent, structured, in-dialog
   messaging (not a toast) is this component's convention for "here's something you should read
   before continuing."
4. **Promote `CitationConflictInfo` to `core/models/index.ts` as a shared model.**
   Rejected per `docs/conventions.md`'s model-interface convention (`core/models/index.ts` holds
   backend DTOs consumed by 2+ places) — this type is consumed by exactly one component
   (`CitationDialogComponent`'s own template and `save()`), the same way `CitationDialogData` is
   already declared locally in this file rather than in `core/models`. If a second consumer
   appears later, promoting it then is a one-line move, not a redesign.
5. **Watch `date`/`time` via a `computed()`/`effect()` instead of an explicit
   `(ngModelChange)` handler (R11).** Rejected: `date` and `time` are plain class fields in this
   component (bound via two-way `[(ngModel)]`), not signals — every other piece of reactive state
   in this file that needs to *react* to a change already does so via an explicit method call
   (e.g. `onFilesSelected`, `removeFile`), never via `effect()` watching a non-signal field.
   Converting `date`/`time` to signals just to support this one clearing behavior would be a wider
   refactor of the component's existing field style, not something this feature's scope calls for.

## Verification

No automated test suite exists in this project (`docs/verification.md`). Verification is
`pnpm run build` (or `tsc` fallback) plus the manual smoke scenario in requirements.md's R13, run
against `docker compose up -d --build frontend`, using two logins (one institution-wide-scope,
one course-scoped) to exercise both redaction shapes.
