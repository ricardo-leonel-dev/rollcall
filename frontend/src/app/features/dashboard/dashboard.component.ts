import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, AfterViewInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTooltipModule, MatTooltip } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { DashboardSummary, Course } from '../../core/models/index';
import { firstValueFrom } from 'rxjs';
import { Chart, registerables } from 'chart.js';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { dateToDateString } from '../../shared/utils/date.util';

Chart.register(...registerables);

type PeriodPreset = 'today' | 'yesterday' | '7d' | '15d' | '30d' | 'full' | 'custom';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSelectModule, MatFormFieldModule, MatIconModule, MatButtonModule, MatInputModule, MatDatepickerModule, MatTooltipModule, FormsModule],
  styles: [`
    .stat-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .stat-card:hover { transform: translateY(-3px); box-shadow: 0 10px 24px -8px rgba(15,23,42,.15) !important; }
    .chart-wrap { position: relative; height: 200px; }
    .top-table tr td:first-child { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .detail-stamps { display: inline-flex; gap: 4px; cursor: pointer; padding: 2px; border-radius: 8px; transition: background .12s ease; }
    .detail-stamps:hover { background: var(--paper-deep); }
    .alert-bar {
      background: linear-gradient(135deg, #fef2f2, #fff7ed);
      border: 1px dashed #fca5a5;
      border-radius: 14px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <span style="color:var(--muted);font-size:13px">{{today}}</span>
    </div>

    <!-- Filtros -->
    <div class="filter-bar">
      <mat-form-field appearance="outline" style="width:220px">
        <mat-label>Curso</mat-label>
        <mat-select [(ngModel)]="selectedCourse" (ngModelChange)="loadSummary()">
          <mat-option [value]="null">Todos los cursos</mat-option>
          @for (c of courses(); track c.id) {
            <mat-option [value]="c.id">{{c.name}}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    <!-- Selector de período -->
    <div class="filter-bar" style="align-items:center">
      @for (opt of periodOptions; track opt.value) {
        <button type="button" class="period-pill" [class.active]="selectedPeriod === opt.value" (click)="selectPeriod(opt.value)">
          {{opt.label}}
        </button>
      }
      <button type="button" class="period-pill" [class.active]="selectedPeriod === 'custom'" (click)="selectPeriod('custom')">
        <mat-icon style="font-size:14px;width:14px;height:14px;vertical-align:text-bottom">calendar_today</mat-icon> Personalizado
      </button>

      @if (showCustomPanel) {
        <div class="flex gap-3 min-w-0">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1;min-width:0;max-width:130px">
            <mat-label>Desde</mat-label>
            <input matInput [matDatepicker]="pickerCustomFrom" [(ngModel)]="customFrom">
            <mat-datepicker-toggle matIconSuffix [for]="pickerCustomFrom"></mat-datepicker-toggle>
            <mat-datepicker #pickerCustomFrom></mat-datepicker>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1;min-width:0;max-width:130px">
            <mat-label>Hasta</mat-label>
            <input matInput [matDatepicker]="pickerCustomTo" [(ngModel)]="customTo" (dateChange)="onCustomDateChange()">
            <mat-datepicker-toggle matIconSuffix [for]="pickerCustomTo"></mat-datepicker-toggle>
            <mat-datepicker #pickerCustomTo></mat-datepicker>
          </mat-form-field>
        </div>
      }
    </div>

    @if (loading()) {
      <div class="spinner-center" style="height:200px">
        <div style="text-align:center">
          <div class="spinner spinner-lg" style="margin:0 auto 12px"></div>
          <div style="font-size:14px;color:var(--muted)">Cargando estadísticas...</div>
        </div>
      </div>
    } @else if (summary()) {

      <!-- Alerta de umbral -->
      @if (alertStudents().length > 0) {
        <div class="alert-bar">
          <mat-icon style="color:#ef4444;flex-shrink:0">warning_amber</mat-icon>
          <div>
            <span style="font-weight:600;color:#b91c1c">{{alertStudents().length}} estudiante(s) con 5+ faltas:</span>
            <span style="color:#7f1d1d;font-size:13px;margin-left:6px">{{alertStudents().slice(0,3).map(s => s.studentName).join(', ')}}{{alertStudents().length > 3 ? ' y más...' : ''}}</span>
          </div>
        </div>
      }

      <!-- Stats cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px">
        <div class="stat-card">
          <div class="stat-icon" style="background:#fef2f2">
            <mat-icon style="color:#ef4444;font-size:24px">event_busy</mat-icon>
          </div>
          <div>
            <div class="stat-value" style="color:#dc2626">{{summary()!.totalAbsences}}</div>
            <div class="stat-label">Faltas</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:#fffbeb">
            <mat-icon style="color:#f59e0b;font-size:24px">schedule</mat-icon>
          </div>
          <div>
            <div class="stat-value" style="color:#d97706">{{summary()!.totalTardies}}</div>
            <div class="stat-label">Atrasos</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:#f0fdf4">
            <mat-icon style="color:#22c55e;font-size:24px">task_alt</mat-icon>
          </div>
          <div>
            <div class="stat-value" style="color:#16a34a">{{summary()!.justifiedCount}}</div>
            <div class="stat-label">Justificadas</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--accent-soft)">
            <mat-icon style="color:#6366f1;font-size:24px">percent</mat-icon>
          </div>
          <div>
            <div class="stat-value" style="color:#6366f1">{{summary()!.justifiedPercent}}%</div>
            <div class="stat-label">% Justificado</div>
          </div>
        </div>
      </div>

      <!-- Charts + Top table -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="charts-grid">
        <!-- Bar chart -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Inasistencias — {{periodLabel()}}</span>
          </div>
          <div class="chart-wrap">
            <canvas #barChart></canvas>
          </div>
        </div>

        <!-- Doughnut -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Faltas vs Atrasos</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:center;gap:24px;height:200px">
            <div style="position:relative;width:160px;height:160px">
              <canvas #donutChart></canvas>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column">
                <div style="font-family:'Nunito',sans-serif;font-size:24px;font-weight:600;color:var(--ink)">{{summary()!.totalAbsences + summary()!.totalTardies}}</div>
                <div style="font-size:11px;color:var(--muted)">total</div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:12px;height:12px;border-radius:3px;background:#ef4444"></div>
                <span style="font-size:13px;color:var(--muted-strong)">Faltas <strong style="color:var(--ink-soft)">{{summary()!.totalAbsences}}</strong></span>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:12px;height:12px;border-radius:3px;background:#f59e0b"></div>
                <span style="font-size:13px;color:var(--muted-strong)">Atrasos <strong style="color:var(--ink-soft)">{{summary()!.totalTardies}}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Faltas por curso -->
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          <span class="card-title">Faltas por curso</span>
        </div>
        @if (summary()!.byCourse?.length) {
          <div class="chart-wrap" style="height:240px">
            <canvas #courseChart></canvas>
          </div>
        } @else {
          <div class="empty-state" style="padding:24px">Sin datos para este período</div>
        }
      </div>

      <!-- Top 10 -->
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          <span class="card-title">Top 10 — Más inasistencias</span>
        </div>
        <div class="data-table-wrap" style="border:none;border-radius:0;box-shadow:none">
          <table class="data-table top-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Estudiante</th>
                <th>Curso</th>
                <th style="text-align:center">Faltas</th>
                <th style="text-align:center">Atrasos</th>
                <th style="text-align:center">Justificadas</th>
                <th style="text-align:center">Detalle</th>
              </tr>
            </thead>
            <tbody>
              @for (s of summary()!.topStudents; track s.studentName; let i = $index) {
                <tr>
                  <td style="color:var(--muted);font-size:12px;width:32px">{{i + 1}}</td>
                  <td style="font-weight:500">{{s.studentName}}</td>
                  <td style="font-size:12px;color:var(--muted-strong)">{{s.course}}</td>
                  <td style="text-align:center"><span class="badge-F">{{s.totalAbsences}}</span></td>
                  <td style="text-align:center"><span class="badge-AT">{{s.totalTardies}}</span></td>
                  <td style="text-align:center">
                    @if (s.totalJustified > 0) { <span class="badge-J">{{s.totalJustified}}</span> } @else { <span style="color:var(--border)">—</span> }
                  </td>
                  <td style="text-align:center">
                    <span class="detail-stamps"
                          #tip="matTooltip"
                          [matTooltip]="breakdownTooltip(s.breakdown)"
                          matTooltipClass="detail-tooltip"
                          (click)="onDetailClick(s, tip)">
                      @if (s.totalAbsences) { <span class="stamp stamp-f">{{s.totalAbsences}} F</span> }
                      @if (s.totalTardies)  { <span class="stamp stamp-at">{{s.totalTardies}} AT</span> }
                    </span>
                  </td>
                </tr>
              }
              @if (!summary()!.topStudents?.length) {
                <tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px">Sin datos</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    <style>
      @media (max-width: 768px) { .charts-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly academicYearContext = inject(AcademicYearContextService);

  @ViewChild('barChart')    barChartEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('donutChart')  donutChartEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('courseChart') courseChartEl!: ElementRef<HTMLCanvasElement>;

  private barChart: Chart | null = null;
  private donutChart: Chart | null = null;
  private courseChart: Chart | null = null;

  readonly courses = signal<Course[]>([]);
  readonly summary = signal<DashboardSummary | null>(null);
  readonly loading = signal(false);

  selectedYear: number | null = null;
  selectedCourse: number | null = null;

  readonly periodOptions: { value: PeriodPreset; label: string }[] = [
    { value: 'full',      label: 'Año completo' },
    { value: 'today',     label: 'Hoy' },
    { value: 'yesterday', label: 'Ayer' },
    { value: '7d',        label: 'Últimos 7 días' },
    { value: '15d',       label: 'Últimos 15 días' },
    { value: '30d',       label: 'Últimos 30 días' },
  ];
  selectedPeriod: PeriodPreset = 'full';
  customFrom: Date | null = null;
  customTo: Date | null = null;
  showCustomPanel = false;

  readonly alertStudents = computed(() =>
    (this.summary()?.topStudents ?? []).filter(s => s.totalAbsences >= 5)
  );

  readonly today = new Date().toLocaleDateString('es-EC', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  async ngOnInit(): Promise<void> {
    this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
    this.selectedYear = this.academicYearContext.selected()?.id ?? null;
    await this.loadSummary();
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    this.barChart?.destroy();
    this.donutChart?.destroy();
    this.courseChart?.destroy();
  }

  async loadSummary(): Promise<void> {
    this.loading.set(true);
    try {
      const { from, to } = this.computeDateRange();
      const params: string[] = [];
      if (this.selectedYear)   params.push(`academic_year_id=${this.selectedYear}`);
      if (this.selectedCourse) params.push(`course_id=${this.selectedCourse}`);
      if (from) params.push(`date_from=${from}`);
      if (to)   params.push(`date_to=${to}`);
      const qs = params.length ? '?' + params.join('&') : '';
      const data = await firstValueFrom(this.http.get<DashboardSummary>(`/api/dashboard/summary${qs}`));
      this.summary.set(data);
      setTimeout(() => this.renderCharts(data), 50);
    } finally {
      this.loading.set(false);
    }
  }

  private computeDateRange(): { from: string | null; to: string | null } {
    const today = new Date();
    const fmt = (d: Date) => dateToDateString(d);
    switch (this.selectedPeriod) {
      case 'today': return { from: fmt(today), to: fmt(today) };
      case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); return { from: fmt(y), to: fmt(y) }; }
      case '7d':  { const f = new Date(today); f.setDate(f.getDate() - 6);  return { from: fmt(f), to: fmt(today) }; }
      case '15d': { const f = new Date(today); f.setDate(f.getDate() - 14); return { from: fmt(f), to: fmt(today) }; }
      case '30d': { const f = new Date(today); f.setDate(f.getDate() - 29); return { from: fmt(f), to: fmt(today) }; }
      case 'custom': return { from: this.customFrom ? fmt(this.customFrom) : null, to: this.customTo ? fmt(this.customTo) : null };
      case 'full':
      default: return { from: null, to: null };
    }
  }

  selectPeriod(p: PeriodPreset): void {
    this.selectedPeriod = p;
    this.showCustomPanel = p === 'custom';
    if (p !== 'custom') this.loadSummary();
  }

  onCustomDateChange(): void {
    if (this.customFrom && this.customTo) this.loadSummary();
  }

  periodLabel(): string {
    if (this.selectedPeriod === 'custom') {
      return this.customFrom && this.customTo
        ? `${dateToDateString(this.customFrom)} – ${dateToDateString(this.customTo)}`
        : 'Personalizado';
    }
    return this.periodOptions.find(p => p.value === this.selectedPeriod)?.label ?? '';
  }

  breakdownTooltip(breakdown: { date: string; type: 'F' | 'AT'; isJustified: boolean }[]): string {
    const lines = !breakdown?.length ? ['Sin registros'] : breakdown.map(b => {
      const [, m, d] = b.date.split('-');
      const label = b.type === 'F' ? 'Falta' : 'Atraso';
      return `${d}/${m} ${label}${b.isJustified ? ' (justificada)' : ''}`;
    });
    if (window.innerWidth < 768) lines.push('', 'Toca de nuevo para ir a Inasistencias');
    return lines.join('\n');
  }

  private lastTappedDetail: string | null = null;

  onDetailClick(s: { courseId: number; studentName: string }, tip: MatTooltip): void {
    // En mobile no hay hover — el primer tap muestra el desglose (no navega
    // de una, para poder leerlo); un segundo tap sobre ese mismo estudiante
    // ya confirma la intención de revisarlo a fondo, así que navega. En
    // desktop el hover ya muestra el tooltip, así que el click navega
    // directo (mismo comportamiento que ya había).
    if (window.innerWidth < 768) {
      if (this.lastTappedDetail === s.studentName) {
        this.lastTappedDetail = null;
        this.goToAbsences(s);
      } else {
        this.lastTappedDetail = s.studentName;
        tip.show();
      }
      return;
    }
    this.goToAbsences(s);
  }

  goToAbsences(s: { courseId: number; studentName: string }): void {
    this.router.navigate(['/absences'], { queryParams: { course: s.courseId, student: s.studentName } });
  }

  private renderCharts(data: DashboardSummary): void {
    this.barChart?.destroy();
    this.donutChart?.destroy();
    this.courseChart?.destroy();

    const days = data.absencesByDay ?? [];
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';
    if (this.barChartEl?.nativeElement) {
      this.barChart = new Chart(this.barChartEl.nativeElement, {
        type: 'bar',
        data: {
          labels: days.map(d => d.date.slice(5)),
          datasets: [{
            data: days.map(d => d.count),
            backgroundColor: accent + 'b3',
            hoverBackgroundColor: accent,
            borderRadius: 6,
            borderSkipped: false,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
            y: { grid: { color: '#f1ece0' }, ticks: { font: { size: 11 } }, beginAtZero: true },
          },
        },
      });
    }

    if (this.donutChartEl?.nativeElement) {
      const total = data.totalAbsences + data.totalTardies;
      this.donutChart = new Chart(this.donutChartEl.nativeElement, {
        type: 'doughnut',
        data: {
          labels: ['Faltas', 'Atrasos'],
          datasets: [{
            data: total ? [data.totalAbsences, data.totalTardies] : [1, 0],
            backgroundColor: total ? ['#ef4444', '#f59e0b'] : ['#e7e1d3', '#e7e1d3'],
            borderWidth: 0,
            hoverOffset: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: { legend: { display: false } },
        },
      });
    }

    const byCourse = data.byCourse ?? [];
    if (this.courseChartEl?.nativeElement && byCourse.length) {
      this.courseChart = new Chart(this.courseChartEl.nativeElement, {
        type: 'bar',
        data: {
          labels: byCourse.map(c => c.course),
          datasets: [
            { label: 'Faltas',  data: byCourse.map(c => c.totalAbsences), backgroundColor: '#ef4444', borderRadius: 6, borderSkipped: false },
            { label: 'Atrasos', data: byCourse.map(c => c.totalTardies),  backgroundColor: '#f59e0b', borderRadius: 6, borderSkipped: false },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { grid: { color: '#f1ece0' }, ticks: { font: { size: 11 } }, beginAtZero: true },
          },
        },
      });
    }
  }
}
