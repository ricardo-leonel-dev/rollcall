# Design — Citation schedule/edit dialog ("Agendar citación")

## Dependency on feature #20

`citations_listing_page` (#20) is merged to `staging` (PR #103, `023d991`) — `CitationsComponent`,
`CitationHistoryDialogComponent`, and the `Citation`/`CitationRosterRow` models are already present in
the working tree. This feature builds directly on them, no merge step needed first.

## Files touched

| File | Change |
|---|---|
| `src/app/features/citations/citation-dialog.component.ts` | New — `CitationDialogComponent` (R1–R33). |
| `src/app/features/citations/citations.component.ts` | Replace stubbed `openCitationEditor` (R34–R36); remove `CITATION_WHATSAPP_TEMPLATE`, migrate `notifyGuardian` (R37). |
| `src/app/core/services/notification-template.service.ts` | Add `citations` to `DEFAULT_TEMPLATES` (R38). |
| `src/app/shared/components/profile-dialog/profile-dialog.component.ts` | Add `citations` entry to `NOTIFICATION_TEMPLATE_SECTIONS` (R39). |

No backend files, no `core/models/index.ts` changes (the `Citation`/`CitationRosterRow` interfaces
already carry every field this dialog needs — see #20's `design.md`), no routing changes (the dialog
opens from within the existing `/inspectors/citations` route, it is not a route itself).

## `CitationDialogComponent`

```ts
export interface CitationDialogData {
  enrollmentId: number;
  studentName: string;
  whatsappLink: string | null;
  pendingCitations: Citation[]; // R3/R4 banner source; always [] when `citation` is set
  citation?: Citation;          // absent => create mode; present => edit mode
}
```

Result type: `boolean` (`dialogRef.close(true)` on any successful save/close, `close(false)`/
`close(undefined)` on cancel) — same contract as `JustificationCreateDialogComponent`/
`CitationReasonDialogComponent`, so `CitationsComponent`'s `afterClosed()` subscriber only needs a
truthiness check (R35/R36).

Standalone, `OnPush`, following this feature's sibling dialogs' import-order convention
(`docs/conventions.md`): `FormsModule` → Material modules (`MatDialogModule`, `MatFormFieldModule`,
`MatInputModule`, `MatSelectModule`, `MatDatepickerModule`, `MatButtonModule`, `MatIconModule`) → RxJS
(`firstValueFrom`, `retry`) → local models/utils/services, plus `ConfirmDialogComponent` (R29's nested
confirmation — see "Cerrar citación confirmation" below).

```ts
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
            MatDatepickerModule, MatButtonModule, MatIconModule],
  styles: [ /* evidence-zone/evidence-row/evidence-tile block copied verbatim from
               justification-create-dialog.component.ts per conventions.md's "extreme
               homogeneity" — third occurrence of this exact pattern (justifications, and
               implicitly this one), still below the threshold where conventions.md's
               "Reusability" section would call for extraction into `shared/` */ ],
  template: `...`,
})
export class CitationDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<CitationDialogComponent, boolean>);
  readonly data: CitationDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  readonly isEdit = !!this.data.citation;
  readonly reasons = signal<CitationReason[]>([]);
  readonly saving = signal(false);

  dateFrom: Date | null = this.data.citation ? dateStringToDate(this.data.citation.dateFrom) : new Date();
  dateTo: Date | null = this.data.citation ? dateStringToDate(this.data.citation.dateTo) : new Date();
  time = this.data.citation?.time ?? '';
  observations = this.data.citation?.observations ?? '';
  reasonIds: number[] = this.data.citation?.reasonIds ?? [];
  pendingFiles: File[] = [];

  async ngOnInit(): Promise<void> {
    try {
      this.reasons.set(await firstValueFrom(this.http.get<CitationReason[]>('/api/citation-reasons')));
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudieron cargar los motivos');
    }
  }

  get canSave(): boolean {
    return this.reasonIds.length > 0 && !!this.dateFrom && !!this.dateTo
      && dateToDateString(this.dateFrom) <= dateToDateString(this.dateTo);
  }

  // onFilesSelected/removeFile/rotationFor/previewUrl: copied from
  // JustificationCreateDialogComponent verbatim (R12–R16), operating on `pendingFiles`
  // instead of a per-step `WizardStep.pendingFiles`.

  async save(): Promise<void> {
    if (!this.canSave || this.saving()) return;
    this.saving.set(true);
    const payload = {
      enrollmentId: this.data.enrollmentId,
      dateFrom: dateToDateString(this.dateFrom),
      dateTo: dateToDateString(this.dateTo),
      time: this.time || null,
      observations: this.observations.trim() || null,
      reasonIds: this.reasonIds,
    };
    try {
      const saved = this.isEdit
        ? await firstValueFrom(this.http.put<Citation>(`/api/citations/${this.data.citation!.id}`, payload))
        : await firstValueFrom(this.http.post<Citation>('/api/citations', payload));
      if (this.pendingFiles.length) {
        try {
          const fd = new FormData();
          for (const f of this.pendingFiles) fd.append('files', f);
          await firstValueFrom(
            this.http.post(`/api/citations/${saved.id}/attachments`, fd).pipe(retry({ count: 2, delay: 2000 })),
          );
        } catch {
          this.notify.warning('La citación se guardó, pero la evidencia no se pudo subir');
        }
      }
      this.notify.success(this.isEdit ? 'Citación actualizada' : 'Citación creada');
      this.dialogRef.close(true);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo guardar la citación');
    } finally {
      this.saving.set(false);
    }
  }

  closeCitation(): void {
    if (this.saving()) return;
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Cerrar citación',
        message: '¿Cerrar esta citación? Ya no podrá reabrirse desde aquí.',
        confirmLabel: 'Cerrar citación',
        icon: 'event_busy',
      },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return; // R31 — cancel/dismiss is a no-op, dialog stays open unchanged
      this.saving.set(true);
      try {
        await firstValueFrom(this.http.put(`/api/citations/${this.data.citation!.id}/close`, {}));
        this.notify.success('Citación cerrada');
        this.dialogRef.close(true); // R32
      } catch (err: any) {
        this.notify.error(err?.error?.error ?? 'No se pudo cerrar la citación'); // R33
      } finally {
        this.saving.set(false);
      }
    });
  }
}
```

Notes:
- `canSave` folds R17/R18 into one guard used both for the "Guardar" button's `[disabled]` binding
  and as a defensive early-return inside `save()` — mirrors `CitationReasonDialogComponent`'s
  `[disabled]="!name.trim() || ... || saving()"` pattern rather than inventing a `FormGroup`/
  `Validators` layer (this codebase has no reactive-forms usage anywhere to be consistent with).
- The "Cerrar citación" button's template guard is `@if (isEdit && data.citation!.status === 'pending')`
  (R26–R28); its `[disabled]` binding is `saving()` (R25).
- The pending-citations banner (R3–R5) renders `@if (!isEdit && data.pendingCitations.length)`,
  looping `data.pendingCitations` showing each one's date range/time — no severity/reason detail,
  since the banner's purpose is presence-warning, not a second history view (that already exists via
  `CitationHistoryDialogComponent`).
