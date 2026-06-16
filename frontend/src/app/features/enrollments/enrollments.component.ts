import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { Enrollment, AcademicYear, Course } from '../../core/models/index';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatSelectModule,
    MatInputModule, MatButtonModule, MatIconModule, MatSnackBarModule, LoadingSpinnerComponent,
  ],
  template: `
    <div class="page-title">Matrículas</div>

    <div class="flex flex-wrap gap-3 mb-4">
      <mat-form-field appearance="outline" class="w-44">
        <mat-label>Año lectivo</mat-label>
        <mat-select [(ngModel)]="selYear" (ngModelChange)="load()">
          @for (y of years(); track y.id) { <mat-option [value]="y.id">{{y.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="w-56">
        <mat-label>Curso</mat-label>
        <mat-select [(ngModel)]="selCourse" (ngModelChange)="load()">
          <mat-option [value]="null">-- Seleccionar --</mat-option>
          @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
      <button mat-flat-button color="primary" (click)="downloadExcel()" [disabled]="!selCourse || !selYear">
        <mat-icon>download</mat-icon> Exportar Excel
      </button>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <!-- Desktop table -->
      <div class="hidden md:block overflow-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="p-2 text-left">N°</th>
              <th class="p-2 text-left">Estudiante</th>
              <th class="p-2 text-left">Edad</th>
              <th class="p-2 text-left">Representante</th>
              <th class="p-2 text-left">Teléfono</th>
              <th class="p-2 text-left">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            @for (e of enrollments(); track e.enrollmentId) {
              <tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="p-2 text-gray-500">{{e.rosterNumber}}</td>
                <td class="p-2 font-medium">{{e.fullName}}</td>
                <td class="p-2 text-center">{{e.age ?? '—'}}</td>
                <td class="p-2 text-gray-600">{{e.guardianName ?? '—'}}</td>
                <td class="p-2 text-gray-600">{{e.guardianPhone ?? '—'}}</td>
                <td class="p-2">
                  @if (e.whatsappLink) {
                    <a [href]="e.whatsappLink" target="_blank" class="text-green-600 flex items-center gap-1">
                      <mat-icon class="text-sm" style="font-size:16px">chat</mat-icon>
                      Enviar
                    </a>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <!-- Mobile cards -->
      <div class="md:hidden space-y-2">
        @for (e of enrollments(); track e.enrollmentId) {
          <div class="card">
            <div class="font-medium">{{e.rosterNumber}}. {{e.fullName}}</div>
            <div class="text-xs text-gray-500">Edad: {{e.age ?? '—'}} · {{e.gender ?? ''}}</div>
            @if (e.guardianName) {
              <div class="text-xs text-gray-600 mt-1">Rep.: {{e.guardianName}}</div>
            }
            @if (e.whatsappLink) {
              <a [href]="e.whatsappLink" target="_blank" class="text-green-600 text-xs flex items-center gap-1 mt-1">
                <mat-icon style="font-size:14px">chat</mat-icon> WhatsApp
              </a>
            }
          </div>
        }
      </div>
      @if (enrollments().length === 0) {
        <p class="text-gray-500 text-center py-8">Selecciona un curso para ver las matrículas</p>
      }
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
    if (active) this.selYear = active.id;
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

  downloadExcel(): void {
    if (!this.selCourse || !this.selYear) return;
    const url = `/api/export/excel?course_id=${this.selCourse}&academic_year_id=${this.selYear}&date_from=${this.dateFrom}&date_to=${this.dateTo}`;
    const link = document.createElement('a');
    link.href = url;
    link.click();
  }
}
