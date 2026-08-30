import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { QuarterContextService } from '../../core/services/quarter-context.service';
import { dateStringToDate, dateToDateString } from '../../shared/utils/date.util';
import { toSnakeCase } from '../../shared/utils/string.util';
import { Course, Quarter } from '../../core/models/index';

export interface ExcelExportDialogData {
  label: string;
  accent: string;
  icon: string;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatFormFieldModule, MatSelectModule, MatInputModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatDividerModule,
  ],
  styles: [`
    .dlg-title-row { display: flex; align-items: center; gap: 10px; }
    .dlg-title-icon {
      width: 36px; height: 36px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .dlg-title-icon mat-icon { font-size: 20px !important; width: 20px !important; height: 20px !important; }
    .sec-label {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
      color: var(--muted); margin: 0 0 8px;
    }
    .dates-row { display: flex; gap: 12px; }
    .dates-row mat-form-field { flex: 1; }
    .trimester-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .trimester-empty-note {
      font-size: 12px; color: var(--muted-strong); line-height: 1.5;
      background: var(--paper-deep); border: 1px solid var(--border-soft);
      border-radius: var(--radius-md); padding: 10px 12px; margin-top: 8px;
    }
    .hint-note {
      font-size: 12px; color: var(--muted-strong); line-height: 1.5;
      background: var(--paper-deep); border: 1px solid var(--border-soft);
      border-radius: var(--radius-md); padding: 10px 12px; margin-top: 16px;
    }
  `],
  template: `
    <div mat-dialog-title>
      <div class="dlg-title-row">
        <div class="dlg-title-icon" [style.background]="data.accent + '18'" [style.color]="data.accent">
          <mat-icon>{{data.icon}}</mat-icon>
        </div>
        <span>{{data.label}}</span>
      </div>
    </div>

    <mat-dialog-content>
      <p class="sec-label">Cursos</p>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Selecciona uno o varios cursos</mat-label>
        <mat-select [ngModel]="selectModel" [multiple]="true" (ngModelChange)="handleSelectChange($event)">
          <mat-select-trigger>
            @if (selectModel.includes(0)) {
              Todos los cursos
            } @else if (selCourseIds.length === 1) {
              {{ courses().find(c => c.id === selCourseIds[0])?.name }}
            } @else if (selCourseIds.length > 1) {
              {{ selCourseIds.length }} cursos seleccionados
            }
          </mat-select-trigger>
          <mat-option [value]="0" style="font-weight:600">Seleccionar todos</mat-option>
          <mat-divider></mat-divider>
          @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
        </mat-select>
      </mat-form-field>

      <p class="sec-label" style="margin-top:14px">Período</p>
      <div class="dates-row">
        <mat-form-field appearance="outline">
          <mat-label>Desde</mat-label>
          <input matInput [matDatepicker]="pickerFrom" [(ngModel)]="dateFrom"
            (ngModelChange)="activeQuarterId.set(null)">
          <mat-datepicker-toggle matIconSuffix [for]="pickerFrom"></mat-datepicker-toggle>
          <mat-datepicker #pickerFrom></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Hasta</mat-label>
          <input matInput [matDatepicker]="pickerTo" [(ngModel)]="dateTo"
            (ngModelChange)="activeQuarterId.set(null)">
          <mat-datepicker-toggle matIconSuffix [for]="pickerTo"></mat-datepicker-toggle>
          <mat-datepicker #pickerTo></mat-datepicker>
        </mat-form-field>
      </div>
      @if (getDatedQuarters().length === 0) {
        <div class="trimester-empty-note">No hay períodos con fechas configuradas para este año lectivo. Define los períodos en el módulo de administración o usa los selectores de fecha para establecer el rango manualmente.</div>
      } @else {
        <div class="trimester-row">
          @for (q of getDatedQuarters(); track q.id) {
            <button class="period-pill" [class.active]="activeQuarterId() === q.id" (click)="applyQuarter(q)">
              {{q.name}}
            </button>
          }
        </div>
      }

      <p class="hint-note">Genera un libro de Excel con el calendario mensual de asistencia, una hoja por curso seleccionado.</p>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button [mat-dialog-close]="undefined">Cancelar</button>
      <button mat-flat-button color="primary" (click)="downloadExcel()" [disabled]="generating() || !selCourseIds.length">
        @if (generating()) {
          <span class="spinner spinner-sm" style="margin-right:8px"></span>
        }
        <mat-icon>download</mat-icon>
        Exportar Excel
        @if (selCourseIds.length > 1) {
          <span style="margin-left:4px;opacity:.75;font-size:12px">({{selCourseIds.length}} hojas)</span>
        }
      </button>
    </mat-dialog-actions>
  `,
})
export class ExcelExportDialogComponent implements OnInit {
  readonly data = inject<ExcelExportDialogData>(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);
  readonly academicYearContext = inject(AcademicYearContextService);
  private readonly quarterContext = inject(QuarterContextService);

  readonly courses = signal<Course[]>([]);
  readonly generating = signal(false);
  readonly activeQuarterId = signal<number | null>(null);

  selectModel: number[] = [];
  dateFrom: Date | null = null;
  dateTo: Date | null = null;

  get selCourseIds(): number[] {
    return this.selectModel.filter(id => id !== 0);
  }

  async ngOnInit(): Promise<void> {
    this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
    this.applyDefaultQuarter();
  }

  private applyDefaultQuarter(): void {
    const id = this.quarterContext.defaultQuarterId();
    if (id === null) return;
    const q = this.quarterContext.quarters().find(qq => qq.id === id);
    if (q) this.applyQuarter(q);
  }

  getDatedQuarters(): Quarter[] {
    return this.quarterContext.quarters().filter(q => q.startDate && q.endDate);
  }

  applyQuarter(q: Quarter | null): void {
    if (!q || !q.startDate || !q.endDate) return;
    this.dateFrom = dateStringToDate(q.startDate);
    this.dateTo = dateStringToDate(q.endDate);
    this.activeQuarterId.set(q.id);
  }

  handleSelectChange(values: number[]): void {
    const prevHadAll = this.selectModel.includes(0);
    const nowHasAll = values.includes(0);
    const allCourseIds = this.courses().map(c => c.id);

    if (nowHasAll && !prevHadAll) {
      this.selectModel = [0, ...allCourseIds];
    } else if (!nowHasAll && prevHadAll) {
      this.selectModel = [];
    } else {
      const courseIds = values.filter(id => id !== 0);
      if (courseIds.length === allCourseIds.length && allCourseIds.length > 0) {
        this.selectModel = [0, ...courseIds];
      } else {
        this.selectModel = courseIds;
      }
    }
  }

  async downloadExcel(): Promise<void> {
    if (!this.selCourseIds.length) return;
    const year = this.academicYearContext.selected();
    if (!year) { this.notify.error('No hay año lectivo activo'); return; }

    this.generating.set(true);
    try {
      const courseIds = this.selCourseIds.join(',');
      const url = `/api/export/excel?course_ids=${courseIds}&academic_year_id=${year.id}&date_from=${dateToDateString(this.dateFrom)}&date_to=${dateToDateString(this.dateTo)}`;
      const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const exporterName = this.auth.currentUser()?.fullName || this.auth.currentUser()?.username || 'usuario';
      a.download = `asistencia_trimestral_${toSnakeCase(exporterName)}.xlsx`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      this.notify.error('Error al exportar');
    } finally {
      this.generating.set(false);
    }
  }
}