- Reason multi-select uses `<mat-select multiple [(ngModel)]="reasonIds">` (the simpler binding used
  by `UserPermissionsDialogComponent`'s course multi-select, not `export-config-dialog.component.ts`'s
  `mat-select-trigger` variant, since there is no "select all" concept here), with each `mat-option`
  showing a small badge (`citationReasonSeverityBadgeClass(r.severity)`) beside the reason name.

### "Cerrar citación" confirmation (R29–R31)

`closeCitation()` opens `ConfirmDialogComponent` (`shared/components/confirm-dialog`) before sending
anything — the exact same shared component `CitationsComponent.deleteCitation()` already opens for its
own destructive action, just from inside `CitationDialogComponent` instead of from the parent. This is
the first case in the codebase of one `MatDialog` opening another from within its own component; Angular
Material supports stacked dialogs natively (no special wiring needed — `MatDialog` tracks its own stack),
and reusing `ConfirmDialogComponent` here keeps the confirmation visually and behaviorally identical to
every other destructive action in this app rather than introducing a bespoke inline "click again to
confirm" affordance. Only on `afterClosed()` emitting `true` does the `PUT .../close` request fire
(R30); a `false`/`undefined` result (Cancel, backdrop click, or the dialog's close button) is a pure
no-op (R31) — `CitationDialogComponent` itself is untouched, still showing the same edit-mode form it
had before the button was clicked.

## `CitationsComponent` changes

```ts
private openCitationEditor(row: CitationRosterRow, citation?: Citation): void {
  this.dialog.open(CitationDialogComponent, {
    width: '560px',
    data: {
      enrollmentId: row.enrollmentId,
      studentName: row.studentName,
      whatsappLink: row.whatsappLink,
      pendingCitations: citation ? [] : row.citations.filter(c => c.status === 'pending'),
      citation,
    },
  }).afterClosed().subscribe(async saved => {
    if (!saved) return;
    await this.loadRoster();
  });
}
```

`notifyGuardian` drops the local `CITATION_WHATSAPP_TEMPLATE` constant/field entirely; its message
line becomes:

```ts
const message = this.templateService.getTemplate('citations')
  .replace(/\{\{nombre\}\}/g, row.studentName)
  .replace(/\{\{fecha\}\}/g, dateLabel);
```

`templateService.load()` is already awaited in `ngOnInit` (feature #20 shipped it in anticipation of
this migration) — no change needed there.

## `NotificationTemplateService` / `profile-dialog.component.ts` changes

`DEFAULT_TEMPLATES` gains:

```ts
citations:
  'Estimado apoderado, se ha registrado una citación para {{nombre}} el {{fecha}}. ' +
  'Por favor confirmar asistencia.',
```

(the exact string feature #20 hardcoded locally — reusing it verbatim as the fallback preserves
today's user-visible message for every institution that hasn't customized it yet).

`NOTIFICATION_TEMPLATE_SECTIONS` gains, after the existing `absences` entry:

```ts
{
  actionKey: 'citations',
  label: 'Citaciones (WhatsApp)',
  description:
    'Se usa al notificar por WhatsApp a un representante sobre una citación agendada. Es personal — solo aplica a tu cuenta.',
  placeholders: ['{{nombre}}', '{{fecha}}'],
  previewSample: { nombre: 'JUAN PÉREZ', fecha: '2026-06-17 a las 10:00' },
},
```

No backend change: `NOTIFICATION_ACTION_KEYS` (`backend/src/services/user.service.ts`) already
includes `'citations'`, so `PUT /api/notification-templates` with `actionKey: 'citations'` is already
accepted.

## Exceptions / error paths

- `GET /api/citation-reasons` failure (dialog open) → `NotificationService.error`; `reasons` stays
  `[]` — the multi-select renders with no options rather than a perpetual spinner (there is no
  spinner state for this fetch, consistent with how `AdminComponent` handles the same endpoint's
  failure — `.catch(() => [])`).
- Save (`POST`/`PUT`, R22) failure → `NotificationService.error`, dialog stays open, `saving` reset to
  `false` so the user can retry or fix input.
- Attachment upload failure after retries (R23) → `NotificationService.warning`, dialog still closes
  with `true` — the citation record itself was saved successfully; losing evidence is a degraded but
  non-fatal outcome, and retrying the whole save would risk creating a duplicate citation.
- Close confirmation cancelled/dismissed (R31) → pure no-op, no notification needed (nothing happened).
- Close (`PUT .../close`, R33) failure → `NotificationService.error`, dialog stays open. A `409`
  (already closed — race with another tab) surfaces via this same path since the backend's error
  message is forwarded through `err?.error?.error`.

## Discarded alternatives

1. **Fetch pending citations via `GET /api/citations?enrollment_id=<id>&status=pending`** when
   opening the create dialog, instead of reusing `row.citations` already loaded by `CitationsComponent`.
   Discarded: the roster response (backend R2) already returns every non-deleted citation per row —
   filtering that in-memory array client-side is exactly the reasoning feature #20's `design.md`
   already used for its own history dialog ("Discarded alternatives" #4); a second round-trip for
   data already in memory would be redundant.
2. **Display and allow deleting existing (already-uploaded) attachments in edit mode**, via `DELETE
   /api/citations/:id/attachments/:attachmentId`. Discarded for this feature: none of `GET
   /api/citations`'s response shapes (roster mode or pending-detection mode) include an `attachments`
   array on `Citation` — only `POST /api/citations/:id/attachments`'s own response includes the rows
   it just created. There is no endpoint to list a citation's existing attachments independently, so
   this dialog cannot know what to show without a new backend endpoint. A backend feature ("List
   existing attachments for a citation", Notion page `3d2def9a-37cd-818a-8acc-e0695e9a6cc0`, predicted
   name `list_existing_attachments_for_a_citation` in project `attendance_backend`) has been requested
   to add `GET /api/citations/:id/attachments` — it does not block this feature: `CitationDialogComponent`
   ships with upload-only evidence handling (new files, R12–R16/R21), and viewing/removing prior
   uploads becomes its own follow-up feature once that endpoint exists, rather than widening this
   feature's scope to a backend dependency that isn't ready yet.
3. ~~**Confirm "Cerrar citación" via a nested `ConfirmDialogComponent`.**~~ Adopted, not discarded —
   see "Cerrar citación confirmation" above (R29–R31). A single-click destructive action with no
   confirmation was flagged as a usability risk (accidentally closing a citation is not reversible from
   this dialog), so this feature introduces the codebase's first dialog-opens-dialog case rather than
   shipping a silent single click for the one action here that can't be undone.
4. **Keep `CITATION_WHATSAPP_TEMPLATE` local to `CitationsComponent`** (defer the
   `NotificationTemplateService` migration further). Discarded: feature #20's `design.md` explicitly
   scoped that migration to this feature ("Discarded alternatives" #1), and both halves of the
   machinery it depends on already exist (backend's `NOTIFICATION_ACTION_KEYS` whitelist,
   frontend's `NotificationTemplateService`/`DEFAULT_TEMPLATES`) — completing it now avoids leaving a
   known, previously-flagged TODO dangling past the feature that was supposed to close it.

## Visual direction

Per `docs/architecture.md`/`docs/conventions.md`, load the `frontend-design` skill before writing this
component's `template`/`styles`. Reuse existing primitives rather than inventing new ones: the
evidence zone/tiles copied from `JustificationCreateDialogComponent` (per conventions.md's homogeneity
rule), `mat-form-field appearance="outline"` throughout (matching every other dialog in this codebase),
the pending-citations banner styled as a compact warning block (background `#fef9c3`/text `#92400e` —
the same pending-pill palette `CitationsComponent` already uses, so a pending citation reads
consistently whether shown as a pill or inside this banner), the reason multi-select's per-option
badge reusing `citationReasonSeverityBadgeClass`'s existing `badge-J`/`badge-AT`/`badge-F` classes
(no new badge palette), and the close-confirmation dialog reusing `ConfirmDialogComponent` as-is (no
new styling — same look as every other destructive-action confirm in this app).
