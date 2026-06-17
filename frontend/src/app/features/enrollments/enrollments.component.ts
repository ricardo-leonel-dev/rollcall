import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { Enrollment, AcademicYear, Course } from '../../core/models/index';
import { WhatsappIconComponent } from '../../shared/components/whatsapp-icon/whatsapp-icon.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatButtonModule, MatIconModule, MatSnackBarModule, WhatsappIconComponent],
  template: `
    <div class="page-header">
      <h1 class="page-title">Matrículas</h1>
      <button mat-flat-button color="primary" (click)="downloadExcel()" [disabled]="!selCourse || !selYear">
        <mat-icon>download</mat-icon> Exportar Excel
      </button>
    </div>

    <div class="filter-bar">
      <mat-form-field appearance="outline" style="width:180px">
        <mat-label>Año lectivo</mat-label>
        <mat-select [(ngModel)]="selYear" (ngModelChange)="onYearChange()">
          @for (y of years(); track y.id) { <mat-option [value]="y.id">{{y.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:220px">
        <mat-label>Curso</mat-label>
        <mat-select [(ngModel)]="selCourse" (ngModelChange)="load()">
          <mat-option [value]="null">— Seleccionar —</mat-option>
          @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:150px">
        <mat-label>Desde</mat-label>
        <input matInput type="date" [(ngModel)]="dateFrom">
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:150px">
        <mat-label>Hasta</mat-label>
        <input matInput type="date" [(ngModel)]="dateTo">
      </mat-form-field>
      @if (enrollments().length) {
        <div style="align-self:center;background:var(--accent-soft);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;color:#4f46e5">
          {{enrollments().length}} estudiantes
        </div>
      }
    </div>

    @if (loading()) {
      <div class="spinner-center" style="height:200px">
        <div style="text-align:center">
          <div class="spinner" style="margin:0 auto 12px"></div>
          <div style="font-size:13px;color:var(--muted)">Cargando matrículas...</div>
        </div>
      </div>
    } @else if (!selCourse) {
      <div class="empty-state card">
        <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">assignment_ind</mat-icon>
        <div style="font-weight:600;color:var(--ink-soft)">Selecciona un curso</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">Elige el año lectivo y el curso para ver la nómina</div>
      </div>
    } @else if (!enrollments().length) {
      <div class="empty-state card">
        <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">people_outline</mat-icon>
        <div style="font-weight:600;color:var(--ink-soft)">Sin matrículas</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">Este curso no tiene estudiantes matriculados</div>
      </div>
    } @else {
      <!-- Desktop -->
      <div class="data-table-wrap hidden md:block">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:48px">N°</th>
              <th>Estudiante</th>
              <th>Edad</th>
              <th>Representante</th>
              <th>Teléfono</th>
              <th>WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            @for (e of enrollments(); track e.enrollmentId) {
              <tr>
                <td style="color:var(--muted);font-weight:600;font-size:13px">{{e.rosterNumber}}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:32px;height:32px;border-radius:8px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#4f46e5;flex-shrink:0">
                      {{e.fullName?.[0] ?? '?'}}
                    </div>
                    <div>
                      <div style="font-weight:500">{{e.fullName}}</div>
                      @if (e.idNumber) { <div style="font-size:11px;color:var(--muted);font-family:monospace">{{e.idNumber}}</div> }
                    </div>
                  </div>
                </td>
                <td style="color:var(--muted-strong)">{{e.age ?? '—'}}</td>
                <td style="color:var(--muted-strong)">{{e.guardianName ?? '—'}}</td>
                <td style="color:var(--muted-strong);font-family:monospace">{{e.guardianPhone ?? '—'}}</td>
                <td>
                  @if (e.whatsappLink) {
                    <a [href]="e.whatsappLink" target="_blank"
                       style="display:inline-flex;align-items:center;gap:6px;color:#16a34a;font-size:13px;font-weight:500;text-decoration:none;background:#f0fdf4;border-radius:8px;padding:4px 10px">
                      <app-whatsapp-icon [size]="14" /> Enviar
                    </a>
                  } @else {
                    <span style="color:var(--border);font-size:13px">—</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <!-- Mobile -->
      <div class="md:hidden" style="display:flex;flex-direction:column;gap:8px">
        @for (e of enrollments(); track e.enrollmentId) {
          <div class="card" style="padding:14px 16px">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:36px;height:36px;border-radius:10px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#4f46e5;flex-shrink:0">
                {{e.rosterNumber}}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{e.fullName}}</div>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">{{e.age ? e.age + ' años' : ''}} {{e.guardianName ? '· ' + e.guardianName : ''}}</div>
              </div>
              @if (e.whatsappLink) {
                <a [href]="e.whatsappLink" target="_blank" style="color:#16a34a">
                  <app-whatsapp-icon [size]="22" />
                </a>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class EnrollmentsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly years = signal<AcademicYear[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly enrollments = signal<Enrollment[]>([]);
  readonly loading = signal(false);

  selYear: number | null = null;
  selCourse: number | null = null;
  dateFrom = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  dateTo = new Date().toISOString().split('T')[0];

  async ngOnInit(): Promise<void> {
    const [years, courses] = await Promise.all([
      firstValueFrom(this.http.get<AcademicYear[]>('/api/academic-years')),
      firstValueFrom(this.http.get<Course[]>('/api/courses')),
    ]);
    this.years.set(years);
    this.courses.set(courses);
    const active = years.find(y => y.isActive);
    if (active) {
      this.selYear = active.id;
      this.setDefaultTrimester(active);
    }
  }

  onYearChange(): void {
    const year = this.years().find(y => y.id === this.selYear);
    if (year) this.setDefaultTrimester(year);
    this.load();
  }

  /** Marca por defecto el trimestre actual, dividiendo el año lectivo en 3
   * tercios iguales desde su fecha de inicio. */
  private setDefaultTrimester(year: AcademicYear): void {
    if (!year.startDate || !year.endDate) return;
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const start = new Date(year.startDate);
    const end = new Date(year.endDate);
    const third = (end.getTime() - start.getTime()) / 3;
    const bounds = [start, new Date(start.getTime() + third), new Date(start.getTime() + 2 * third), end];

    const today = new Date();
    const clamped = today < start ? start : today > end ? end : today;
    const idx = bounds.slice(1).findIndex(b => clamped.getTime() <= b.getTime());
    const i = idx === -1 ? 2 : idx;
    this.dateFrom = fmt(bounds[i]);
    this.dateTo = fmt(bounds[i + 1]);
  }

  async load(): Promise<void> {
    if (!this.selCourse || !this.selYear) { this.enrollments.set([]); return; }
    this.loading.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<Enrollment[]>(`/api/enrollments?course_id=${this.selCourse}&academic_year_id=${this.selYear}`)
      );
      this.enrollments.set(data);
    } finally { this.loading.set(false); }
  }

  async downloadExcel(): Promise<void> {
    if (!this.selCourse || !this.selYear) return;
    const url = `/api/export/excel?course_id=${this.selCourse}&academic_year_id=${this.selYear}&date_from=${this.dateFrom}&date_to=${this.dateTo}`;
    try {
      const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `matriculas_${this.selCourse}_${this.selYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      this.snack.open('Error al exportar', '', { duration: 3000 });
    }
  }
}
