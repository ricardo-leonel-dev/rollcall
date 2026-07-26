import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { Enrollment, Course } from '../../core/models/index';
import { WhatsappIconComponent } from '../../shared/components/whatsapp-icon/whatsapp-icon.component';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { dateToDateString } from '../../shared/utils/date.util';
import { StudentHistoryDialogComponent } from './student-history-dialog.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatDatepickerModule,
    MatButtonModule, MatIconModule, WhatsappIconComponent,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">Historial de estudiantes</h1>
    </div>

    <div class="filter-bar">
      <mat-form-field appearance="outline" style="width:220px">
        <mat-label>Curso</mat-label>
        <mat-select [(ngModel)]="selCourseId">
          <mat-option [value]="null">— Seleccionar —</mat-option>
          @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:170px">
        <mat-label>Desde</mat-label>
        <input matInput [matDatepicker]="pickerFrom" [(ngModel)]="dateFrom">
        <mat-datepicker-toggle matIconSuffix [for]="pickerFrom"></mat-datepicker-toggle>
        <mat-datepicker #pickerFrom></mat-datepicker>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:170px">
        <mat-label>Hasta</mat-label>
        <input matInput [matDatepicker]="pickerTo" [(ngModel)]="dateTo">
        <mat-datepicker-toggle matIconSuffix [for]="pickerTo"></mat-datepicker-toggle>
        <mat-datepicker #pickerTo></mat-datepicker>
      </mat-form-field>
      <button mat-flat-button color="primary" [disabled]="!selCourseId || loading()" (click)="applyFilters()" style="align-self:center">
        <mat-icon>filter_alt</mat-icon> Aplicar filtros
      </button>
      <mat-form-field appearance="outline" style="flex:1;min-width:220px;max-width:320px">
        <mat-label>Buscar por nombre o cédula</mat-label>
        <mat-icon matPrefix style="color:var(--muted)">search</mat-icon>
        <input matInput [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)" placeholder="Ej: ANDRADE o 0750...">
      </mat-form-field>
      @if (applied() && filteredEnrollments().length) {
        <div style="align-self:center;background:var(--accent-soft);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;color:var(--accent)">
          {{filteredEnrollments().length}} estudiante{{filteredEnrollments().length !== 1 ? 's' : ''}}
        </div>
      }
    </div>

    @if (loading()) {
      <div class="spinner-center" style="height:200px">
        <div style="text-align:center">
          <div class="spinner" style="margin:0 auto 12px"></div>
          <div style="font-size:13px;color:var(--muted)">Cargando estudiantes...</div>
        </div>
      </div>
    } @else if (!applied()) {
      <div class="empty-state card">
        <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">history</mat-icon>
        <div style="font-weight:600;color:var(--ink-soft)">Selecciona un curso y aplica filtros</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">Elige el curso (y opcionalmente un rango de fechas) para ver la nómina</div>
      </div>
    } @else if (!enrollments().length) {
      <div class="empty-state card">
        <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">people_outline</mat-icon>
        <div style="font-weight:600;color:var(--ink-soft)">Sin matrículas</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">Este curso no tiene estudiantes matriculados</div>
      </div>
    } @else if (!filteredEnrollments().length) {
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
              <th style="width:48px">N°</th>
              <th>Estudiante</th>
              <th>Edad</th>
              <th>Representante</th>
              <th>Teléfono</th>
              <th>WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            @for (e of filteredEnrollments(); track e.enrollmentId) {
              <tr style="cursor:pointer" (click)="openHistory(e)">
                <td style="color:var(--muted);font-weight:600;font-size:13px">{{e.rosterNumber}}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:32px;height:32px;border-radius:8px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--accent);flex-shrink:0">
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
                    <a [href]="e.whatsappLink" target="_blank" (click)="$event.stopPropagation()"
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
        @for (e of filteredEnrollments(); track e.enrollmentId) {
          <div class="card" style="cursor:pointer;padding:14px 16px" (click)="openHistory(e)">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:36px;height:36px;border-radius:10px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--accent);flex-shrink:0">
                {{e.rosterNumber}}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{e.fullName}}</div>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">
                  {{e.age ? e.age + ' años' : ''}} {{e.guardianName ? '· ' + e.guardianName : ''}}
                </div>
              </div>
              @if (e.whatsappLink) {
                <a [href]="e.whatsappLink" target="_blank" style="color:#16a34a" (click)="$event.stopPropagation()">
                  <app-whatsapp-icon [size]="22" />
                </a>
              }
              <mat-icon style="color:var(--muted)">chevron_right</mat-icon>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class StudentHistoryComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);
  readonly academicYearContext = inject(AcademicYearContextService);

  readonly courses = signal<Course[]>([]);
  readonly enrollments = signal<Enrollment[]>([]);
  readonly loading = signal(false);
  readonly applied = signal(false);
  readonly searchTerm = signal('');

  selYear: number | null = null;
  selCourseId: number | null = null;
  dateFrom: Date | null = null;
  dateTo: Date | null = null;

  private appliedDateFrom: string | null = null;
  private appliedDateTo: string | null = null;

  readonly filteredEnrollments = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) return this.enrollments();
    return this.enrollments().filter(e =>
      e.fullName.toLowerCase().includes(q) || (e.idNumber ?? '').toLowerCase().includes(q)
    );
  });

  async ngOnInit(): Promise<void> {
    this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
    const active = this.academicYearContext.selected();
    if (active) this.selYear = active.id;
  }

  async applyFilters(): Promise<void> {
    if (!this.selCourseId || !this.selYear) return;
    this.appliedDateFrom = dateToDateString(this.dateFrom);
    this.appliedDateTo = dateToDateString(this.dateTo);
    this.loading.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<Enrollment[]>(`/api/enrollments?course_id=${this.selCourseId}&academic_year_id=${this.selYear}`)
      );
      this.enrollments.set(data);
      this.applied.set(true);
    } finally { this.loading.set(false); }
  }

  openHistory(e: Enrollment): void {
    this.dialog.open(StudentHistoryDialogComponent, {
      width: '960px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { enrollment: e, dateFrom: this.appliedDateFrom, dateTo: this.appliedDateTo },
    });
  }
}
