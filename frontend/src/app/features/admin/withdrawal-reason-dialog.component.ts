import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';
import { WithdrawalReason } from '../../core/models/index';
import { NotificationService } from '../../core/services/notification.service';

export interface WithdrawalReasonDialogData {
  mode: 'create' | 'edit';
  reason?: WithdrawalReason;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">{{data.mode === 'edit' ? 'Editar motivo de retiro' : 'Nuevo motivo de retiro'}}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" style="width:100%;margin-top:4px">
        <mat-label>Nombre</mat-label>
        <input matInput [(ngModel)]="name" maxlength="150" placeholder="Ej: Cambio de domicilio">
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Descripción</mat-label>
        <textarea matInput rows="3" [(ngModel)]="description" placeholder="Opcional"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)">Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()"
              [disabled]="!name.trim() || name.trim().length > 150 || saving()">
        {{data.mode === 'edit' ? 'Guardar' : 'Crear'}}
      </button>
    </mat-dialog-actions>
  `,
})
export class WithdrawalReasonDialogComponent {
  readonly dialogRef = inject(MatDialogRef<WithdrawalReasonDialogComponent, boolean>);
  readonly data: WithdrawalReasonDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);

  name = this.data.reason?.name ?? '';
  description = this.data.reason?.description ?? '';
  readonly saving = signal(false);

  async save(): Promise<void> {
    const name = this.name.trim();
    if (!name || name.length > 150) return;
    this.saving.set(true);
    const payload = { name, description: this.description.trim() || null };
    try {
      if (this.data.mode === 'edit') {
        await firstValueFrom(this.http.put(`/api/withdrawal-reasons/${this.data.reason!.id}`, payload));
        this.notify.success('Motivo de retiro actualizado');
      } else {
        await firstValueFrom(this.http.post('/api/withdrawal-reasons', payload));
        this.notify.success('Motivo de retiro creado');
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }
}
