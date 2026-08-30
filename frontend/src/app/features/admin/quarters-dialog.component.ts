import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { Quarter } from '../../core/models/index';
import { QuarterService } from '../../core/services/quarter.service';
import { NotificationService } from '../../core/services/notification.service';
import { dateStringToDate, dateToDateString } from '../../shared/utils/date.util';

export interface QuartersDialogData {
  academicYear: { id: number; name: string; startDate: string | null; endDate: string | null };
  existing: Quarter[];
}

export interface QuartersDialogResult {
  saved: boolean;
  quarters?: Quarter[];
}

interface QuarterDraft {
  localId: number;
  remoteId: number | null;
  name: string;
  sequenceNumber: number | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string;
  deleted: boolean;
}

let nextLocalId = 1;

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDatepickerModule, MatIconModule],
  styles: [`
    :host { display: block; }
    .quarter-card {
      background: var(--paper-deep);
      border: 1px solid var(--border-soft);
      border-left: 4px solid var(--accent);
      border-radius: var(--radius-md);
      padding: 16px;
      margin-bottom: 12px;
      animation: quarter-in 120ms ease-out;
    }
    @keyframes quarter-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .quarter-card.invalid { border-color: #fecaca; background: #fef2f2; border-left-color: var(--invalid-border-soft); }
    .quarter-card.server-error { box-shadow: 0 0 0 2px #b91c1c; }
    .quarter-card.server-error .quarter-server-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: 'Nunito', sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: var(--paper);
      background: #b91c1c;
      padding: 2px 8px;
      border-radius: 999px;
      margin-right: 8px;
    }
    .quarter-card.server-error .quarter-server-tag mat-icon {
      font-size: 13px;
      width: 13px;
      height: 13px;
    }
    .quarter-card.deleted { opacity: 0.55; }
    .quarter-card.deleted .quarter-card-body { text-decoration: line-through; }
    .quarter-card-body {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .quarter-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; margin-bottom: 12px;
    }
    .quarter-ordinal {
      font-family: 'Nunito', sans-serif;
      font-weight: 700; font-size: 20px;
      color: var(--accent);
      line-height: 1;
      flex-shrink: 0;
    }
    .quarter-title {
      font-family: 'Nunito', sans-serif;
      font-size: 15px; font-weight: 700;
      color: var(--ink);
      flex: 1;
    }
    .invalid-msg {
      color: #b91c1c; font-size: 12px; margin-top: 8px;
      display: flex; align-items: center; gap: 4px;
    }
    .date-row { display: flex; gap: 12px; }
    .date-row mat-form-field { flex: 1; }
    .range-hint {
      font-size: 12px; color: var(--muted-strong);
      background: var(--paper-deep); padding: 8px 12px;
      border-radius: var(--radius-sm); margin-bottom: 16px;
      display: flex; align-items: center; gap: 6px;
    }
    .add-row {
      display: flex; justify-content: flex-start;
      margin-bottom: 8px;
    }
    @media (max-width: 600px) {
      .date-row { flex-direction: column; gap: 0; }
    }
  `],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">
      Configurar períodos
      <span style="font-size:13px;color:var(--muted-strong);font-weight:500;margin-left:8px">
        {{data.academicYear.name}}
      </span>
    </h2>
    <mat-dialog-content>
      <div class="range-hint">
        <mat-icon style="font-size:16px;width:16px;height:16px;color:var(--accent)">info</mat-icon>
        Rango del año lectivo: {{data.academicYear.startDate ?? '—'}} → {{data.academicYear.endDate ?? '—'}}
      </div>

      <div class="add-row">
        <button mat-stroked-button type="button" (click)="addDraft()" style="font-size:13px">
          <mat-icon style="font-size:16px;width:16px;height:16px">add</mat-icon>
          Agregar período
        </button>
      </div>

      @for (draft of drafts(); track draft.localId; let i = $index) {
        <div class="quarter-card"
             [class.invalid]="validationErrors().get(draft.localId) && !draft.deleted"
             [class.server-error]="failingDraftId() === draft.localId && !draft.deleted"
             [class.deleted]="draft.deleted">
          <div class="quarter-header">
            <span class="quarter-ordinal">{{formatOrdinal(draft, i)}}</span>
            @if (failingDraftId() === draft.localId && !draft.deleted) {
              <span class="quarter-server-tag" title="Esta fila fue rechazada por el servidor">
                <mat-icon>error_outline</mat-icon>
                Error del servidor
              </span>
            }
            <span class="quarter-title">{{draft.name || 'Nuevo período'}}</span>
            <button mat-icon-button type="button"
                    style="color:var(--muted-strong)"
                    title="Quitar"
                    (click)="markDeleted(draft)">
              <mat-icon>delete_outline</mat-icon>
            </button>
          </div>
          <div class="quarter-card-body">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:100%">
              <mat-label>Nombre del período</mat-label>
              <input matInput [(ngModel)]="draft.name" [disabled]="draft.deleted"
                     (ngModelChange)="onDraftFieldChange(draft)">
            </mat-form-field>
            <div class="date-row">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Fecha inicio</mat-label>
                <input matInput [matDatepicker]="pickerStart" [(ngModel)]="draft.startDate" [disabled]="draft.deleted"
                       (ngModelChange)="onDraftFieldChange(draft)">
                <mat-datepicker-toggle matIconSuffix [for]="pickerStart"></mat-datepicker-toggle>
                <mat-datepicker #pickerStart></mat-datepicker>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Fecha fin</mat-label>
                <input matInput [matDatepicker]="pickerEnd" [(ngModel)]="draft.endDate" [disabled]="draft.deleted"
                       (ngModelChange)="onDraftFieldChange(draft)">
                <mat-datepicker-toggle matIconSuffix [for]="pickerEnd"></mat-datepicker-toggle>
                <mat-datepicker #pickerEnd></mat-datepicker>
              </mat-form-field>
            </div>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:100%">
              <mat-label>Descripción (opcional)</mat-label>
              <input matInput [(ngModel)]="draft.description" [disabled]="draft.deleted"
                     (ngModelChange)="onDraftFieldChange(draft)">
            </mat-form-field>
            @if (validationErrors().get(draft.localId); as err) {
              @if (!draft.deleted) {
                <div class="invalid-msg">
                  <mat-icon style="font-size:16px;width:16px;height:16px">error_outline</mat-icon>
                  {{err}}
                </div>
              }
            }
          </div>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close(cancelResult())">Cancelar</button>
      <button mat-flat-button color="primary" type="button" (click)="save()" [disabled]="!isValid() || saving()">
        Guardar períodos
      </button>
    </mat-dialog-actions>
  `,
})
export class QuartersDialogComponent {
  readonly dialogRef = inject(MatDialogRef<QuartersDialogComponent, QuartersDialogResult>);
  readonly data: QuartersDialogData = inject(MAT_DIALOG_DATA);
  private readonly quarterService = inject(QuarterService);
  private readonly notify = inject(NotificationService);

  readonly drafts = signal<QuarterDraft[]>(this.buildDrafts());
  readonly saving = signal(false);
  readonly failingDraftId = signal<number | null>(null);

  readonly validationErrors = computed<Map<number, string>>(() => {
    const errs = new Map<number, string>();
    const items = this.drafts();

    for (const q of items) {
      if (q.deleted) continue;
      if (!q.name.trim()) {
        errs.set(q.localId, 'El nombre del período no puede estar vacío.');
        continue;
      }
      if (q.name.trim().length > 60) {
        errs.set(q.localId, 'El nombre del período no puede superar 60 caracteres.');
        continue;
      }
      if (q.startDate && q.endDate && q.startDate.getTime() > q.endDate.getTime()) {
        errs.set(q.localId, 'La fecha de inicio debe ser anterior a la fecha de fin.');
        continue;
      }
      if (this.data.academicYear.startDate) {
        const ayStart = dateStringToDate(this.data.academicYear.startDate)!;
        if (q.startDate && q.startDate.getTime() < ayStart.getTime()) {
          errs.set(q.localId, `La fecha de inicio está antes del inicio del año lectivo (${this.data.academicYear.startDate}).`);
          continue;
        }
        if (q.endDate && q.endDate.getTime() < ayStart.getTime()) {
          errs.set(q.localId, `La fecha de fin está antes del inicio del año lectivo (${this.data.academicYear.startDate}).`);
          continue;
        }
      }
      if (this.data.academicYear.endDate) {
        const ayEnd = dateStringToDate(this.data.academicYear.endDate)!;
        if (q.endDate && q.endDate.getTime() > ayEnd.getTime()) {
          errs.set(q.localId, `La fecha de fin está después del fin del año lectivo (${this.data.academicYear.endDate}).`);
          continue;
        }
        if (q.startDate && q.startDate.getTime() > ayEnd.getTime()) {
          errs.set(q.localId, `La fecha de inicio está después del fin del año lectivo (${this.data.academicYear.endDate}).`);
          continue;
        }
      }
    }

    const withBoth = items.filter(q => !q.deleted && q.startDate && q.endDate) as QuarterDraft[];
    for (let i = 0; i < withBoth.length; i++) {
      for (let j = i + 1; j < withBoth.length; j++) {
        const a = withBoth[i];
        const b = withBoth[j];
        if (!(a.endDate!.getTime() < b.startDate!.getTime() || a.startDate!.getTime() > b.endDate!.getTime())) {
          const otherName = b.name.trim() || 'otro período';
          const msg = `Las fechas se solapan con ${otherName}.`;
          if (!errs.has(a.localId)) errs.set(a.localId, msg);
          if (!errs.has(b.localId)) errs.set(b.localId, msg);
        }
      }
    }

    return errs;
  });

  readonly isValid = computed(() => this.validationErrors().size === 0);

  formatOrdinal(draft: QuarterDraft, index: number): string {
    const seq = draft.sequenceNumber ?? (index + 1);
    return seq.toString().padStart(2, '0');
  }

  private buildDrafts(): QuarterDraft[] {
    if (!this.data.existing.length) {
      return [this.makeEmptyDraft()];
    }
    return this.data.existing
      .slice()
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      .map(q => ({
        localId: nextLocalId++,
        remoteId: q.id,
        name: q.name,
        sequenceNumber: q.sequenceNumber,
        startDate: q.startDate ? dateStringToDate(q.startDate) : null,
        endDate: q.endDate ? dateStringToDate(q.endDate) : null,
        description: q.description ?? '',
        deleted: false,
      }));
  }

  private makeEmptyDraft(): QuarterDraft {
    return {
      localId: nextLocalId++,
      remoteId: null,
      name: '',
      sequenceNumber: null,
      startDate: null,
      endDate: null,
      description: '',
      deleted: false,
    };
  }

  addDraft(): void {
    this.drafts.update(list => [...list, this.makeEmptyDraft()]);
  }

  markDeleted(draft: QuarterDraft): void {
    if (draft.remoteId === null) {
      this.drafts.update(list => list.filter(d => d.localId !== draft.localId));
      return;
    }
    this.drafts.update(list => list.map(d => d.localId === draft.localId ? { ...d, deleted: true } : d));
  }

  cancelResult(): QuartersDialogResult {
    return { saved: false };
  }

  async save(): Promise<void> {
    if (!this.isValid()) {
      this.notify.error('Corrige los errores antes de guardar.');
      return;
    }
    this.saving.set(true);
    this.failingDraftId.set(null);
    try {
      const list = this.drafts();

      for (const draft of list) {
        if (draft.deleted && draft.remoteId !== null) {
          this.failingDraftId.set(draft.localId);
          await this.quarterService.remove(draft.remoteId);
        }
      }

      const remaining = list
        .filter(d => !d.deleted)
        .slice()
        .sort((a, b) => {
          const sa = a.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
          const sb = b.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
          return sa - sb;
        });

      for (const draft of remaining) {
        const body = {
          name: draft.name.trim(),
          sequenceNumber: draft.sequenceNumber ?? undefined,
          startDate: draft.startDate ? dateToDateString(draft.startDate) : null,
          endDate: draft.endDate ? dateToDateString(draft.endDate) : null,
          description: draft.description.trim() || null,
        };
        this.failingDraftId.set(draft.localId);
        if (draft.remoteId === null) {
          await this.quarterService.create(body);
        } else {
          await this.quarterService.update(draft.remoteId, body);
        }
      }

      this.notify.success('Períodos actualizados.');
      this.dialogRef.close({ saved: true });
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'Error al guardar los períodos');
      // failingDraftId stays set to the failing draft's id — the row stays
      // highlighted (R12) until the user edits that row (`onDraftFieldChange`).
    } finally {
      this.saving.set(false);
    }
  }

  // Bound to (ngModelChange) on every editable draft field (name, startDate,
  // endDate, description). `[(ngModel)]="draft.xxx"` mutates `draft` in place
  // and never calls `drafts.set(...)`/`.update(...)`, so the `drafts` signal's
  // value never changes from Angular's point of view and `validationErrors()`
  // (a `computed()`) would otherwise never re-run after editing an existing
  // row. The `[...list]` copy below is a no-op in terms of content — it
  // exists purely to change the array reference and force `computed()` to
  // recompute over the (already mutated) draft objects.
  onDraftFieldChange(draft: QuarterDraft): void {
    this.drafts.update(list => [...list]);
    if (this.failingDraftId() === draft.localId) {
      this.failingDraftId.set(null);
    }
  }
}
