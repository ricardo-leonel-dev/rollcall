import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { dateToDateString } from '../../shared/utils/date.util';
import { WhatsappIconComponent } from '../../shared/components/whatsapp-icon/whatsapp-icon.component';

export interface AbsenceSaveResultConflict {
  date: string;
  existingType: 'F' | 'AT';
}

export interface AbsenceSaveResultDialogData {
  created: number;
  createdDates: string[];
  conflicts: AbsenceSaveResultConflict[];
  idempotents: number;
  whatsappLink: string | null;
  fullName: string;
  dateLabel: string;
  type: 'F' | 'AT';
  course: string;
  onWhatsapp: () => void;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, WhatsappIconComponent],
  styles: [`
    :host { display: block; position: relative; padding: 20px 24px 8px; min-width: 360px; }
    .header {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding-bottom: 12px; border-bottom: 1px solid var(--border-soft);
    }
    .title-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .title-icon {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
      background: #dcfce7; color: #15803d;
    }
    .title-icon mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .title { font-family: 'Nunito', sans-serif; font-size: 17px; font-weight: 700; color: var(--ink); margin: 0; }
    .whatsapp-btn {
      display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
      background: #16a34a; color: #fff; border: none; border-radius: 8px;
      padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .section { padding: 14px 0 4px; border-bottom: 1px solid var(--border-soft); }
    .section:last-of-type { border-bottom: none; }
    .section-title {
      font-size: 13px; font-weight: 700; color: var(--ink-soft);
      display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
    }
    .section-title mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .section-title.conflict { color: #b45309; }
    .section-title.conflict mat-icon { color: #b45309; }
    .section-meta { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    .date-list { margin: 0; padding-left: 18px; font-size: 13px; color: var(--ink-soft); }
    .date-list li { padding: 2px 0; }
    .idempotent-line { font-size: 13px; color: var(--ink-soft); margin: 0; }
    .explanatory {
      font-size: 12px; color: var(--muted-strong); margin: 8px 0 0;
      line-height: 1.45;
    }
    .actions { display: flex; justify-content: flex-end; padding-top: 12px; }
  `],
  template: `
    <div class="header">
      <div class="title-row">
        <div class="title-icon"><mat-icon>check_circle</mat-icon></div>
        <p class="title">Inasistencias registradas</p>
      </div>
      @if (data.created > 0 && data.whatsappLink) {
        <button class="whatsapp-btn" (click)="onWhatsapp()">
          <app-whatsapp-icon [size]="16" />
          Enviar WhatsApp
        </button>
      }
    </div>

    <mat-dialog-content style="padding-top:4px">

      @if (data.created > 0) {
        <div class="section">
          <div class="section-title">
            <mat-icon>event_available</mat-icon>
            Creadas ({{ data.created }})
          </div>
          <div class="section-meta">{{ data.dateLabel }} · {{ data.fullName }} · {{ typeLabel(data.type) }} · {{ data.course }}</div>
          <ul class="date-list">
            @for (d of data.createdDates; track d) {
              <li>{{ formatDate(d) }}</li>
            }
          </ul>
        </div>
      }

      @if (data.conflicts.length > 0) {
        <div class="section">
          <div class="section-title conflict">
            <mat-icon>warning_amber</mat-icon>
            Conflictos ({{ data.conflicts.length }})
          </div>
          <ul class="date-list">
            @for (c of data.conflicts; track c.date) {
              <li>{{ formatDate(c.date) }} — ya registrado como {{ typeLabel(c.existingType) }}</li>
            }
          </ul>
          <p class="explanatory">Elimina primero la inasistencia existente en esa fecha para poder registrar la otra.</p>
        </div>
      }

      @if (data.idempotents > 0) {
        <div class="section">
          <div class="section-title">
            <mat-icon>check</mat-icon>
            Idempotentes
          </div>
          <p class="idempotent-line">{{ data.idempotents }} ya estaban registradas con el mismo tipo</p>
        </div>
      }

    </mat-dialog-content>

    <div class="actions">
      <button mat-stroked-button [mat-dialog-close]="true">Cerrar</button>
    </div>
  `,
})
export class AbsenceSaveResultDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<AbsenceSaveResultDialogComponent>);
  readonly data: AbsenceSaveResultDialogData = inject(MAT_DIALOG_DATA);

  typeLabel(type: 'F' | 'AT'): string {
    return type === 'F' ? 'Falta' : 'Atrasado';
  }

  formatDate(d: string): string {
    return dateToDateString(new Date(d + 'T00:00:00'));
  }

  onWhatsapp(): void {
    this.data.onWhatsapp();
    this.dialogRef.close();
  }
}