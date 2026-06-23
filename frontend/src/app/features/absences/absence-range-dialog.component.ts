import { Component, ChangeDetectionStrategy, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { dateToDateString } from '../../shared/utils/date.util';

export interface AbsenceRangeDialogData {
  fullName: string;
  type: 'F' | 'AT';
}

export interface AbsenceRangeDialogResult {
  dateFrom: string;
  dateTo: string;
  notes: string;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatDatepickerModule],
  template: `
    <h2 mat-dialog-title>{{data.type === 'F' ? 'Agregar falta' : 'Agregar atraso'}}</h2>
    <div mat-dialog-content>
      <div style="font-size:13px;color:var(--muted-strong);margin-bottom:16px">{{data.fullName}}</div>
      <mat-form-field appearance="outline" style="width:100%;margin-bottom:8px">
        <mat-label>Desde</mat-label>
        <input matInput [matDatepicker]="pickerFrom" [(ngModel)]="dateFrom">
        <mat-datepicker-toggle matIconSuffix [for]="pickerFrom"></mat-datepicker-toggle>
        <mat-datepicker #pickerFrom></mat-datepicker>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%;margin-bottom:8px">
        <mat-label>Hasta</mat-label>
        <input matInput [matDatepicker]="pickerTo" [(ngModel)]="dateTo">
        <mat-datepicker-toggle matIconSuffix [for]="pickerTo"></mat-datepicker-toggle>
        <mat-datepicker #pickerTo></mat-datepicker>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Motivo (opcional)</mat-label>
        <input matInput [(ngModel)]="notes">
      </mat-form-field>
    </div>
    <mat-dialog-actions align="end">
      <button mat-stroked-button [mat-dialog-close]="undefined">Cancelar</button>
      <button mat-flat-button color="primary" (click)="confirm()">
        <mat-icon>check</mat-icon> Confirmar
      </button>
    </mat-dialog-actions>
  `,
})
export class AbsenceRangeDialogComponent {
  dateFrom: Date | null;
  dateTo: Date | null;
  notes = '';

  constructor(
    public dialogRef: MatDialogRef<AbsenceRangeDialogComponent, AbsenceRangeDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: AbsenceRangeDialogData,
  ) {
    const today = new Date();
    this.dateFrom = today;
    this.dateTo = today;
  }

  confirm(): void {
    this.dialogRef.close({
      dateFrom: dateToDateString(this.dateFrom),
      dateTo: dateToDateString(this.dateTo),
      notes: this.notes,
    });
  }
}
