import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom, debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Student, AcademicYear, Course, Enrollment } from '../../core/models/index';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { StudentDialogComponent } from './student-dialog.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
            MatSelectModule, MatSnackBarModule, MatSidenavModule],
  styles: [`
    mat-sidenav { width: 340px; border-left: 1px solid var(--border); padding: 0; background: var(--paper); }
    mat-sidenav-container { height: calc(100vh - 112px); background: transparent; }
    .detail-header {
      padding: 24px 20px;
      background: var(--paper-deep);
      border-bottom: 1px solid var(--border);
    }
    .detail-avatar {
      width: 56px; height: 56px; border-radius: 14px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Fraunces', serif;
      font-size: 22px; font-weight: 600; margin-bottom: 12px;
    }
    .detail-name { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; color: var(--ink); }
    .section-note { padding: 0 20px 16px; font-size: 12px; color: var(--muted); }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Estudiantes</h1>
      <button mat-flat-button color="primary" (click)="openNew()">
        <mat-icon>add</mat-icon> Nuevo estudiante
      </button>
    </div>

    <div class="filter-bar" style="margin-bottom:0;border-bottom:none;border-radius:16px 16px 0 0">
      <mat-form-field appearance="outline" style="flex:1;max-width:380px">
        <mat-label>Buscar por nombre o cédula</mat-label>
        <mat-icon matPrefix style="color:var(--muted)">search</mat-icon>
        <input matInput [(ngModel)]="searchTerm" (ngModelChange)="search$.next($event)" placeholder="Ej: ANDRADE o 0750...">
      </mat-form-field>
      <span style="color:var(--muted);font-size:13px;align-self:center">{{students().length}} resultado(s)</span>
    </div>

    <mat-sidenav-container>
      <mat-sidenav-content>
        @if (loading()) {
          <div class="spinner-center" style="height:200px">
            <div style="text-align:center">
              <div class="spinner" style="margin:0 auto 12px"></div>
              <div style="font-size:13px;color:var(--muted)">Cargando...</div>
            </div>
          </div>
        } @else {
          <!-- Desktop -->
          <div class="data-table-wrap hidden md:block" style="border-radius:0 0 16px 16px">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Cédula</th>
                  <th>Sexo</th>
                  <th>F. Nacimiento</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (s of students(); track s.id) {
                  <tr style="cursor:pointer" (click)="selectStudent(s)">
                    <td>
                      <div style="display:flex;align-items:center;gap:10px">
                        <div style="width:32px;height:32px;border-radius:8px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#4f46e5;flex-shrink:0">
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
                      <button mat-icon-button style="color:var(--muted)" (click)="selectStudent(s);$event.stopPropagation()">
                        <mat-icon>chevron_right</mat-icon>
                      </button>
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
              <div class="card" style="cursor:pointer;padding:14px 16px" (click)="selectStudent(s)">
                <div style="display:flex;align-items:center;gap:12px">
                  <div style="width:40px;height:40px;border-radius:10px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#4f46e5;flex-shrink:0">{{s.name[0]}}</div>
                  <div>
                    <div style="font-weight:600;font-size:14px">{{s.name}}</div>
                    <div style="font-size:12px;color:var(--muted);margin-top:2px">{{s.idNumber ?? 'Sin cédula'}} · {{s.gender ?? ''}} · {{s.birthDate ?? ''}}</div>
                  </div>
                  <mat-icon style="color:var(--border);margin-left:auto">chevron_right</mat-icon>
                </div>
              </div>
            }
          </div>
        }
      </mat-sidenav-content>

      <mat-sidenav #detailPanel position="end" mode="over"
                   [opened]="!!selected()" (openedChange)="onPanelOpenedChange($event)">
        @if (selected()) {
          <div class="detail-header">
            <div class="detail-avatar">{{selected()!.name[0]}}</div>
            <div class="detail-name">{{selected()!.name}}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">ID: {{selected()!.id}}</div>
          </div>
          <div style="padding:20px 20px 0">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:12px">Información</div>
          </div>
          <div style="padding:0 20px">
            @for (field of detailFields(); track field.label) {
              <div style="padding:12px 0;border-bottom:1px solid var(--border-soft);display:flex;justify-content:space-between">
                <span style="font-size:13px;color:var(--muted)">{{field.label}}</span>
                <span style="font-size:13px;font-weight:500;color:var(--ink-soft)">{{field.value || '—'}}</span>
              </div>
            }
          </div>
          <div style="padding:16px 20px 0">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:4px">Representante</div>
          </div>
          @if (loadingEnrollment()) {
            <div class="spinner-center" style="padding:20px 0"><div class="spinner spinner-sm"></div></div>
          } @else if (currentEnrollment()) {
            <div style="padding:0 20px">
              @for (field of guardianFields(); track field.label) {
                <div style="padding:12px 0;border-bottom:1px solid var(--border-soft);display:flex;justify-content:space-between">
                  <span style="font-size:13px;color:var(--muted)">{{field.label}}</span>
                  <span style="font-size:13px;font-weight:500;color:var(--ink-soft)">{{field.value || '—'}}</span>
                </div>
              }
            </div>
          } @else {
            <div class="section-note">Sin matrícula activa — no se puede asignar representante todavía.</div>
          }
          <div style="padding:16px 20px;display:flex;gap:8px">
            <button mat-flat-button color="primary" style="flex:1" (click)="openEdit()">
              <mat-icon>edit</mat-icon> Editar
            </button>
            <button mat-stroked-button color="warn" (click)="deleteStudent(selected()!.id)">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        }
      </mat-sidenav>
    </mat-sidenav-container>
  `,
})
export class StudentsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly students = signal<Student[]>([]);
  readonly loading = signal(false);
  readonly selected = signal<Student | null>(null);
  readonly years = signal<AcademicYear[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly currentEnrollment = signal<Enrollment | null>(null);
  readonly loadingEnrollment = signal(false);

  searchTerm = '';

  readonly search$ = new Subject<string>();

  readonly detailFields = () => {
    const s = this.selected();
    if (!s) return [];
    return [
      { label: 'Cédula', value: s.idNumber },
      { label: 'Sexo', value: s.gender === 'H' ? 'Masculino' : s.gender === 'M' ? 'Femenino' : s.gender },
      { label: 'Nacimiento', value: s.birthDate },
    ];
  };

  readonly guardianFields = () => {
    const e = this.currentEnrollment();
    if (!e) return [];
    return [
      { label: 'Nombre', value: e.guardianName },
      { label: 'Cédula', value: e.guardianIdNumber },
      { label: 'Teléfono', value: e.guardianPhone },
      { label: 'Email', value: e.guardianEmail },
    ];
  };

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

  async selectStudent(s: Student): Promise<void> {
    this.selected.set(s);
    this.currentEnrollment.set(null);
    this.loadingEnrollment.set(true);
    try {
      const data = await firstValueFrom(this.http.get<Enrollment[]>(`/api/enrollments?student_id=${s.id}`));
      this.currentEnrollment.set(data[0] ?? null);
    } finally { this.loadingEnrollment.set(false); }
  }

  onPanelOpenedChange(opened: boolean): void {
    if (!opened) this.selected.set(null);
  }

  openNew(): void {
    this.dialog.open(StudentDialogComponent, {
      width: '520px',
      data: { mode: 'create', years: this.years(), courses: this.courses() },
    }).afterClosed().subscribe(async ok => {
      if (ok) await this.loadStudents(this.searchTerm);
    });
  }

  openEdit(): void {
    const s = this.selected()!;
    this.dialog.open(StudentDialogComponent, {
      width: '520px',
      data: { mode: 'edit', student: s, enrollment: this.currentEnrollment(), years: this.years(), courses: this.courses() },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await this.loadStudents(this.searchTerm);
      const updated = this.students().find(x => x.id === s.id);
      if (updated) await this.selectStudent(updated);
    });
  }

  deleteStudent(id: number): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar estudiante', message: '¿Eliminar este estudiante? Esta acción no se puede deshacer.' },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await firstValueFrom(this.http.delete(`/api/students/${id}`));
      this.snack.open('Eliminado', '', { duration: 2000 });
      this.selected.set(null);
      await this.loadStudents(this.searchTerm);
    });
  }
}
