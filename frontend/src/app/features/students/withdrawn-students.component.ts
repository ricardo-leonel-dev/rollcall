import { Component, ChangeDetectionStrategy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { Course, RolePermission, WithdrawalItem, WithdrawalReason } from '../../core/models/index';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ChapterHeaderComponent } from '../../shared/components/chapter-header/chapter-header.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { NO_FLAGS, ResourceFlags, resolveResourcePermissions } from '../../shared/utils/permission.util';
import { dateToDateString } from '../../shared/utils/date.util';
import { StudentHistoryDialogComponent } from './student-history-dialog.component';
import { StudentWithdrawalsDialogComponent } from './student-withdrawals-dialog.component';
import { WithdrawalVisibilityDialogComponent } from './withdrawal-visibility-dialog.component';
import {
  WITHDRAWAL_STATUS_OPTIONS,
  WithdrawalListFilters,
  WithdrawalRowActions,
  WithdrawalStatusFilter,
  buildWithdrawalListQuery,
  filterWithdrawals,
  formatRevertedDate,
  formatWithdrawalDate,
  statsVisibilityLabel,
  withdrawalListErrorMessage,
  withdrawalMutationErrorOutcome,
  withdrawalRowActions,
  withdrawnByName,
} from '../../shared/utils/withdrawal.util';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatDatepickerModule,
    MatButtonModule, MatIconModule, MatMenuModule, MatDividerModule, ChapterHeaderComponent,
  ],
  template: `
    <app-chapter-header icon="person_off" eyebrowPrefix="Estudiantes" eyebrowSuffix="Registro de retiros" />

    <div class="page-header">
      <h1 class="page-title">Estudiantes retirados</h1>
    </div>

    <div class="filter-bar">
      <mat-form-field appearance="outline" style="width:170px">
        <mat-label>Estado</mat-label>
        <mat-select [ngModel]="status()" (ngModelChange)="onStatusChange($event)">
          @for (option of statusOptions; track option.value) {
            <mat-option [value]="option.value">{{option.label}}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" style="width:220px">
        <mat-label>Curso</mat-label>
        <mat-select [ngModel]="courseId()" (ngModelChange)="onCourseChange($event)">
          <mat-option [value]="null">Todos</mat-option>
          @for (course of courses(); track course.id) {
            <mat-option [value]="course.id">{{course.name}}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (reasons() !== null) {
        <mat-form-field appearance="outline" style="width:220px">
          <mat-label>Motivo</mat-label>
          <mat-select [ngModel]="reasonId()" (ngModelChange)="onReasonChange($event)">
            <mat-option [value]="null">Todos</mat-option>
            @for (reason of reasons(); track reason.id) {
              <mat-option [value]="reason.id">{{reason.name}}{{reason.isActive ? '' : ' (inactivo)'}}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }

      <mat-form-field appearance="outline" style="width:170px">
        <mat-label>Desde</mat-label>
        <input matInput [matDatepicker]="pickerFrom" [ngModel]="dateFrom()" (ngModelChange)="onDateFromChange($event)">
        @if (dateFrom()) {
          <button mat-icon-button matSuffix (click)="onDateFromChange(null)" aria-label="Quitar la fecha desde">
            <mat-icon>close</mat-icon>
          </button>
        }
        <mat-datepicker-toggle matIconSuffix [for]="pickerFrom"></mat-datepicker-toggle>
        <mat-datepicker #pickerFrom></mat-datepicker>
      </mat-form-field>

      <mat-form-field appearance="outline" style="width:170px">
        <mat-label>Hasta</mat-label>
        <input matInput [matDatepicker]="pickerTo" [ngModel]="dateTo()" (ngModelChange)="onDateToChange($event)">
        @if (dateTo()) {
          <button mat-icon-button matSuffix (click)="onDateToChange(null)" aria-label="Quitar la fecha hasta">
            <mat-icon>close</mat-icon>
          </button>
        }
        <mat-datepicker-toggle matIconSuffix [for]="pickerTo"></mat-datepicker-toggle>
        <mat-datepicker #pickerTo></mat-datepicker>
      </mat-form-field>

      <mat-form-field appearance="outline" style="flex:1;min-width:220px;max-width:320px">
        <mat-label>Buscar por nombre o cédula</mat-label>
        <mat-icon matPrefix style="color:var(--muted)">search</mat-icon>
        <input matInput [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)" placeholder="Ej: ANDRADE o 0750...">
      </mat-form-field>

      @if (filteredItems().length) {
        <div style="align-self:center;background:var(--accent-soft);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;color:var(--accent)">
          {{filteredItems().length}} retiro{{ filteredItems().length !== 1 ? 's' : ''}}
        </div>
      }
    </div>

    @if (loading()) {
      <div class="spinner-center" style="height:200px">
        <div style="text-align:center">
          <div class="spinner" style="margin:0 auto 12px"></div>
          <div style="font-size:13px;color:var(--muted)">Cargando retiros...</div>
        </div>
      </div>
    } @else if (loadError(); as error) {
      <div class="empty-state card">
        <mat-icon style="font-size:48px;width:48px;height:48px;color:#b91c1c;margin-bottom:12px">error_outline</mat-icon>
        <div style="font-weight:600;color:var(--ink-soft)">{{error}}</div>
        <button mat-stroked-button style="margin-top:16px" (click)="load()">
          <mat-icon>refresh</mat-icon> Reintentar
        </button>
      </div>
    } @else if (!items().length) {
      <div class="empty-state card">
        <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">person_off</mat-icon>
        <div style="font-weight:600;color:var(--ink-soft)">Sin retiros</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">No hay estudiantes retirados con estos filtros</div>
      </div>
    } @else if (!filteredItems().length) {
      <div class="empty-state card">
        <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">search_off</mat-icon>
        <div style="font-weight:600;color:var(--ink-soft)">Sin resultados</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">Ningún estudiante coincide con "{{searchTerm()}}"</div>
      </div>
    } @else {
      <!-- Desktop -->
      <div class="data-table-wrap hidden md:block">
        <table class="data-table">
          <thead>
            <tr>
              <th>Estudiante</th>
              <th>Curso</th>
              <th>Fecha de retiro</th>
              <th>Motivo</th>
              <th>Visibilidad</th>
              <th>Registrado por</th>
              <th>Estado</th>
              <th style="width:56px">Opciones</th>
            </tr>
          </thead>
          <tbody>
            @for (item of filteredItems(); track item.id) {
              <tr style="cursor:pointer" (click)="openHistory(item)">
                <td>
                  <div style="font-weight:500;color:{{item.revertedAt ? 'var(--muted-strong)' : 'var(--ink)'}}">{{item.studentName}}</div>
                  @if (item.idNumber) { <div style="font-size:11px;color:var(--muted);font-family:monospace">{{item.idNumber}}</div> }
                </td>
                <td>
                  <div>{{item.courseName}}</div>
                  <div style="font-size:11px;color:var(--muted)">{{item.academicYear}}</div>
                </td>
                <td style="font-size:14px">{{formatWithdrawalDate(item.withdrawalDate)}}</td>
                <td style="font-size:14px;color:var(--ink-soft)">{{item.reason.name}}</td>
                <td style="font-size:14px;color:var(--ink-soft)">{{visibilityLabel(item)}}</td>
                <td style="font-size:14px;color:var(--muted-strong)">{{withdrawnBy(item)}}</td>
                <td>
                  @if (item.revertedAt) {
                    <span class="badge-J">Reincorporado</span>
                    <div style="font-size:11px;color:var(--muted);margin-top:3px">
                      el {{formatRevertedDate(item.revertedAt)}}@if (item.revertedBy?.fullName) { · {{item.revertedBy?.fullName}} }
                    </div>
                  } @else {
                    <span class="badge-gray">Retirado</span>
                  }
                </td>
                <td>
                  <button mat-icon-button style="color:var(--muted)" [matMenuTriggerFor]="rowMenu" (click)="$event.stopPropagation()">
                    <mat-icon>more_vert</mat-icon>
                  </button>
                  <mat-menu #rowMenu="matMenu">
                    <button mat-menu-item (click)="openHistory(item)"><mat-icon>history</mat-icon> Ver historial</button>
                    <button mat-menu-item (click)="openRecord(item)"><mat-icon>receipt_long</mat-icon> Ver retiros</button>
                    @if (rowActions(item).canChangeVisibility) {
                      <mat-divider></mat-divider>
                      <button mat-menu-item [disabled]="busyId() === item.id" (click)="changeVisibility(item)"><mat-icon>visibility</mat-icon> Cambiar visibilidad</button>
                    }
                    @if (rowActions(item).canReinstate) {
                      <button mat-menu-item [disabled]="busyId() === item.id" (click)="reinstate(item)"><mat-icon>person_add</mat-icon> Reincorporar</button>
                    }
                  </mat-menu>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Mobile -->
      <div class="md:hidden" style="display:flex;flex-direction:column;gap:8px">
        @for (item of filteredItems(); track item.id) {
          <div class="card" style="padding:14px 16px">
            <div style="display:flex;align-items:flex-start;gap:12px">
              <div style="flex:1;min-width:0" (click)="openHistory(item)">
                <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:{{item.revertedAt ? 'var(--muted-strong)' : 'var(--ink)'}}">{{item.studentName}}</div>
                @if (item.idNumber) { <div style="font-size:11px;color:var(--muted);font-family:monospace">{{item.idNumber}}</div> }
                <div style="font-size:12px;color:var(--muted);margin-top:2px">
                  {{item.courseName}} · {{item.academicYear}} · {{formatWithdrawalDate(item.withdrawalDate)}}
                </div>
                <div style="font-size:12px;color:var(--muted-strong);margin-top:2px">{{item.reason.name}} · {{visibilityLabel(item)}}</div>
                <div style="font-size:11px;color:var(--muted);margin-top:2px">Registrado por {{withdrawnBy(item)}}</div>
                @if (item.revertedAt) {
                  <div style="font-size:11px;color:var(--muted);margin-top:2px">
                    Reincorporado el {{formatRevertedDate(item.revertedAt)}}@if (item.revertedBy?.fullName) { · {{item.revertedBy?.fullName}} }
                  </div>
                }
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
                @if (item.revertedAt) {
                  <span class="badge-J">Reincorporado</span>
                } @else {
                  <span class="badge-gray">Retirado</span>
                }
                <button mat-icon-button style="color:var(--muted);width:32px;height:32px" [matMenuTriggerFor]="rowMenuMobile">
                  <mat-icon>more_vert</mat-icon>
                </button>
              </div>
              <mat-menu #rowMenuMobile="matMenu">
                <button mat-menu-item (click)="openHistory(item)"><mat-icon>history</mat-icon> Ver historial</button>
                <button mat-menu-item (click)="openRecord(item)"><mat-icon>receipt_long</mat-icon> Ver retiros</button>
                @if (rowActions(item).canChangeVisibility) {
                  <mat-divider></mat-divider>
                  <button mat-menu-item [disabled]="busyId() === item.id" (click)="changeVisibility(item)"><mat-icon>visibility</mat-icon> Cambiar visibilidad</button>
                }
                @if (rowActions(item).canReinstate) {
                  <button mat-menu-item [disabled]="busyId() === item.id" (click)="reinstate(item)"><mat-icon>person_add</mat-icon> Reincorporar</button>
                }
              </mat-menu>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class WithdrawnStudentsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  readonly academicYearContext = inject(AcademicYearContextService);

  readonly statusOptions = WITHDRAWAL_STATUS_OPTIONS;
  readonly formatWithdrawalDate = formatWithdrawalDate;
  readonly formatRevertedDate = formatRevertedDate;

  readonly items = signal<WithdrawalItem[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly courses = signal<Course[]>([]);
  readonly reasons = signal<WithdrawalReason[] | null>(null);
  readonly updateFlags = signal<ResourceFlags>(NO_FLAGS);
  readonly busyId = signal<number | null>(null);

  readonly status = signal<WithdrawalStatusFilter>('active');
  readonly courseId = signal<number | null>(null);
  readonly reasonId = signal<number | null>(null);
  readonly dateFrom = signal<Date | null>(null);
  readonly dateTo = signal<Date | null>(null);

  readonly filters = computed<WithdrawalListFilters>(() => {
    const from = this.dateFrom();
    const to = this.dateTo();
    return {
      status: this.status(),
      academicYearId: this.academicYearContext.selectedId(),
      courseId: this.courseId(),
      reasonId: this.reasonId(),
      dateFrom: from ? dateToDateString(from) : null,
      dateTo: to ? dateToDateString(to) : null,
    };
  });

  readonly filteredItems = computed(() => filterWithdrawals(this.items(), this.searchTerm()));

  private loadSeq = 0;

  constructor() {
    effect(() => {
      this.academicYearContext.selectedId();
      untracked(() => this.load());
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadCourses(),
      this.loadReasons(),
      this.loadUpdateFlags(),
    ]);
  }

  private async loadCourses(): Promise<void> {
    try {
      this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
    } catch {
      this.courses.set([]);
    }
  }

  // Without the reasons there is no way to filter by them, so the filter
  // itself goes away and the list still loads.
  private async loadReasons(): Promise<void> {
    try {
      this.reasons.set(await firstValueFrom(this.http.get<WithdrawalReason[]>('/api/withdrawal-reasons')));
    } catch {
      this.reasons.set(null);
    }
  }

  // A failed request never hides the list: the actions simply stay away.
  private async loadUpdateFlags(): Promise<void> {
    const roleId = this.auth.currentUser()?.roleId ?? null;
    const permissionRows = this.auth.isSuperAdmin() || roleId === null
      ? null
      : await firstValueFrom(this.http.get<RolePermission[]>(`/api/roles/permissions/${roleId}`)).catch(() => null);
    this.updateFlags.set(
      resolveResourcePermissions(permissionRows, 'student-withdrawals', this.auth.isSuperAdmin()),
    );
  }

  async load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const query = buildWithdrawalListQuery(this.filters());
      const data = await firstValueFrom(this.http.get<WithdrawalItem[]>(`/api/student-withdrawals?${query}`));
      if (seq !== this.loadSeq) return;
      this.items.set(data);
    } catch (err: unknown) {
      if (seq !== this.loadSeq) return;
      this.loadError.set(withdrawalListErrorMessage(err));
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  onStatusChange(value: WithdrawalStatusFilter): void {
    this.status.set(value);
    this.load();
  }

  onCourseChange(value: number | null): void {
    this.courseId.set(value);
    this.load();
  }

  onReasonChange(value: number | null): void {
    this.reasonId.set(value);
    this.load();
  }

  onDateFromChange(value: Date | null): void {
    this.dateFrom.set(value);
    this.load();
  }

  onDateToChange(value: Date | null): void {
    this.dateTo.set(value);
    this.load();
  }

  rowActions(item: WithdrawalItem): WithdrawalRowActions {
    return withdrawalRowActions(this.updateFlags(), item);
  }

  visibilityLabel(item: WithdrawalItem): string {
    return statsVisibilityLabel(item.statsVisibility);
  }

  withdrawnBy(item: WithdrawalItem): string {
    return withdrawnByName(item);
  }

  openHistory(item: WithdrawalItem): void {
    this.dialog.open(StudentHistoryDialogComponent, {
      width: '960px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: {
        enrollment: {
          enrollmentId: item.enrollmentId,
          courseId: item.courseId,
          fullName: item.studentName,
          course: item.courseName,
          academicYear: item.academicYear,
          idNumber: item.idNumber,
        },
        dateFrom: null,
        dateTo: null,
        readOnly: true,
      },
    });
  }

  openRecord(item: WithdrawalItem): void {
    this.dialog.open(StudentWithdrawalsDialogComponent, {
      width: '560px',
      data: { studentId: item.studentId, studentName: item.studentName },
    });
  }

  async reinstate(item: WithdrawalItem): Promise<void> {
    if (this.busyId() !== null) return;

    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Reincorporar estudiante',
        message: `¿Reincorporar a ${item.studentName} en ${item.courseName}? Volverá a aparecer en la nómina y en los procesos normales.`,
        confirmLabel: 'Reincorporar',
        icon: 'person_add',
        severity: 'primary',
      },
    }).afterClosed());
    if (!confirmed) return;

    this.busyId.set(item.id);
    try {
      await firstValueFrom(this.http.post<WithdrawalItem>(`/api/student-withdrawals/${item.id}/revert`, null));
      this.notify.success('Estudiante reincorporado');
      await this.load();
    } catch (err: unknown) {
      const outcome = withdrawalMutationErrorOutcome(err, 'No se pudo reincorporar al estudiante. Intenta nuevamente.');
      this.notify.error(outcome.message);
      if (outcome.closeAndReload) await this.load();
    } finally {
      this.busyId.set(null);
    }
  }

  changeVisibility(item: WithdrawalItem): void {
    this.dialog.open(WithdrawalVisibilityDialogComponent, {
      width: '480px',
      data: { item },
    }).afterClosed().subscribe(async result => {
      if (result === 'updated' || result === 'stale') await this.load();
    });
  }
}
