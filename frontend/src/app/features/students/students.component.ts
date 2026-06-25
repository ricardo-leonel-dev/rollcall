import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom, debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Student, AcademicYear, Course, Enrollment } from '../../core/models/index';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { StudentDialogComponent } from './student-dialog.component';
import { StudentDetailDialogComponent } from './student-detail-dialog.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <div class="page-header">
      <h1 class="page-title">Estudiantes</h1>
      <button mat-flat-button color="primary" (click)="openNew()">
        <mat-icon>add</mat-icon> Nuevo estudiante
      </button>
    </div>

    <div class="filter-bar" style="margin-bottom:0;border-bottom:none;border-radius:var(--radius-lg) var(--radius-lg) 0 0">
      <mat-form-field appearance="outline" style="flex:1;max-width:380px">
        <mat-label>Buscar por nombre o cédula</mat-label>
        <mat-icon matPrefix style="color:var(--muted)">search</mat-icon>
        <input matInput [(ngModel)]="searchTerm" (ngModelChange)="search$.next($event)" placeholder="Ej: ANDRADE o 0750...">
      </mat-form-field>
      <span class="w-full md:w-auto" style="color:var(--muted);font-size:13px;align-self:center">{{students().length}} resultado(s)</span>
    </div>

    @if (loading()) {
      <div class="spinner-center" style="height:200px">
        <div style="text-align:center">
          <div class="spinner" style="margin:0 auto 12px"></div>
          <div style="font-size:13px;color:var(--muted)">Cargando...</div>
        </div>
      </div>
    } @else {
      <!-- Desktop -->
      <div class="data-table-wrap hidden md:block" style="border-radius:0 0 var(--radius-lg) var(--radius-lg)">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Cédula</th>
              <th>Sexo</th>
              <th>F. Nacimiento</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (s of students(); track s.id) {
              <tr style="cursor:pointer" (click)="openDetail(s)">
                <td>
                  <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:32px;height:32px;border-radius:8px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--accent);flex-shrink:0">
                      {{s.name[0]}}
                    </div>
                    <span style="font-weight:500">{{s.name}}</span>
                  </div>
                </td>
                <td style="color:var(--muted-strong);font-family:monospace">{{s.idNumber ?? '—'}}</td>
                <td>
                  @if (s.gender) {
                    <span class="badge-info">{{s.gender === 'H' ? 'Masculino' : 'Femenino'}}</span>
                  } @else { <span style="color:var(--border)">—</span> }
                </td>
                <td style="color:var(--muted-strong)">{{s.birthDate ?? '—'}}</td>
                <td>
                  <button mat-icon-button style="color:var(--muted)" [matMenuTriggerFor]="rowMenu" (click)="$event.stopPropagation()">
                    <mat-icon>more_vert</mat-icon>
                  </button>
                  <mat-menu #rowMenu="matMenu">
                    <button mat-menu-item (click)="openDetail(s, 'view')"><mat-icon>visibility</mat-icon> Ver</button>
                    <button mat-menu-item (click)="openDetail(s, 'edit')"><mat-icon>edit</mat-icon> Editar</button>
                    <button mat-menu-item (click)="deleteStudent(s.id)"><mat-icon>delete</mat-icon> Eliminar</button>
                  </mat-menu>
                </td>
              </tr>
            }
            @if (!students().length && !loading()) {
              <tr><td colspan="5" style="text-align:center;color:var(--muted);padding:40px">Sin resultados</td></tr>
            }
          </tbody>
        </table>
      </div>
      <!-- Mobile -->
      <div class="md:hidden" style="padding:12px;display:flex;flex-direction:column;gap:8px">
        @for (s of students(); track s.id) {
          <div class="card" style="cursor:pointer;padding:14px 16px" (click)="openDetail(s)">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:40px;height:40px;border-radius:10px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--accent);flex-shrink:0">{{s.name[0]}}</div>
              <div>
                <div style="font-weight:600;font-size:14px">{{s.name}}</div>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">{{s.idNumber ?? 'Sin cédula'}} · {{s.gender ?? ''}} · {{s.birthDate ?? ''}}</div>
              </div>
              <button mat-icon-button style="color:var(--muted);margin-left:auto" [matMenuTriggerFor]="rowMenuMobile" (click)="$event.stopPropagation()">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #rowMenuMobile="matMenu">
                <button mat-menu-item (click)="openDetail(s, 'view')"><mat-icon>visibility</mat-icon> Ver</button>
                <button mat-menu-item (click)="openDetail(s, 'edit')"><mat-icon>edit</mat-icon> Editar</button>
                <button mat-menu-item (click)="deleteStudent(s.id)"><mat-icon>delete</mat-icon> Eliminar</button>
              </mat-menu>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class StudentsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  readonly students = signal<Student[]>([]);
  readonly loading = signal(false);
  readonly years = signal<AcademicYear[]>([]);
  readonly courses = signal<Course[]>([]);

  searchTerm = '';

  readonly search$ = new Subject<string>();

  constructor() {
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe(q => this.loadStudents(q));
  }

  async ngOnInit(): Promise<void> {
    await this.loadStudents();
    const [years, courses] = await Promise.all([
      firstValueFrom(this.http.get<AcademicYear[]>('/api/academic-years')),
      firstValueFrom(this.http.get<Course[]>('/api/courses')),
    ]);
    this.years.set(years);
    this.courses.set(courses);
  }

  async loadStudents(q = ''): Promise<void> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.http.get<Student[]>(`/api/students${q ? '?search=' + encodeURIComponent(q) : ''}`));
      this.students.set(data);
    } finally { this.loading.set(false); }
  }

  openDetail(s: Student, mode: 'view' | 'edit' = 'view'): void {
    this.dialog.open(StudentDetailDialogComponent, {
      width: '480px',
      data: { student: s, mode },
    }).afterClosed().subscribe(result => {
      if (!result) return;
      if (result.action === 'edit') this.openEdit(s, result.enrollment);
    });
  }

  openNew(): void {
    this.dialog.open(StudentDialogComponent, {
      width: '520px',
      data: { mode: 'create', years: this.years(), courses: this.courses() },
    }).afterClosed().subscribe(async ok => {
      if (ok) await this.loadStudents(this.searchTerm);
    });
  }

  openEdit(s: Student, enrollment: Enrollment | null): void {
    this.dialog.open(StudentDialogComponent, {
      width: '520px',
      data: { mode: 'edit', student: s, enrollment, years: this.years(), courses: this.courses() },
    }).afterClosed().subscribe(async ok => {
      if (ok) await this.loadStudents(this.searchTerm);
    });
  }

  deleteStudent(id: number): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar estudiante', message: '¿Eliminar este estudiante? También se eliminarán sus matrículas, faltas y justificaciones asociadas. Esta acción no se puede deshacer.' },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await firstValueFrom(this.http.delete(`/api/students/${id}`));
      this.notify.success('Eliminado');
      await this.loadStudents(this.searchTerm);
    });
  }
}
