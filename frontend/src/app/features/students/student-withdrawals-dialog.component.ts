import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { WithdrawalItem } from '../../core/models/index';
import {
  WITHDRAWAL_RECORD_ERROR,
  formatRevertedDate,
  formatWithdrawalDate,
  statsVisibilityLabel,
  withdrawnByName,
} from '../../shared/utils/withdrawal.util';

export interface StudentWithdrawalsDialogData {
  studentId: number;
  studentName: string;
}

// The record of a student drawn as a ledger: every withdrawal is an entry on
// a ruled line, with the stamp of its state on the right.
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  styles: [`
    :host { display: block; }
    .ledger { display: flex; flex-direction: column; }
    .entry { padding: 14px 0; border-bottom: 1px dashed var(--border); }
    .entry:last-child { border-bottom: none; padding-bottom: 4px; }
    .entry-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .entry-date { font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 15px; color: var(--ink); }
    .entry-line { font-size: 13px; color: var(--ink-soft); margin-top: 5px; }
    .entry-notes { font-size: 13px; font-style: italic; color: var(--ink-soft); margin-top: 5px; }
    .entry-meta { font-size: 11px; color: var(--muted); margin-top: 7px; }
    .record-empty, .record-error { font-size: 13px; color: var(--muted); padding: 24px 0; text-align: center; }
    .record-error { color: #b91c1c; }
  `],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">Retiros de {{data.studentName}}</h2>
    <mat-dialog-content>
      @if (loading()) {
        <div class="spinner-center" style="padding:40px 0"><div class="spinner"></div></div>
      } @else if (error()) {
        <div class="record-error">{{error()}}</div>
      } @else if (!items().length) {
        <div class="record-empty">Sin retiros registrados</div>
      } @else {
        <div class="ledger">
          @for (item of items(); track item.id) {
            <div class="entry">
              <div class="entry-head">
                <div class="entry-date">{{formatWithdrawalDate(item.withdrawalDate)}}</div>
                @if (item.revertedAt) {
                  <span class="stamp stamp-j">Reincorporado</span>
                } @else {
                  <span class="stamp" style="color:#475569;background:rgba(100,116,139,.08)">Retirado</span>
                }
              </div>
              <div class="entry-line">{{item.courseName}} · {{item.academicYear}}</div>
              <div class="entry-line">Motivo: {{item.reason.name}}</div>
              <div class="entry-line">Visibilidad: {{visibilityLabel(item)}}</div>
              @if (item.notes) {
                <div class="entry-notes">{{item.notes}}</div>
              }
              <div class="entry-meta">
                <span>Registrado por {{withdrawnBy(item)}}</span>
                @if (item.revertedAt) {
                  <span> · Reincorporado el {{formatRevertedDate(item.revertedAt)}}@if (item.revertedBy?.fullName) { por {{item.revertedBy?.fullName}} }</span>
                }
              </div>
            </div>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" (click)="dialogRef.close()">Cerrar</button>
    </mat-dialog-actions>
  `,
})
export class StudentWithdrawalsDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<StudentWithdrawalsDialogComponent>);
  readonly data: StudentWithdrawalsDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);

  readonly items = signal<WithdrawalItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly formatWithdrawalDate = formatWithdrawalDate;
  readonly formatRevertedDate = formatRevertedDate;

  async ngOnInit(): Promise<void> {
    try {
      const rows = await firstValueFrom(
        this.http.get<WithdrawalItem[]>(`/api/student-withdrawals/students/${this.data.studentId}/history`),
      );
      this.items.set(rows);
    } catch {
      this.error.set(WITHDRAWAL_RECORD_ERROR);
    } finally {
      this.loading.set(false);
    }
  }

  visibilityLabel(item: WithdrawalItem): string {
    return statsVisibilityLabel(item.statsVisibility);
  }

  withdrawnBy(item: WithdrawalItem): string {
    return withdrawnByName(item);
  }
}
