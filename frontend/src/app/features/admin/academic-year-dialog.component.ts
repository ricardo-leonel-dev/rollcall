import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { AcademicYear } from '../../core/models/index';
import { dateStringToDate, dateToDateString } from '../../shared/utils/date.util';

export interface AcademicYearDialogResult {
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export interface AcademicYearDialogData {
  mode: 'create' | 'edit';
  year?: AcademicYear;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDatepickerModule],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">{{data.mode === 'edit' ? 'Editar año lectivo' : 'Nuevo año lectivo'}}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" style="width:100%;margin-top:4px">
        <mat-label>Nombre (ej: 2026-2027)</mat-label>
        <input matInput [(ngModel)]="name">
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Fecha inicio</mat-label>
        <input matInput [matDatepicker]="pickerStart" [(ngModel)]="startDate">
        <mat-datepicker-toggle matIconSuffix [for]="pickerStart"></mat-datepicker-toggle>
        <mat-datepicker #pickerStart></mat-datepicker>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Fecha fin</mat-label>
        <input matInput [matDatepicker]="pickerEnd" [(ngModel)]="endDate">
        <mat-datepicker-toggle matIconSuffix [for]="pickerEnd"></mat-datepicker-toggle>
        <mat-datepicker #pickerEnd></mat-datepicker>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="!name">
        {{data.mode === 'edit' ? 'Guardar' : 'Crear'}}
      </button>
    </mat-dialog-actions>
  `,
})
export class AcademicYearDialogComponent {
  readonly dialogRef = inject(MatDialogRef<AcademicYearDialogComponent, AcademicYearDialogResult | false>);
  readonly data: AcademicYearDialogData = inject(MAT_DIALOG_DATA);

  name = this.data.year?.name ?? '';
  startDate: Date | null = this.data.year?.startDate ? dateStringToDate(this.data.year.startDate) : null;
  endDate: Date | null = this.data.year?.endDate ? dateStringToDate(this.data.year.endDate) : null;

  // Pure form: returns the proposed dates so the caller can validate against
  // quarters (and other invariants) before deciding to send the HTTP call.
  submit(): void {
    if (!this.name) return;
    this.dialogRef.close({
      name: this.name,
      startDate: this.startDate ? dateToDateString(this.startDate) : null,
      endDate: this.endDate ? dateToDateString(this.endDate) : null,
    });
  }
}
