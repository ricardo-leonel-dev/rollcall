import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { Enrollment, Course, Student } from '../../core/models/index';
import { WhatsappIconComponent } from '../../shared/components/whatsapp-icon/whatsapp-icon.component';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { StudentDialogComponent } from './student-dialog.component';
import { StudentDetailDialogComponent } from './student-detail-dialog.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatButtonModule,
    MatIconModule, MatMenuModule, MatDividerModule, WhatsappIconComponent,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">Administración de estudiantes</h1>
      <button mat-flat-button color="primary" (click)="openNew()">
        <mat-icon>add</mat-icon> Nuevo estudiante
      </button>
    </div>

    <div class="filter-bar">
      <mat-form-field appearance="outline" style="width:260px">
        <mat-label>Curso</mat-label>
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
      <mat-form-field appearance="outline" style="flex:1;min-width:220px;max-width:320px">
        <mat-label>Buscar por nombre o cédula</mat-label>
        <mat-icon matPrefix style="color:var(--muted)">search</mat-icon>
        <input matInput [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)" placeholder="Ej: ANDRADE o 0750...">
      </mat-form-field>
      @if (selCourseIds.length && filteredEnrollments().length) {
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
    } @else if (!selCourseIds.length) {
      <div class="empty-state card">
        <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">groups</mat-icon>
        <div style="font-weight:600;color:var(--ink-soft)">Selecciona uno o varios cursos</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">Elige el curso o cursos para ver la nómina de estudiantes</div>
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
              @if (selCourseIds.length > 1) { <th>Curso</th> }
              <th>Estudiante</th>
              <th>Edad</th>
              <th>Representante</th>
              <th>Teléfono</th>
              <th>WhatsApp</th>
              <th style="width:56px">Opciones</th>
            </tr>
          </thead>
          <tbody>
            @for (e of filteredEnrollments(); track e.enrollmentId) {
              <tr style="cursor:pointer" (click)="openDetail(e, 'view')">
                <td style="color:var(--muted);font-weight:600;font-size:13px">{{e.rosterNumber}}</td>
                @if (selCourseIds.length > 1) {
                  <td><span class="badge-info">{{e.course}}</span></td>
                }
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
                <td>
                  <button mat-icon-button style="color:var(--muted)" [matMenuTriggerFor]="rowMenu" (click)="$event.stopPropagation()">
                    <mat-icon>more_vert</mat-icon>
                  </button>
                  <mat-menu #rowMenu="matMenu">
                    <button mat-menu-item (click)="openDetail(e, 'view')"><mat-icon>visibility</mat-icon> Ver</button>
                    <button mat-menu-item (click)="openEditDirect(e)"><mat-icon>edit</mat-icon> Editar</button>
                    <button mat-menu-item (click)="deleteStudent(e)"><mat-icon>delete</mat-icon> Eliminar</button>
                  </mat-menu>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <!-- Mobile -->
      <div class="md:hidden" style="display:flex;flex-direction:column;gap:8px">
        @for (e of filteredEnrollments(); track e.enrollmentId) {
          <div class="card" style="cursor:pointer;padding:14px 16px" (click)="openDetail(e, 'view')">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:36px;height:36px;border-radius:10px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--accent);flex-shrink:0">
                {{e.rosterNumber}}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{e.fullName}}</div>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">
                  {{e.age ? e.age + ' años' : ''}} {{e.guardianName ? '· ' + e.guardianName : ''}} {{selCourseIds.length > 1 ? '· ' + e.course : ''}}
                </div>
              </div>
              @if (e.whatsappLink) {
                <a [href]="e.whatsappLink" target="_blank" style="color:#16a34a" (click)="$event.stopPropagation()">
                  <app-whatsapp-icon [size]="22" />
                </a>
              }
              <button mat-icon-button style="color:var(--muted)" [matMenuTriggerFor]="rowMenuMobile" (click)="$event.stopPropagation()">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #rowMenuMobile="matMenu">
                <button mat-menu-item (click)="openDetail(e, 'view')"><mat-icon>visibility</mat-icon> Ver</button>
                <button mat-menu-item (click)="openEditDirect(e)"><mat-icon>edit</mat-icon> Editar</button>
                <button mat-menu-item (click)="deleteStudent(e)"><mat-icon>delete</mat-icon> Eliminar</button>
              </mat-menu>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class StudentManagementComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  readonly academicYearContext = inject(AcademicYearContextService);

  readonly courses = signal<Course[]>([]);
  readonly enrollments = signal<Enrollment[]>([]);
  readonly loading = signal(false);
  readonly searchTerm = signal('');

  selYear: number | null = null;
  selectModel: number[] = [];

  get selCourseIds(): number[] {
    return this.selectModel.filter(id => id !== 0);
  }

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

    this.load();
  }

  async load(): Promise<void> {
    if (!this.selCourseIds.length || !this.selYear) { this.enrollments.set([]); return; }
    this.loading.set(true);
    try {
      const url = this.selCourseIds.length === 1
        ? `/api/enrollments?course_id=${this.selCourseIds[0]}&academic_year_id=${this.selYear}`
        : `/api/enrollments?course_ids=${this.selCourseIds.join(',')}&academic_year_id=${this.selYear}`;
      const data = await firstValueFrom(this.http.get<Enrollment[]>(url));
      this.enrollments.set(data);
    } finally { this.loading.set(false); }
  }

  private toStudent(e: Enrollment): Student {
    return { id: e.studentId, idNumber: e.idNumber, name: e.fullName, gender: e.gender, birthDate: e.birthDate, isActive: e.isActive };
  }

  openNew(): void {
    this.dialog.open(StudentDialogComponent, {
      width: '520px',
      data: { mode: 'create', years: this.academicYearContext.years(), courses: this.courses() },
    }).afterClosed().subscribe(async ok => {
      if (ok) await this.load();
    });
  }

  openDetail(e: Enrollment, mode: 'view' | 'edit' = 'view'): void {
    this.dialog.open(StudentDetailDialogComponent, {
      width: '480px',
      data: { student: this.toStudent(e), mode },
    }).afterClosed().subscribe(result => {
      if (!result) return;
      if (result.action === 'edit') this.openEdit(e, result.enrollment);
    });
  }

  openEdit(e: Enrollment, enrollment: Enrollment | null): void {
    this.dialog.open(StudentDialogComponent, {
      width: '520px',
      data: { mode: 'edit', student: this.toStudent(e), enrollment: enrollment ?? e, years: this.academicYearContext.years(), courses: this.courses() },
    }).afterClosed().subscribe(async ok => {
      if (ok) await this.load();
    });
  }

  openEditDirect(e: Enrollment): void {
    this.dialog.open(StudentDialogComponent, {
      width: '520px',
      data: { mode: 'edit', student: this.toStudent(e), enrollment: e, years: this.academicYearContext.years(), courses: this.courses() },
    }).afterClosed().subscribe(async ok => {
      if (ok) await this.load();
    });
  }

  deleteStudent(e: Enrollment): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar estudiante', message: '¿Eliminar este estudiante? También se eliminarán sus matrículas, faltas y justificaciones asociadas. Esta acción no se puede deshacer.' },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await firstValueFrom(this.http.delete(`/api/students/${e.studentId}`));
      this.notify.success('Eliminado');
      await this.load();
    });
  }
}
