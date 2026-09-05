import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Citation } from '../../core/models/index';

export interface CitationHistoryDialogData {
  studentName: string;
  citations: Citation[];
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  styles: [`
    :host { display: block; position: relative; padding: 20px 24px 24px; min-width: 360px; }
    .close-btn { position: absolute; top: 8px; right: 8px; color: var(--muted-strong); }
    .title { font-family: 'Nunito', sans-serif; font-size: 18px; font-weight: 700; color: var(--ink); margin: 0; }
    .subtitle { font-size: 13px; color: var(--muted); margin-top: 4px; }
    .history-list {
      margin-top: 16px; display: flex; flex-direction: column; gap: 8px;
      max-height: 60vh; overflow-y: auto;
    }
    .history-row {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      padding: 10px 12px; background: var(--paper-deep); border-radius: 10px;
    }
    .history-row-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .history-row-date { font-size: 13px; font-weight: 600; color: var(--ink-soft); }
    .history-row-time { font-size: 12px; color: var(--muted); }
    .history-row-obs { font-size: 12px; color: var(--muted-strong); white-space: pre-line; word-break: break-word; }
    .actions { display: flex; justify-content: flex-end; margin-top: 16px; }
  `],
  template: `
    <button mat-icon-button class="close-btn" [mat-dialog-close]="undefined"><mat-icon>close</mat-icon></button>
    <h2 class="title">Historial completo</h2>
    <div class="subtitle">{{data.studentName}}</div>

    @if (data.citations.length === 0) {
      <div class="empty-state" style="padding:32px">
        <mat-icon style="font-size:36px;width:36px;height:36px;color:var(--border)">history</mat-icon>
        <div style="margin-top:8px;color:var(--ink-soft)">Este estudiante no tiene citaciones registradas</div>
      </div>
    } @else {
      <div class="history-list">
        @for (c of data.citations; track c.id) {
          <div class="history-row">
            <div class="history-row-main">
              <div class="history-row-date">
                {{c.dateFrom === c.dateTo ? c.dateFrom : c.dateFrom + ' – ' + c.dateTo}}
                @if (c.time) { <span class="history-row-time"> · {{c.time}}</span> }
              </div>
              @if (c.observations) {
                <div class="history-row-obs">{{c.observations}}</div>
              }
            </div>
            @if (c.status === 'pending') {
              <span class="badge" style="background:#fef9c3;color:#92400e;flex-shrink:0">Pendiente</span>
            } @else {
              <span class="badge" style="background:#f1f5f9;color:#64748b;flex-shrink:0">Cerrada</span>
            }
          </div>
        }
      </div>
    }

    <div class="actions">
      <button mat-button [mat-dialog-close]="undefined">Cerrar</button>
    </div>
  `,
})
export class CitationHistoryDialogComponent {
  readonly dialogRef = inject(MatDialogRef<CitationHistoryDialogComponent>);
  readonly data: CitationHistoryDialogData = inject(MAT_DIALOG_DATA);
}
