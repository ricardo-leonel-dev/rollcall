import { Component, ChangeDetectionStrategy, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AbstractControl, FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatRadioModule } from '@angular/material/radio';
import { ErrorStateMatcher } from '@angular/material/core';
import { firstValueFrom } from 'rxjs';
import { AcademicYear, Enrollment, StatsVisibility, WithdrawalItem, WithdrawalReason } from '../../core/models/index';
import { NotificationService } from '../../core/services/notification.service';
import { dateStringToDate, dateToDateString } from '../../shared/utils/date.util';
import {
  STATS_VISIBILITY_OPTIONS,
  WITHDRAWAL_FORM_ERROR_MESSAGES,
  buildWithdrawalPayload,
  formatWithdrawalDate,
  validateWithdrawalForm,
  withdrawalDateBounds,
  withdrawalDateRequired,
  withdrawalErrorOutcome,
} from '../../shared/utils/withdrawal.util';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

// Material only shows the message of a field while its control is in an error
// state, and by default that waits for the user to leave the field. The date
// has to explain itself as soon as it is empty, so the error state follows
// the message: the field turns red exactly when it has something to say.
class WithdrawalDateErrorState implements ErrorStateMatcher {
  constructor(private readonly hasMessage: () => boolean) {}

  isErrorState(control: AbstractControl | null): boolean {
    return !!control && control.invalid && this.hasMessage();
  }
}

export interface StudentWithdrawDialogData {
  enrollment: Enrollment;
  year: AcademicYear | null;
}

