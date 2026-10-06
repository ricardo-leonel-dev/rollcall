# Design — Load and display existing evidence when editing a citation

## Dependency on backend feature `citation_attachments_retrieval`

Verified directly in the sibling worktree `../feature-13-citation-attachments-retrieval/backend`
(`attendance_backend`, feature #13, `done`/`approved`): `src/services/citation.service.ts`'s
`findByEnrollment` and `findRoster` both select `citation_attachments` via a correlated `json_agg`
subquery and post-process each row with `attachments: r.attachments.map(a => ({ ...a, url:
attachmentUrl(a.fileName) }))`, so every citation object returned by `GET /api/citations` (either mode
`CitationsComponent` uses) already carries:

```json
{ "id": 1, "fileName": "3-...-abc.jpg", "originalName": "foto.jpg", "mimeType": "image/jpeg",
  "createdAt": "2026-09-01T12:00:00.000Z", "url": "/api/uploads/citaciones/3-...-abc.jpg" }
```

No backend file changes needed for this feature.

## Files touched

| File | Change |
|---|---|
| `src/app/core/models/index.ts` | Add `CitationAttachment` interface; add `attachments: CitationAttachment[]` to `Citation` (R1, R2). |
| `src/app/features/citations/citation-dialog.component.ts` | Add existing-evidence state/rendering/removal (R4–R14). |

No routing changes (the dialog opens from within `/inspectors/citations` as it already does), no
changes to `CitationsComponent` or `CitationHistoryDialogComponent` (see "Discarded alternatives" #2 and
requirements.md's "Open Questions" #2).

## `core/models/index.ts`

```ts
export interface CitationAttachment {
  id: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  url: string;
  createdAt: string;
}

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
  attachments: CitationAttachment[]; // new (R2)
}
```

Placed next to the existing `Citation`/`CitationRosterRow` block, following this file's existing
grouping-by-feature layout (`JustificationAttachment` sits directly above `Justification` the same way).

## `CitationDialogComponent`

New state, alongside the existing `pendingFiles: File[]` field:

```ts
readonly existingAttachments = signal<CitationAttachment[]>(this.data.citation?.attachments ?? []);
readonly removingAttachmentId = signal<number | null>(null);
```

`existingAttachments` is seeded once from `data.citation.attachments` at construction time (R4) — no
`ngOnInit` fetch, matching this dialog's existing convention of treating `data.citation` as an
already-loaded snapshot (the same reasoning `citations_schedule_dialog`'s `design.md` used for the
pending-citations banner: reuse data already loaded by `CitationsComponent`, don't add a redundant round
trip for data already in memory).

New method:

```ts
removeExistingAttachment(att: CitationAttachment): void {
  this.dialog.open(ConfirmDialogComponent, {
    width: '420px',
    data: {
      title: 'Eliminar evidencia',
      message: 'Esta evidencia se eliminará permanentemente. Esta acción no se puede deshacer.',
    },
  }).afterClosed().subscribe(async (ok: boolean) => {
    if (!ok) return; // R14
    this.removingAttachmentId.set(att.id); // R11
    try {
      await firstValueFrom(
        this.http.delete(`/api/citations/${this.data.citation!.id}/attachments/${att.id}`),
      ); // R10
      this.existingAttachments.update(list => list.filter(a => a.id !== att.id)); // R12
      if (this.data.citation) {
        this.data.citation.attachments = this.data.citation.attachments.filter(a => a.id !== att.id);
      }
      this.notify.success('Evidencia eliminada');
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo eliminar la evidencia'); // R13
    } finally {
      this.removingAttachmentId.set(null);
    }
  });
}
```

Mutating `this.data.citation.attachments` in place (in addition to the local `existingAttachments`
signal) keeps `CitationsComponent`'s already-loaded `roster()` array consistent for the rest of the
current session — `data.citation` is the *same object reference* the roster array holds (`onPillClick`
passes a `Citation` straight out of `row.citations`/`scopedCitations(row)`, both of which return the
same elements, never a deep clone), so if the user reopens the same citation without an intervening
`loadRoster()`, they see the up-to-date list rather than a stale one. This is a defensive consistency
measure, not a substitute for `CitationsComponent.loadRoster()` — that already runs whenever the dialog
closes truthily (existing behavior, unchanged by this feature).

Template additions (existing `.evidence-zone`/`.evidence-row`/`.evidence-tile`/`.evidence-remove`
classes already defined in this file are reused, not duplicated):

```html
@if (existingAttachments().length) {
  <div class="section-label">Evidencia</div>
  <div class="evidence-row">
    @for (a of existingAttachments(); track a.id) {
      @if (a.mimeType.startsWith('image/')) {
        <a class="evidence-tile" [href]="a.url" target="_blank" [style.--r.deg]="rotationFor(a.fileName)">
          <img [src]="a.url">
          <button class="evidence-remove" [disabled]="removingAttachmentId() === a.id"
                  (click)="removeExistingAttachment(a); $event.preventDefault()">
            <mat-icon>close</mat-icon>
          </button>
        </a>
      } @else {
        <a class="evidence-tile evidence-tile-doc" [href]="a.url" target="_blank" [style.--r.deg]="rotationFor(a.fileName)">
          <mat-icon>description</mat-icon>
          <span>{{a.originalName}}</span>
          <button class="evidence-remove" [disabled]="removingAttachmentId() === a.id"
                  (click)="removeExistingAttachment(a); $event.preventDefault()">
            <mat-icon>close</mat-icon>
          </button>
        </a>
      }
    }
  </div>
}
```

Placed above the existing "Adjuntar evidencia" zone/`pendingFiles` row (R8's "distinct... remove
control" is satisfied by this being a visually separate block with its own section label, rather than
interleaving persisted and not-yet-uploaded tiles in one row where an accidental click on the wrong `X`
would have very different consequences — see "Discarded alternatives" #3). Exact spacing/typography for
the new `section-label`/tile grouping is a `frontend-design`-skill decision at implementation time (see
`docs/architecture.md`'s "Design Workflow" — mandatory before touching this file's `template`/`styles`),
not pre-specified here beyond "visually distinct from the pending-files row."

`rotationFor(name: string)` is reused as-is (already defined, keyed by filename — works identically for
`a.fileName` as it does for `File.name`).

## Exceptions / error paths

- R10 (`DELETE .../attachments/:id`) failure → `NotificationService.error`, `existingAttachments`
  unchanged, `removingAttachmentId` reset to `null` so the tile's remove control re-enables (R13).
- Confirmation (R9) cancelled/dismissed → pure no-op, no notification (nothing happened) (R14).
- No new failure mode for the initial load (R4): since `existingAttachments` is seeded synchronously
  from already-in-memory `data.citation.attachments`, there is no new request that can fail on dialog
  open.

## Discarded alternatives

1. **Reuse the existing `JustificationAttachment` interface directly** for `Citation.attachments`
   instead of declaring a new `CitationAttachment` interface, since the two shapes are identical today.
   Rejected: every other entity-specific concept in `core/models/index.ts` is named after its own
   domain (`Citation`/`CitationReason` are already distinct from `Justification`/`JustificationReason`-
   equivalent concepts even where fields overlap) — sharing one type across two unrelated features
   would silently couple them, so that a citation-only future field (e.g. a signed/expiring URL variant)
   would either force an awkward union shape onto justifications or require a breaking rename at that
   point. A new, identically-shaped interface costs nothing today and avoids that coupling later.
2. **Reload the whole roster (`CitationsComponent.loadRoster()`) immediately after every attachment
   removal**, instead of updating `CitationDialogComponent`'s own local state. Rejected: confirmed
   `CitationsComponent`'s roster pills (`.pill` markup, `pillLabel`/`pillStyle`) show only date/status,
   no evidence count or icon — nothing in the parent view depends on `attachments` staying in sync in
   real time while the dialog is open. `loadRoster()` already runs whenever the dialog closes truthily,
   which is sufficient; forcing a full network round trip on every single attachment removal (which can
   happen multiple times per dialog session) would be a strictly worse user experience for no visible
   benefit, on top of needing a shared communication channel between dialog and parent that doesn't
   otherwise exist for a boolean-result `MatDialogRef`.
3. **Render existing attachments in the same `evidence-row` as `pendingFiles`**, with the same tile
   markup and no section label, instead of a visually distinct block. Rejected: an existing attachment's
   remove control triggers a real, confirmed, irreversible server `DELETE`, while a `pendingFiles` tile's
   remove control is a no-op local array filter (R3) — visually identical, unlabeled tiles interleaved
   in one row would make it easy to mistake one kind of removal for the other. A separate labeled block
   costs one `section-label` div and keeps the two action types unambiguous.
4. **Skip the confirmation step (R9) for existing-attachment removal**, mirroring `pendingFiles`'
   instant, unconfirmed `removeFile`. Rejected as the default (see requirements.md's "Open Questions" #1
   — flagged for human confirmation, not fully settled): unlike a staged `File` that was never uploaded,
   an existing attachment is already persisted and hard-deleted with no undo (`citation_attachments` has
   no soft-delete column, per backend feature `citation_attachments_retrieval`'s own design doc,
   "Discarded alternatives" #3), so an accidental click has real consequences — this mirrors why
   `closeCitation()` in this same file and `justifications.component.ts`'s `removeAttachment` both
   require confirmation for their own equivalent persisted-and-irreversible actions.

## Visual direction

Per `docs/architecture.md`/`docs/conventions.md`, load the `frontend-design` skill before touching this
component's `template`/`styles`. Reuse the existing `.evidence-tile`/`.evidence-tile-doc`/
`.evidence-remove`/`.section-label` classes already defined in this file rather than inventing new ones;
the only new visual decision is how the existing-evidence block reads as distinct from the "Adjuntar
evidencia" zone/`pendingFiles` row directly below it (a `section-label` ("Evidencia") above it, per the
snippet above, is the minimum; exact spacing is a `frontend-design` call, not fixed here).
