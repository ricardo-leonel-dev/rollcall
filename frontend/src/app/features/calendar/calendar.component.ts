import { Component, ChangeDetectionStrategy, signal, inject, OnInit, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { AcademicYear, Course, Absence } from '../../core/models/index';

interface DayCell {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  absences: Absence[];
  countF: number;
  countAT: number;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatSelectModule, MatIconModule],
  template: `
    <div class="page-header">
      <h1 class="page-title">Calendario de Asistencia</h1>
    </div>

    <div class="filter-bar">
      <mat-form-field appearance="outline" style="width:180px">
        <mat-label>Año lectivo</mat-label>
        <mat-select [(ngModel)]="selYear" (ngModelChange)="onFiltersChange()">
          @for (y of years(); track y.id) { <mat-option [value]="y.id">{{y.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:220px">
        <mat-label>Curso</mat-label>
        <mat-select [(ngModel)]="selCourse" (ngModelChange)="onFiltersChange()">
          <mat-option [value]="null">Todos los cursos</mat-option>
          @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
      <div class="legend" style="margin-left:auto">
        <span><span class="legend-dot" style="background:#ef4444"></span>Falta</span>
        <span><span class="legend-dot" style="background:#f59e0b"></span>Atraso</span>
      </div>
    </div>

    <div class="ledger-card">
      <div class="month-header">
        <div class="month-title">{{monthLabel()}}</div>
        <div style="display:flex;align-items:center;gap:14px">
          @if (monthTotals().a || monthTotals().at) {
            <div class="month-tally">
              <strong style="color:#b91c1c">{{monthTotals().a}}</strong> falta(s) ·
              <strong style="color:#92400e">{{monthTotals().at}}</strong> atraso(s)
            </div>
          }
          <div class="month-nav">
            <button class="nav-btn" (click)="prevMonth()" aria-label="Mes anterior">
              <mat-icon style="font-size:20px;width:20px;height:20px">chevron_left</mat-icon>
            </button>
            <button class="today-btn" (click)="goToday()">Hoy</button>
            <button class="nav-btn" (click)="nextMonth()" aria-label="Mes siguiente">
              <mat-icon style="font-size:20px;width:20px;height:20px">chevron_right</mat-icon>
            </button>
          </div>
        </div>
      </div>

      <div class="weekday-row">
        @for (w of weekdays; track w) { <div class="weekday">{{w}}</div> }
      </div>

      @if (loading()) {
        <div class="spinner-center" style="position:relative;z-index:1">
          <div class="spinner"></div>
        </div>
      } @else {
        @for (_ of [monthKey()]; track _) {
          <div class="grid-wrap" [class.month-slide-next]="navDir() === 'next'" [class.month-slide-prev]="navDir() === 'prev'">
            @for (week of weeks(); track $index; let wi = $index) {
              <div class="week-grid">
                @for (cell of week; track cell.iso; let di = $index) {
                  <div class="day-cell"
                       [class.out]="!cell.inMonth"
                       [class.has-records]="cell.absences.length > 0"
                       [class.selected]="selectedIso() === cell.iso"
                       [style.--i]="wi * 7 + di"
                       (click)="selectDay(cell)">
                    @if (cell.isToday) {
                      <span class="today-ring"><span class="day-num">{{cell.day}}</span></span>
                    } @else {
                      <span class="day-num">{{cell.day}}</span>
                    }
                    @if (cell.countF || cell.countAT) {
                      <div class="stamp-row">
                        @if (cell.countF)  { <span class="stamp stamp-f">{{cell.countF}} F</span> }
                        @if (cell.countAT) { <span class="stamp stamp-at">{{cell.countAT}} AT</span> }
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      }

      @if (selectedCell(); as sel) {
        <div class="detail-panel">
          <div class="detail-head">
            <span class="detail-date">{{formatLongDate(sel.iso)}}</span>
            <span class="detail-count">{{sel.absences.length}} registro(s)</span>
          </div>
          <div class="detail-list">
            @for (a of sel.absences; track a.id) {
              <div class="detail-row">
                <span class="detail-name">{{a.studentName}}</span>
                <span style="display:flex;align-items:center;gap:8px">
                  <span class="detail-meta">{{a.course}}</span>
                  <span [class]="'badge-' + a.type">{{a.type}}</span>
                  @if (a.isJustified) { <span class="badge-J">Justificada</span> }
                </span>
              </div>
            }
          </div>
        </div>
      }
    </div>

    <style>
      :host { display: block; }
      .legend { display: flex; gap: 14px; font-size: 12px; color: var(--muted-strong); align-items: center; }
      .legend-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; margin-right: 5px; }
      .month-header, .weekday-row, .grid-wrap, .detail-panel { position: relative; z-index: 1; }
      .month-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 22px 28px 16px 32px; }
      .month-title { font-family: 'Nunito', sans-serif; font-size: 28px; font-weight: 600; color: var(--ink); letter-spacing: -.01em; }
      .month-tally { font-size: 11.5px; color: var(--muted); white-space: nowrap; }
      .month-nav { display: flex; align-items: center; gap: 4px; }
      .nav-btn, .today-btn { cursor: pointer; transition: all .15s ease; background: transparent; }
      .nav-btn { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--muted-strong); border: 1px solid transparent; }
      .nav-btn:hover { background: var(--paper-deep); color: var(--ink-soft); }
      .today-btn { font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 999px; border: 1px dashed #c4b5a0; color: var(--muted-strong); margin: 0 4px; }
      .today-btn:hover { background: #fef3e2; color: #92400e; }
      .weekday-row { display: grid; grid-template-columns: repeat(7,1fr); padding: 0 22px; }
      .weekday { text-align: center; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding-bottom: 8px; }
      .grid-wrap { padding: 4px 18px 8px; }
      .week-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 6px; margin-bottom: 6px; }
      .month-slide-next .week-grid { animation: slideIn .32s ease both; }
      .month-slide-prev .week-grid { animation: slideIn .32s ease both reverse; }
      .day-cell { position: relative; min-height: 90px; border-radius: 13px; padding: 8px; border: 1px solid transparent; display: flex; flex-direction: column; transition: transform .15s ease, box-shadow .15s ease; animation: cellIn .35s ease both; animation-delay: calc(var(--i,0) * 12ms); }
      .day-cell.out { opacity: .35; }
      .day-cell.has-records { cursor: pointer; background: var(--paper); border-color: #eee5d3; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
      .day-cell.has-records:hover { transform: translateY(-3px); box-shadow: 0 12px 20px -12px rgba(15,23,42,.22); }
      .day-cell.selected { background: var(--paper); border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent); }
      .day-num { font-family: 'Nunito', sans-serif; font-size: 17px; font-weight: 500; color: var(--ink-soft); line-height: 1; }
      .day-cell.out .day-num { color: #c9c2b3; font-weight: 400; }
      .today-ring { display: inline-flex; align-items: center; justify-content: center; width: 27px; height: 27px; border-radius: 50%; border: 1.5px solid #dc2626; transform: rotate(-6deg); }
      .stamp-row { margin-top: auto; display: flex; gap: 4px; flex-wrap: wrap; }
      .detail-panel { margin: 4px 18px 22px; border-top: 1px dashed var(--border); padding-top: 14px; }
      .detail-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
      .detail-date { font-family: 'Nunito', sans-serif; font-size: 16px; font-weight: 600; color: var(--ink); }
      .detail-count { font-size: 12px; color: var(--muted); }
      .detail-list { display: flex; flex-direction: column; gap: 6px; }
      .detail-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; border-radius: 10px; background: var(--paper-deep); border: 1px solid var(--border-soft); font-size: 13px; }
      .detail-name { font-weight: 600; color: #292524; }
      .detail-meta { color: var(--muted); font-size: 12px; }
      @keyframes cellIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes slideIn { from { opacity: 0; transform: translateX(16px); } }
      @media (max-width: 640px) {
        .month-header { padding: 16px 14px 12px; }
        .month-title { font-size: 21px; }
        .weekday-row, .grid-wrap { padding-left: 8px; padding-right: 8px; }
        .week-grid { gap: 4px; }
        .day-cell { min-height: 60px; padding: 5px; border-radius: 9px; }
        .day-num { font-size: 14px; }
        .stamp { font-size: 8.5px; padding: 1px 4px; }
        .detail-panel { margin: 4px 8px 18px; }
      }
    </style>
  `,
})
export class CalendarComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly years = signal<AcademicYear[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly absences = signal<Absence[]>([]);
  readonly loading = signal(false);
  readonly viewDate = signal(new Date());
  readonly selectedIso = signal<string | null>(null);
  readonly navDir = signal<'next' | 'prev'>('next');

  selYear: number | null = null;
  selCourse: number | null = null;

  readonly weekdays = WEEKDAYS;

  readonly monthLabel = computed(() => {
    const label = this.viewDate().toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  readonly monthKey = computed(() => {
    const d = this.viewDate();
    return `${d.getFullYear()}-${d.getMonth()}`;
  });

  private readonly absencesByDate = computed(() => {
    const map = new Map<string, Absence[]>();
    for (const a of this.absences()) {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    }
    return map;
  });

  readonly weeks = computed<DayCell[][]>(() => {
    const d = this.viewDate();
    const year = d.getFullYear();
    const month = d.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const start = new Date(year, month, 1 - offset);
    const todayIso = this.toIso(new Date());
    const byDate = this.absencesByDate();

    const cells: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const iso = this.toIso(date);
      const dayAbsences = byDate.get(iso) ?? [];
      cells.push({
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === month,
        isToday: iso === todayIso,
        absences: dayAbsences,
        countF: dayAbsences.filter(a => a.type === 'F').length,
        countAT: dayAbsences.filter(a => a.type === 'AT').length,
      });
    }
    const weeks: DayCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  });

  readonly selectedCell = computed(() => {
    const iso = this.selectedIso();
    if (!iso) return null;
    for (const week of this.weeks()) {
      const cell = week.find(c => c.iso === iso);
      if (cell) return cell;
    }
    return null;
  });

  readonly monthTotals = computed(() => {
    let a = 0, at = 0;
    for (const week of this.weeks()) {
      for (const c of week) {
        if (c.inMonth) { a += c.countF; at += c.countAT; }
      }
    }
    return { a, at };
  });

  async ngOnInit(): Promise<void> {
    const [years, courses] = await Promise.all([
      firstValueFrom(this.http.get<AcademicYear[]>('/api/academic-years')),
      firstValueFrom(this.http.get<Course[]>('/api/courses')),
    ]);
    this.years.set(years);
    this.courses.set(courses);
    const active = years.find(y => y.isActive);
    if (active) this.selYear = active.id;
    await this.loadMonth();
  }

  async onFiltersChange(): Promise<void> {
    await this.loadMonth();
  }

  async loadMonth(): Promise<void> {
    if (!this.selYear) return;
    const d = this.viewDate();
    const from = this.toIso(new Date(d.getFullYear(), d.getMonth(), 1));
    const to = this.toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const params = new URLSearchParams({ academic_year_id: String(this.selYear), date_from: from, date_to: to });
    if (this.selCourse) params.set('course_id', String(this.selCourse));

    this.loading.set(true);
    this.selectedIso.set(null);
    try {
      const data = await firstValueFrom(this.http.get<Absence[]>(`/api/absences?${params.toString()}`));
      this.absences.set(data);
    } finally {
      this.loading.set(false);
    }
  }

  async prevMonth(): Promise<void> {
    this.navDir.set('prev');
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    await this.loadMonth();
  }

  async nextMonth(): Promise<void> {
    this.navDir.set('next');
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    await this.loadMonth();
  }

  async goToday(): Promise<void> {
    this.navDir.set('next');
    this.viewDate.set(new Date());
    await this.loadMonth();
  }

  selectDay(cell: DayCell): void {
    if (!cell.absences.length) return;
    this.selectedIso.set(this.selectedIso() === cell.iso ? null : cell.iso);
  }

  formatLongDate(iso: string): string {
    const [y, m, day] = iso.split('-').map(Number);
    const label = new Date(y, m - 1, day).toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  private toIso(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
