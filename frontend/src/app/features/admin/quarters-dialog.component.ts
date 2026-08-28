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

type QuarterName = 'Primer Trimestre' | 'Segundo Trimestre' | 'Tercer Trimestre';
const ALL_NAMES: QuarterName[] = ['Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre'];

interface QuarterDraft {
  name: QuarterName;
  startDate: Date | null;
  endDate: Date | null;
  description: string;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDatepickerModule, MatIconModule],
  styles: [`
    :host { display: block; }
    .quarter-card {
      background: var(--paper-deep);
      border: 1px solid var(--border-soft);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .quarter-card.invalid { border-color: #fecaca; background: #fef2f2; }
    .quarter-title {
      font-family: 'Nunito', sans-serif;
      font-size: 15px; font-weight: 700;
      color: var(--ink);
      margin-bottom: 12px;
      display: flex; align-items: center; gap: 8px;
    }
    .invalid-msg {
      color: #b91c1c; font-size: 12px; margin-top: 8px;
      display: flex; align-items: center; gap: 4px;
    }
    .date-row { display: flex; gap: 12px; }
    .date-row mat-form-field { flex: 1; }
    .range-hint {
      font-size: 12px; color: var(--muted-strong);
      background: var(--paper); padding: 8px 12px;
      border-radius: 8px; margin-bottom: 16px;
      display: flex; align-items: center; gap: 6px;
    }
    @media (max-width: 600px) {
      .date-row { flex-direction: column; gap: 0; }
    }
  `],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">
      Configurar trimestres
      <span style="font-size:13px;color:var(--muted-strong);font-weight:500;margin-left:8px">
        {{data.academicYear.name}}
      </span>
    </h2>
    <mat-dialog-content>
      <div class="range-hint">
        <mat-icon style="font-size:16px;width:16px;height:16px;color:var(--accent)">info</mat-icon>
        Rango del año lectivo: {{data.academicYear.startDate ?? '—'}} → {{data.academicYear.endDate ?? '—'}}
      </div>

      @for (draft of drafts(); track draft.name) {
        <div class="quarter-card" [class.invalid]="validationErrors().get(draft.name)">
          <div class="quarter-title">
            <span style="color:var(--accent)">{{$index + 1}}.</span> {{draft.name}}
          </div>
          <div class="date-row">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Fecha inicio</mat-label>
              <input matInput [matDatepicker]="pickerStart" [(ngModel)]="draft.startDate">
              <mat-datepicker-toggle matIconSuffix [for]="pickerStart"></mat-datepicker-toggle>
              <mat-datepicker #pickerStart></mat-datepicker>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Fecha fin</mat-label>
              <input matInput [matDatepicker]="pickerEnd" [(ngModel)]="draft.endDate">
              <mat-datepicker-toggle matIconSuffix [for]="pickerEnd"></mat-datepicker-toggle>
              <mat-datepicker #pickerEnd></mat-datepicker>
            </mat-form-field>
          </div>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:100%;margin-top:4px">
            <mat-label>Descripción (opcional)</mat-label>
            <input matInput [(ngModel)]="draft.description">
          </mat-form-field>
          @if (validationErrors().get(draft.name); as err) {
            <div class="invalid-msg">
              <mat-icon style="font-size:16px;width:16px;height:16px">error_outline</mat-icon>
              {{err}}
            </div>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)">Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!isValid() || saving()">
        Guardar trimestres
      </button>
    </mat-dialog-actions>
  `,
})
export class QuartersDialogComponent {
  readonly dialogRef = inject(MatDialogRef<QuartersDialogComponent, boolean>);
  readonly data: QuartersDialogData = inject(MAT_DIALOG_DATA);
  private readonly quarterService = inject(QuarterService);
  private readonly notify = inject(NotificationService);

  readonly drafts = signal<QuarterDraft[]>(this.buildDrafts());
  readonly saving = signal(false);

  readonly validationErrors = computed<Map<QuarterName, string>>(() => {
    const errs = new Map<QuarterName, string>();
    const items = this.drafts();

    for (const q of items) {
      if (q.startDate && q.endDate && q.startDate.getTime() > q.endDate.getTime()) {
        errs.set(q.name, 'La fecha de inicio debe ser anterior a la fecha de fin.');
        continue;
      }
      if (this.data.academicYear.startDate) {
        const ayStart = dateStringToDate(this.data.academicYear.startDate)!;
        if (q.startDate && q.startDate.getTime() < ayStart.getTime()) {
          errs.set(q.name, `La fecha de inicio está antes del inicio del año lectivo (${this.data.academicYear.startDate}).`);
          continue;
        }
        if (q.endDate && q.endDate.getTime() < ayStart.getTime()) {
          errs.set(q.name, `La fecha de fin está antes del inicio del año lectivo (${this.data.academicYear.startDate}).`);
          continue;
        }
      }
      if (this.data.academicYear.endDate) {
        const ayEnd = dateStringToDate(this.data.academicYear.endDate)!;
        if (q.endDate && q.endDate.getTime() > ayEnd.getTime()) {
          errs.set(q.name, `La fecha de fin está después del fin del año lectivo (${this.data.academicYear.endDate}).`);
          continue;
        }
        if (q.startDate && q.startDate.getTime() > ayEnd.getTime()) {
          errs.set(q.name, `La fecha de inicio está después del fin del año lectivo (${this.data.academicYear.endDate}).`);
          continue;
        }
      }
    }

    const withBoth = items.filter(q => q.startDate && q.endDate) as QuarterDraft[];
    for (let i = 0; i < withBoth.length; i++) {
      for (let j = i + 1; j < withBoth.length; j++) {
        const a = withBoth[i];
        const b = withBoth[j];
        if (!(a.endDate!.getTime() < b.startDate!.getTime() || a.startDate!.getTime() > b.endDate!.getTime())) {
          const msg = `Las fechas se solapan con ${b.name}.`;
          if (!errs.has(a.name)) errs.set(a.name, msg);
          if (!errs.has(b.name)) errs.set(b.name, msg);
        }
      }
    }

    return errs;
  });

  readonly isValid = computed(() => this.validationErrors().size === 0);

  private buildDrafts(): QuarterDraft[] {
    return ALL_NAMES.map(name => {
      const existing = this.data.existing.find(q => q.name === name);
      return {
        name,
        startDate: existing?.startDate ? dateStringToDate(existing.startDate) : null,
        endDate: existing?.endDate ? dateStringToDate(existing.endDate) : null,
        description: existing?.description ?? '',
      };
    });
  }

  private existingId(name: QuarterName): number | null {
    return this.data.existing.find(q => q.name === name)?.id ?? null;
  }

  async save(): Promise<void> {
    if (!this.isValid()) {
      this.notify.error('Corrige los errores antes de guardar.');
      return;
    }
    this.saving.set(true);
    try {
      for (const draft of this.drafts()) {
        const body = {
          startDate: draft.startDate ? dateToDateString(draft.startDate) : null,
          endDate: draft.endDate ? dateToDateString(draft.endDate) : null,
          description: draft.description.trim() || null,
        };
        const id = this.existingId(draft.name);
        if (id !== null) {
          await this.quarterService.update(id, body);
        } else {
          await this.quarterService.create({ name: draft.name, ...body });
        }
      }
      this.notify.success('Trimestres actualizados');
      this.dialogRef.close(true);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'Error al guardar los trimestres');
    } finally {
      this.saving.set(false);
    }
  }
}