export type StudentWithdrawDialogResult = 'withdrawn' | 'stale' | false;

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatRadioModule,
  ],
  styles: [`
    mat-form-field { width: 100%; }
    .section-label { font-size: 12px; font-weight: 700; color: var(--muted-strong); margin-bottom: 6px; }
    .who-name { font-weight: 600; font-size: 15px; color: var(--ink); }
    .who-course { font-size: 13px; color: var(--ink-soft); margin-top: 2px; }
    .notes-counter { font-size: 11px; color: var(--muted); }

    .pending-banner {
      background: #fef9c3; color: #92400e;
      border: 1px solid #fde68a; border-radius: 10px;
      padding: 10px 14px; margin-bottom: 14px; font-size: 13px;
    }

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
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">Retirar estudiante</h2>
    <mat-dialog-content>
      <div class="who-name">{{data.enrollment.fullName}}</div>
      <div class="who-course">{{data.enrollment.course}} · {{data.enrollment.academicYear}}</div>

      @if (yearNotStarted()) {
        <div class="pending-banner" style="margin-top:14px">El año lectivo aún no ha comenzado.</div>
      }

      @if (reasonsState() === 'error') {
        <div class="pending-banner" style="margin-top:14px">No se pudieron cargar los motivos de retiro.</div>
      } @else if (reasonsState() === 'ready' && !reasons().length) {
        <div class="pending-banner" style="margin-top:14px">No hay motivos de retiro activos. Un administrador puede registrarlos en Administración > Motivos de retiro.</div>
      }

      <mat-form-field appearance="outline" style="margin-top:14px">
        <mat-label>Fecha de retiro</mat-label>
        <input matInput [matDatepicker]="picker" [ngModel]="date()" (ngModelChange)="date.set($event)"
               [min]="minDate()" [max]="maxDate()" [required]="dateRequired()"
               [errorStateMatcher]="dateErrorState">
        <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
        <mat-datepicker #picker></mat-datepicker>
        @if (dateError()) { <mat-error>{{ dateError() }}</mat-error> }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Motivo</mat-label>
        <mat-select [ngModel]="reasonId()" (ngModelChange)="reasonId.set($event)" required>
          @for (r of reasons(); track r.id) {
            <mat-option [value]="r.id">{{r.name}}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Observaciones</mat-label>
        <textarea matInput rows="3" maxlength="1000" placeholder="Opcional"
                  [ngModel]="notes()" (ngModelChange)="notes.set($event)"></textarea>
        <mat-hint align="end" class="notes-counter">{{ notes().length }}/1000</mat-hint>
        @if (notesError()) { <mat-error>{{ notesError() }}</mat-error> }
      </mat-form-field>

      <div class="section-label">Visibilidad en reportes</div>
      <mat-radio-group class="visibility-group" [ngModel]="statsVisibility()" (ngModelChange)="statsVisibility.set($event)">
        @for (option of statsVisibilityOptions; track option.value) {
          <div class="visibility-row" [class.selected]="statsVisibility() === option.value">
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
      <button mat-flat-button color="warn" [disabled]="!canSubmit()" (click)="submit()">Retirar</button>
    </mat-dialog-actions>
  `,
})
export class StudentWithdrawDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<StudentWithdrawDialogComponent, StudentWithdrawDialogResult>);
  readonly data: StudentWithdrawDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  readonly today = dateToDateString(new Date());
  readonly bounds = withdrawalDateBounds(this.today, this.data.year);
  readonly statsVisibilityOptions = STATS_VISIBILITY_OPTIONS;

  readonly reasons = signal<WithdrawalReason[]>([]);
  readonly reasonsState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly date = signal<Date | null>(dateStringToDate(this.bounds.defaultDate));
  readonly reasonId = signal<number | null>(null);
  readonly notes = signal('');
  readonly statsVisibility = signal<StatsVisibility>('until_withdrawal');
  readonly saving = signal(false);

  readonly minDate = computed(() => dateStringToDate(this.bounds.min));
  readonly maxDate = computed(() => dateStringToDate(this.bounds.max));
  readonly dateRequired = computed(() => withdrawalDateRequired(this.bounds));

  readonly formError = computed(() => validateWithdrawalForm({
    date: this.date() ? dateToDateString(this.date()) : null,
    reasonId: this.reasonId(),
    notes: this.notes(),
    statsVisibility: this.statsVisibility(),
  }, this.bounds, this.today));

  readonly yearNotStarted = computed(() => this.formError() === 'year_not_started');

  readonly dateError = computed(() => {
    const code = this.formError();
    if (!code || code === 'year_not_started' || code === 'reason_required' || code === 'notes_too_long') {
      return null;
    }
    return WITHDRAWAL_FORM_ERROR_MESSAGES[code];
  });

  readonly dateErrorState = new WithdrawalDateErrorState(() => this.dateError() !== null);

  readonly notesError = computed(() => {
    const code = this.formError();
    return code === 'notes_too_long' ? WITHDRAWAL_FORM_ERROR_MESSAGES.notes_too_long : null;
  });

  readonly canSubmit = computed(() =>
    !this.formError()
    && !this.saving()
    && this.reasonsState() === 'ready'
    && this.reasons().length > 0,
  );

  async ngOnInit(): Promise<void> {
    await this.loadReasons();
  }

  // A failed request is shown inside the dialog: the user can still cancel
  // and nothing was attempted yet.
  private async loadReasons(): Promise<void> {
    this.reasonsState.set('loading');
    try {
      const rows = await firstValueFrom(this.http.get<WithdrawalReason[]>('/api/withdrawal-reasons'));
      this.reasons.set(rows.filter(r => r.isActive));
      this.reasonsState.set('ready');
    } catch {
      this.reasons.set([]);
      this.reasonsState.set('error');
    }
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;

    const dateStr = dateToDateString(this.date());
    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Retirar estudiante',
        message: `¿Retirar a ${this.data.enrollment.fullName} de ${this.data.enrollment.course} con fecha ${formatWithdrawalDate(dateStr)}? Dejará de aparecer en la nómina y sus registros se mostrarán según la visibilidad elegida.`,
        confirmLabel: 'Retirar',
        icon: 'person_remove',
      },
    }).afterClosed());
    if (!confirmed) return;

    this.saving.set(true);
    this.dialogRef.disableClose = true;
    try {
      const payload = buildWithdrawalPayload(this.data.enrollment.enrollmentId, {
        date: dateStr,
        reasonId: this.reasonId(),
        notes: this.notes(),
        statsVisibility: this.statsVisibility(),
      });
      await firstValueFrom(this.http.post<WithdrawalItem>('/api/student-withdrawals', payload));
      this.notify.success('Estudiante retirado');
      this.dialogRef.close('withdrawn');
    } catch (err: unknown) {
      const outcome = withdrawalErrorOutcome(err);
      this.notify.error(outcome.message);
      if (outcome.closeAndReload) this.dialogRef.close('stale');
    } finally {
      this.dialogRef.disableClose = false;
      this.saving.set(false);
    }
  }
}
