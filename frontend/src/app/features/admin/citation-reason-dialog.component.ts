import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';
import { CitationReason, CitationReasonSeverity } from '../../core/models/index';
import { NotificationService } from '../../core/services/notification.service';
import { CITATION_REASON_SEVERITY_OPTIONS } from '../../shared/utils/citation-reason.util';

export interface CitationReasonDialogData {
  mode: 'create' | 'edit';
  reason?: CitationReason;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">{{data.mode === 'edit' ? 'Editar motivo' : 'Nuevo motivo'}}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" style="width:100%;margin-top:4px">
        <mat-label>Nombre</mat-label>
        <input matInput [(ngModel)]="name" maxlength="150" placeholder="Ej: Atrasos reiterados">
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Severidad</mat-label>
        <mat-select [(ngModel)]="severity">
          @for (opt of severityOptions; track opt.value) {
            <mat-option [value]="opt.value">{{opt.label}}</mat-option>
          }
        </mat-select>
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
export class CitationReasonDialogComponent {
  readonly dialogRef = inject(MatDialogRef<CitationReasonDialogComponent, boolean>);
  readonly data: CitationReasonDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);

  readonly severityOptions = CITATION_REASON_SEVERITY_OPTIONS;

  name = this.data.reason?.name ?? '';
  severity: CitationReasonSeverity = this.data.reason?.severity ?? 'low';
  description = this.data.reason?.description ?? '';
  readonly saving = signal(false);

  async save(): Promise<void> {
    const name = this.name.trim();
    if (!name || name.length > 150) return;
    this.saving.set(true);
    const payload = { name, severity: this.severity, description: this.description.trim() || null };
    try {
      if (this.data.mode === 'edit') {
        await firstValueFrom(this.http.put(`/api/citation-reasons/${this.data.reason!.id}`, payload));
        this.notify.success('Motivo actualizado');
      } else {
        await firstValueFrom(this.http.post('/api/citation-reasons', payload));
        this.notify.success('Motivo creado');
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }
}
