import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { Role } from '../../core/models/index';

export interface RoleDialogData {
  mode: 'create' | 'edit';
  role?: Role;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatSnackBarModule],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">{{data.mode === 'edit' ? 'Editar rol' : 'Nuevo rol'}}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" style="width:100%;margin-top:4px">
        <mat-label>Nombre</mat-label>
        <input matInput [(ngModel)]="name" placeholder="Ej: inspector_bloque">
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Descripción (opcional)</mat-label>
        <input matInput [(ngModel)]="description">
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
export class RoleDialogComponent {
  readonly dialogRef = inject(MatDialogRef<RoleDialogComponent, Role | false>);
  readonly data: RoleDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  name = this.data.role?.name ?? '';
  description = this.data.role?.description ?? '';
  readonly saving = signal(false);

  async save(): Promise<void> {
    if (!this.name) return;
    this.saving.set(true);
    try {
      let saved: Role;
      if (this.data.mode === 'edit') {
        saved = await firstValueFrom(this.http.put<Role>(`/api/roles/${this.data.role!.id}`, { name: this.name, description: this.description || null }));
        this.snack.open('Rol actualizado', '', { duration: 2000 });
      } else {
        saved = await firstValueFrom(this.http.post<Role>('/api/roles', { name: this.name, description: this.description || null }));
        this.snack.open('Rol creado', '', { duration: 2000 });
      }
      this.dialogRef.close(saved);
    } catch (err: any) {
      this.snack.open(err?.error?.error ?? 'Error al guardar', '', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
