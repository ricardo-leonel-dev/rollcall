import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { DashboardSummary, AcademicYear, Course } from '../../core/models/index';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatSelectModule, MatFormFieldModule, FormsModule, LoadingSpinnerComponent],
  template: `
    <div class="page-title">Dashboard</div>

    <div class="flex flex-wrap gap-3 mb-6">
      <mat-form-field appearance="outline" class="w-48">
        <mat-label>Año lectivo</mat-label>
        <mat-select [(ngModel)]="selectedYear" (ngModelChange)="loadSummary()">
          <mat-option [value]="null">Todos</mat-option>
          @for (y of years(); track y.id) {
            <mat-option [value]="y.id">{{y.name}}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="w-56">
        <mat-label>Curso</mat-label>
        <mat-select [(ngModel)]="selectedCourse" (ngModelChange)="loadSummary()">
          <mat-option [value]="null">Todos</mat-option>
          @for (c of courses(); track c.id) {
            <mat-option [value]="c.id">{{c.name}}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    @if (loading()) {
      <app-loading-spinner message="Cargando estadísticas..." />
    } @else if (summary()) {
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <mat-card class="text-center">
          <mat-card-content class="pt-4">
            <div class="text-3xl font-bold text-red-600">{{summary()!.totalAbsences}}</div>
            <div class="text-sm text-gray-500 mt-1">Faltas (A)</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="text-center">
          <mat-card-content class="pt-4">
            <div class="text-3xl font-bold text-yellow-600">{{summary()!.totalTardies}}</div>
            <div class="text-sm text-gray-500 mt-1">Atrasos (AT)</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="text-center">
          <mat-card-content class="pt-4">
            <div class="text-3xl font-bold text-green-600">{{summary()!.justifiedCount}}</div>
            <div class="text-sm text-gray-500 mt-1">Justificadas</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="text-center">
          <mat-card-content class="pt-4">
            <div class="text-3xl font-bold text-blue-600">{{summary()!.justifiedPercent}}%</div>
            <div class="text-sm text-gray-500 mt-1">% Justificado</div>
          </mat-card-content>
        </mat-card>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <mat-card>
          <mat-card-header>
            <mat-card-title class="text-base">Top 10 estudiantes con más faltas</mat-card-title>
          </mat-card-header>
          <mat-card-content class="overflow-auto">
            <table class="w-full text-sm mt-2">
              <thead>
                <tr class="text-left text-gray-500 border-b">
                  <th class="pb-1">Estudiante</th>
                  <th class="pb-1">Curso</th>
                  <th class="pb-1 text-center">A</th>
                  <th class="pb-1 text-center">AT</th>
                </tr>
              </thead>
              <tbody>
                @for (s of summary()!.topStudents; track s.studentName) {
                  <tr class="border-b border-gray-50 hover:bg-gray-50">
                    <td class="py-1.5">{{s.studentName}}</td>
                    <td class="py-1.5 text-xs text-gray-500">{{s.course}}</td>
                    <td class="py-1.5 text-center"><span class="badge-A">{{s.totalAbsences}}</span></td>
                    <td class="py-1.5 text-center"><span class="badge-AT">{{s.totalTardies}}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header>
            <mat-card-title class="text-base">Inasistencias últimos 30 días</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="flex items-end gap-1 h-40 mt-4">
              @for (day of summary()!.absencesByDay; track day.date) {
                <div class="flex flex-col items-center flex-1">
                  <div class="bg-blue-400 w-full rounded-t"
                       [style.height.px]="barHeight(day.count)"
                       [title]="day.date + ': ' + day.count"></div>
                </div>
              }
            </div>
          </mat-card-content>
        </mat-card>
      </div>
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly years = signal<AcademicYear[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly summary = signal<DashboardSummary | null>(null);
  readonly loading = signal(false);

  selectedYear: number | null = null;
  selectedCourse: number | null = null;

  private maxCount = computed(() => Math.max(...(this.summary()?.absencesByDay.map(d => d.count) ?? [1]), 1));

  barHeight(count: number): number {
    return Math.round((count / this.maxCount()) * 120) + 4;
  }

  async ngOnInit(): Promise<void> {
    const [years, courses] = await Promise.all([
      firstValueFrom(this.http.get<AcademicYear[]>('/api/academic-years')),
      firstValueFrom(this.http.get<Course[]>('/api/courses')),
    ]);
    this.years.set(years);
    this.courses.set(courses);
    await this.loadSummary();
  }

  async loadSummary(): Promise<void> {
    this.loading.set(true);
    try {
      const params: string[] = [];
      if (this.selectedYear)   params.push(`academic_year_id=${this.selectedYear}`);
      if (this.selectedCourse) params.push(`course_id=${this.selectedCourse}`);
      const qs = params.length ? '?' + params.join('&') : '';
      const data = await firstValueFrom(this.http.get<DashboardSummary>(`/api/dashboard/summary${qs}`));
      this.summary.set(data);
    } finally {
      this.loading.set(false);
    }
  }
}
