import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { Course } from '../../core/models/index';

export interface CourseDialogData {
  mode: 'create' | 'edit';
  course?: Course;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatSnackBarModule],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">{{data.mode === 'edit' ? 'Editar curso' : 'Nuevo curso'}}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" style="width:100%;margin-top:4px">
        <mat-label>Nombre del curso</mat-label>
        <input matInput [(ngModel)]="name" placeholder="Ej: OCTAVO A BÁSICA SUPERIOR">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)">Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!name || saving()">
        {{data.mode === 'edit' ? 'Guardar' : 'Crear'}}
      </button>
    </mat-dialog-actions>
  `,
})
export class CourseDialogComponent {
  readonly dialogRef = inject(MatDialogRef<CourseDialogComponent, boolean>);
  readonly data: CourseDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  name = this.data.course?.name ?? '';
  readonly saving = signal(false);

  async save(): Promise<void> {
    if (!this.name) return;
    this.saving.set(true);
    try {
      if (this.data.mode === 'edit') {
        await firstValueFrom(this.http.put(`/api/courses/${this.data.course!.id}`, { name: this.name }));
        this.snack.open('Curso actualizado', '', { duration: 2000 });
      } else {
        await firstValueFrom(this.http.post('/api/courses', { name: this.name }));
        this.snack.open('Curso creado', '', { duration: 2000 });
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.snack.open(err?.error?.error ?? 'Error al guardar', '', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
