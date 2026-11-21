import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { firstValueFrom } from 'rxjs';
import { StatsVisibility, WithdrawalItem } from '../../core/models/index';
import { NotificationService } from '../../core/services/notification.service';
import {
  STATS_VISIBILITY_OPTIONS,
  withdrawalMutationErrorOutcome,
} from '../../shared/utils/withdrawal.util';

export interface WithdrawalVisibilityDialogData {
  item: WithdrawalItem;
}

export type WithdrawalVisibilityDialogResult = 'updated' | 'stale' | false;

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatRadioModule],
  styles: [`
    .section-label { font-size: 12px; font-weight: 700; color: var(--muted-strong); margin: 16px 0 6px; }
    .who-name { font-weight: 600; font-size: 15px; color: var(--ink); }
    .who-course { font-size: 13px; color: var(--ink-soft); margin-top: 2px; }

    .visibility-group { display: flex; flex-direction: column; gap: 8px; }
    .visibility-row {
      border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px;
      transition: border-color .15s ease, background-color .15s ease;
    }
    .visibility-row:hover { border-color: var(--muted); }
    .visibility-row.selected { border-color: var(--accent); background: var(--accent-soft); }
    .visibility-option { display: block; }
    .option-label { display: block; font-size: 14px; font-weight: 600; color: var(--ink); }
    .option-help { display: block; font-size: 12px; line-height: 1.4; color: var(--muted-strong); margin-top: 2px; }

    /* The radio circle sits on the first line of the option, next to its
       label, instead of floating in the middle of the two lines. */
    :host ::ng-deep .visibility-option .mat-internal-form-field { align-items: flex-start; }
    :host ::ng-deep .visibility-option .mdc-radio { margin-top: -10px; }
  `],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">Cambiar visibilidad</h2>
    <mat-dialog-content>
      <div class="who-name">{{data.item.studentName}}</div>
      <div class="who-course">{{data.item.courseName}} · {{data.item.academicYear}}</div>

      <div class="section-label">Visibilidad en reportes</div>
      <mat-radio-group class="visibility-group" [ngModel]="selected()" (ngModelChange)="selected.set($event)">
        @for (option of statsVisibilityOptions; track option.value) {
          <div class="visibility-row" [class.selected]="selected() === option.value">
            <mat-radio-button class="visibility-option" [value]="option.value">
              <span class="option-label">{{option.label}}</span>
              <span class="option-help">{{option.help}}</span>
            </mat-radio-button>
          </div>
        }
      </mat-radio-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [disabled]="saving()" (click)="dialogRef.close(false)">Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="!canSave()" (click)="save()">Guardar</button>
    </mat-dialog-actions>
  `,
})
export class WithdrawalVisibilityDialogComponent {
  readonly dialogRef = inject(MatDialogRef<WithdrawalVisibilityDialogComponent, WithdrawalVisibilityDialogResult>);
  readonly data: WithdrawalVisibilityDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);

  readonly statsVisibilityOptions = STATS_VISIBILITY_OPTIONS;
  readonly selected = signal<StatsVisibility>(this.data.item.statsVisibility);
  readonly saving = signal(false);

  readonly canSave = computed(() => !this.saving() && this.selected() !== this.data.item.statsVisibility);

  async save(): Promise<void> {
    if (!this.canSave()) return;

    this.saving.set(true);
    this.dialogRef.disableClose = true;
    try {
      await firstValueFrom(this.http.patch<WithdrawalItem>(
        `/api/student-withdrawals/${this.data.item.id}`,
        { statsVisibility: this.selected() },
      ));
      this.notify.success('Visibilidad actualizada');
      this.dialogRef.close('updated');
    } catch (err: unknown) {
      const outcome = withdrawalMutationErrorOutcome(err, 'No se pudo actualizar la visibilidad. Intenta nuevamente.');
      this.notify.error(outcome.message);
      if (outcome.closeAndReload) this.dialogRef.close('stale');
    } finally {
      this.dialogRef.disableClose = false;
      this.saving.set(false);
    }
  }
}
