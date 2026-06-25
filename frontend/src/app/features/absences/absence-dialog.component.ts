import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { firstValueFrom } from 'rxjs';
import { Absence } from '../../core/models/index';
import { dateStringToDate, dateToDateString } from '../../shared/utils/date.util';
import { NotificationService } from '../../core/services/notification.service';

export interface AbsenceDialogData {
  absence: Absence;
  mode: 'view' | 'edit';
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatDatepickerModule],
  styles: [`
    :host { display: block; position: relative; }
    .detail-header { padding: 4px 0 16px; }
    .detail-name { font-family: 'Nunito', sans-serif; font-size: 17px; font-weight: 600; color: var(--ink); }
    .detail-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .field-row {
      padding: 12px 0; border-bottom: 1px solid var(--border-soft);
      display: flex; justify-content: space-between; gap: 12px;
    }
    .field-label { font-size: 13px; color: var(--muted); flex-shrink: 0; }
    .field-value { font-size: 13px; font-weight: 500; color: var(--ink-soft); text-align: right; }
  `],
  template: `
    <button mat-icon-button [mat-dialog-close]="undefined" style="position:absolute;top:8px;right:8px;color:var(--muted-strong)"><mat-icon>close</mat-icon></button>
    <mat-dialog-content>
      <div class="detail-header">
        <div class="detail-name">{{data.absence.studentName}}</div>
        <div class="detail-meta">{{data.absence.course}} · {{data.absence.academicYear}}</div>
        <div style="margin-top:8px">
          @if (data.absence.isJustified) { <span class="badge-J">Justificada</span> } @else { <span class="badge-gray">Pendiente</span> }
        </div>
      </div>

      @if (data.mode === 'view') {
        <div class="field-row"><span class="field-label">Fecha</span><span class="field-value">{{data.absence.date}}</span></div>
        <div class="field-row"><span class="field-label">Tipo</span><span class="field-value">{{data.absence.type === 'F' ? 'Falta' : 'Atrasado'}}</span></div>
        <div class="field-row"><span class="field-label">Notas</span><span class="field-value">{{data.absence.notes || '—'}}</span></div>
      } @else {
        <mat-form-field appearance="outline" style="width:100%;margin-top:8px">
          <mat-label>Fecha</mat-label>
          <input matInput [matDatepicker]="picker" [(ngModel)]="date">
          <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
          <mat-datepicker #picker></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Tipo</mat-label>
          <mat-select [(ngModel)]="type">
            <mat-option value="F">Falta</mat-option>
            <mat-option value="AT">Atrasado</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Notas</mat-label>
          <input matInput [(ngModel)]="notes">
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.mode === 'view') {
        <button mat-stroked-button [mat-dialog-close]="undefined">Cerrar</button>
      } @else {
        <button mat-stroked-button [mat-dialog-close]="undefined">Cancelar</button>
        <button mat-flat-button color="primary" [disabled]="saving() || !date" (click)="save()">
          <mat-icon>check</mat-icon> Guardar
        </button>
      }
    </mat-dialog-actions>
  `,
})
export class AbsenceDialogComponent {
  readonly dialogRef = inject(MatDialogRef<AbsenceDialogComponent, boolean | undefined>);
  readonly data: AbsenceDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);

  readonly saving = signal(false);

  date: Date | null = dateStringToDate(this.data.absence.date);
  type: 'F' | 'AT' = this.data.absence.type;
  notes = this.data.absence.notes ?? '';

  async save(): Promise<void> {
    if (!this.date) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.http.put(`/api/absences/${this.data.absence.id}`, {
        date: dateToDateString(this.date),
        type: this.type,
        notes: this.notes,
      }));
      this.notify.success('Inasistencia actualizada');
      this.dialogRef.close(true);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo guardar');
    } finally {
      this.saving.set(false);
    }
  }
}
