import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { Absence } from '../../core/models/index';
import { dateStringToDate, dateToDateString } from '../../shared/utils/date.util';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule, MatIconModule,
    MatFormFieldModule, MatSelectModule, MatInputModule, MatDatepickerModule,
    RouterLink,
  ],
  styles: [`
    .edit-card { max-width: 560px; margin: 0 auto; }
    .readonly-row {
      display: grid; grid-template-columns: 110px 1fr; gap: 12px;
      padding: 10px 0; border-bottom: 1px solid var(--border-soft);
      align-items: center;
    }
    .readonly-row:last-of-type { border-bottom: none; }
    .readonly-label { font-size: 13px; color: var(--muted); }
    .readonly-value { font-size: 14px; font-weight: 500; color: var(--ink-soft); }
    .form-row { margin-top: 18px; }
    .form-row mat-form-field { width: 100%; }
    .actions {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      margin-top: 22px; padding-top: 16px;
      border-top: 1px solid var(--border-soft);
    }
    .actions .spacer { flex: 1; }
    .back-link {
      display: inline-flex; align-items: center; gap: 6px;
      color: var(--accent); font-weight: 600; cursor: pointer; text-decoration: none;
    }
    .back-link:hover { text-decoration: underline; }
    .not-found-body { color: var(--muted); max-width: 360px; text-align: center; }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Editar inasistencia</h1>
    </div>

    @if (state() === 'loading') {
      <div class="spinner-center" style="height:200px">
        <div style="text-align:center">
          <div class="spinner" style="margin:0 auto 12px"></div>
          <div style="font-size:13px;color:var(--muted)">Cargando inasistencia…</div>
        </div>
      </div>
    } @else if (state() === 'not-found') {
      <div class="empty-state card edit-card">
        <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">search_off</mat-icon>
        <div style="font-weight:600;color:var(--ink-soft)">No se pudo cargar esta inasistencia</div>
        <div class="not-found-body" style="margin-top:6px">
          Puede que ya haya sido eliminada o que el enlace no sea válido.
        </div>
        <a class="back-link" [routerLink]="returnTo" style="margin-top:18px">
          <mat-icon style="font-size:16px;width:16px;height:16px">arrow_back</mat-icon>
          Volver al listado
        </a>
      </div>
    } @else if (absence) {
      <div class="card edit-card">
        <div class="readonly-row">
          <span class="readonly-label">Estudiante</span>
          <span class="readonly-value">{{ absence.studentName }}</span>
        </div>
        <div class="readonly-row">
          <span class="readonly-label">Curso</span>
          <span class="readonly-value">{{ absence.course }}</span>
        </div>
        <div class="readonly-row">
          <span class="readonly-label">Año lectivo</span>
          <span class="readonly-value">{{ absence.academicYear }}</span>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Fecha</mat-label>
            <input matInput [matDatepicker]="picker" [(ngModel)]="date">
            <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
            <mat-datepicker #picker></mat-datepicker>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Tipo</mat-label>
            <mat-select [(ngModel)]="type">
              <mat-option value="F">Falta</mat-option>
              <mat-option value="AT">Atrasado</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Notas</mat-label>
            <input matInput [(ngModel)]="notes">
          </mat-form-field>
        </div>

        <div class="actions">
          <button mat-stroked-button color="warn" [disabled]="saving()" (click)="confirmDelete()">
            <mat-icon>delete_outline</mat-icon> Eliminar inasistencia
          </button>
          <span class="spacer"></span>
          <button mat-stroked-button [disabled]="saving()" (click)="cancel()">
            Cancelar
          </button>
          <button mat-flat-button color="primary" [disabled]="saving() || !date" (click)="save()">
            <mat-icon>check</mat-icon> Guardar
          </button>
        </div>
      </div>
    }
  `,
})
export class AbsenceEditComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);

  readonly state = signal<'loading' | 'not-found' | 'ready'>('loading');
  readonly saving = signal(false);
  returnTo = '/inspectors/absences';
  absence: Absence | null = null;
  date: Date | null = null;
  type: 'F' | 'AT' = 'F';
  notes = '';

  private sanitizeSameOrigin(url: string): string {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.origin === window.location.origin ? url : '/inspectors/absences';
    } catch {
      return '/inspectors/absences';
    }
  }

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const enrollmentId = this.route.snapshot.queryParamMap.get('enrollmentId');
    const dateParam = this.route.snapshot.queryParamMap.get('date');
    const returnToParam = this.route.snapshot.queryParamMap.get('returnTo');
    if (returnToParam) this.returnTo = this.sanitizeSameOrigin(returnToParam);
    if (!id || !enrollmentId || !dateParam) {
      this.state.set('not-found');
      return;
    }
    try {
      const matches = await firstValueFrom(this.http.get<Absence[]>(
        `/api/absences?enrollment_id=${enrollmentId}&date_from=${dateParam}&date_to=${dateParam}`
      ));
      const found = matches.find(a => a.id === id) ?? null;
      if (!found) { this.state.set('not-found'); return; }
      this.absence = found;
      this.date = dateStringToDate(found.date);
      this.type = found.type;
      this.notes = found.notes ?? '';
      this.state.set('ready');
    } catch {
      this.state.set('not-found');
    }
  }

  async save(): Promise<void> {
    if (!this.absence || !this.date) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.http.put(`/api/absences/${this.absence.id}`, {
        date: dateToDateString(this.date),
        type: this.type,
        notes: this.notes,
      }));
      this.notify.success('Inasistencia actualizada');
      await this.router.navigateByUrl(this.returnTo);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo guardar');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDelete(): void {
    if (!this.absence) return;
    const isJustified = this.absence.isJustified;
    const message = isJustified
      ? 'Esta falta ya está justificada. Si la eliminas, también se quitará de esa justificación (y la justificación se eliminará si no le queda ninguna otra falta). Esta acción no se puede deshacer.'
      : '¿Eliminar esta inasistencia? Esta acción no se puede deshacer.';
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar inasistencia', message },
    }).afterClosed().subscribe(async ok => {
      if (!ok || !this.absence) return;
      this.saving.set(true);
      try {
        await firstValueFrom(this.http.delete(`/api/absences/${this.absence.id}`));
        this.notify.success('Inasistencia eliminada');
        await this.router.navigateByUrl(this.returnTo);
      } catch (err: any) {
        this.notify.error(err?.error?.error ?? 'No se pudo eliminar');
      } finally {
        this.saving.set(false);
      }
    });
  }

  cancel(): void {
    this.router.navigateByUrl(this.returnTo);
  }
}