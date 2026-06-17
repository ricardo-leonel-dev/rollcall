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
import { firstValueFrom, debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Student, AcademicYear, Course, Enrollment, Guardian } from '../../core/models/index';

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
    .form-row { padding: 0 20px 16px; }
    .form-row mat-form-field { width: 100%; }
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
                   [opened]="!!selected() || isNew()" (openedChange)="onPanelOpenedChange($event)">
        @if (selected()) {
          <div class="detail-header">
            <div class="detail-avatar">{{selected()!.name[0]}}</div>
            <div class="detail-name">{{selected()!.name}}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">ID: {{selected()!.id}}</div>
          </div>
          <div style="padding:20px 20px 0">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:12px">
              {{editMode() ? 'Editar datos' : 'Información'}}
            </div>
          </div>
          @if (!editMode()) {
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
              <button mat-flat-button color="primary" style="flex:1" (click)="startEdit()">
                <mat-icon>edit</mat-icon> Editar
              </button>
              <button mat-stroked-button color="warn" (click)="deleteStudent(selected()!.id)">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          } @else {
            <div class="form-row"><mat-form-field appearance="outline"><mat-label>Nombre completo</mat-label><input matInput [(ngModel)]="form.name"></mat-form-field></div>
            <div class="form-row"><mat-form-field appearance="outline"><mat-label>Cédula</mat-label><input matInput [(ngModel)]="form.idNumber"></mat-form-field></div>
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Sexo</mat-label>
                <input matInput [(ngModel)]="form.gender" placeholder="H o M">
              </mat-form-field>
            </div>
            <div class="form-row"><mat-form-field appearance="outline"><mat-label>F. Nacimiento</mat-label><input matInput type="date" [(ngModel)]="form.birthDate"></mat-form-field></div>
            <div style="padding:0 20px 4px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Representante</div>
            </div>
            @if (currentEnrollment()) {
              <div class="form-row"><mat-form-field appearance="outline"><mat-label>Nombre completo</mat-label><input matInput [(ngModel)]="guardianForm.name"></mat-form-field></div>
              <div class="form-row"><mat-form-field appearance="outline"><mat-label>Cédula</mat-label><input matInput [(ngModel)]="guardianForm.idNumber"></mat-form-field></div>
              <div class="form-row"><mat-form-field appearance="outline"><mat-label>Teléfono</mat-label><input matInput [(ngModel)]="guardianForm.phone"></mat-form-field></div>
              <div class="form-row"><mat-form-field appearance="outline"><mat-label>Email</mat-label><input matInput [(ngModel)]="guardianForm.email"></mat-form-field></div>
            } @else {
              <div class="section-note">Sin matrícula activa — no se puede asignar representante todavía.</div>
            }
            <div style="padding:0 20px;display:flex;gap:8px">
              <button mat-flat-button color="primary" style="flex:1" (click)="saveEdit()">Guardar</button>
              <button mat-stroked-button (click)="editMode.set(false)">Cancelar</button>
            </div>
          }
        } @else if (isNew()) {
          <div class="detail-header">
            <div class="detail-avatar"><mat-icon>person_add</mat-icon></div>
            <div class="detail-name">Nuevo estudiante</div>
          </div>
          <div style="padding:20px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:16px">Datos personales</div>
          </div>
          <div class="form-row"><mat-form-field appearance="outline"><mat-label>Nombre completo *</mat-label><input matInput [(ngModel)]="form.name"></mat-form-field></div>
          <div class="form-row"><mat-form-field appearance="outline"><mat-label>Cédula</mat-label><input matInput [(ngModel)]="form.idNumber"></mat-form-field></div>
          <div class="form-row"><mat-form-field appearance="outline"><mat-label>Sexo (H/M)</mat-label><input matInput [(ngModel)]="form.gender"></mat-form-field></div>
          <div class="form-row"><mat-form-field appearance="outline"><mat-label>F. Nacimiento</mat-label><input matInput type="date" [(ngModel)]="form.birthDate"></mat-form-field></div>

          <div style="padding:0 20px 4px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Matrícula (opcional)</div>
          </div>
          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Año lectivo</mat-label>
              <mat-select [(ngModel)]="newSelYear">
                <mat-option [value]="null">— Sin matricular por ahora —</mat-option>
                @for (y of years(); track y.id) { <mat-option [value]="y.id">{{y.name}}</mat-option> }
              </mat-select>
            </mat-form-field>
          </div>
          @if (newSelYear) {
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Curso</mat-label>
                <mat-select [(ngModel)]="newSelCourse">
                  <mat-option [value]="null">— Seleccionar —</mat-option>
                  @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
                </mat-select>
              </mat-form-field>
            </div>
          }

          @if (newSelYear && newSelCourse) {
            <div style="padding:0 20px 4px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Representante (opcional)</div>
            </div>
            <div class="form-row"><mat-form-field appearance="outline"><mat-label>Nombre completo</mat-label><input matInput [(ngModel)]="guardianForm.name"></mat-form-field></div>
            <div class="form-row"><mat-form-field appearance="outline"><mat-label>Cédula</mat-label><input matInput [(ngModel)]="guardianForm.idNumber"></mat-form-field></div>
            <div class="form-row"><mat-form-field appearance="outline"><mat-label>Teléfono</mat-label><input matInput [(ngModel)]="guardianForm.phone"></mat-form-field></div>
            <div class="form-row"><mat-form-field appearance="outline"><mat-label>Email</mat-label><input matInput [(ngModel)]="guardianForm.email"></mat-form-field></div>
          }

          <div style="padding:0 20px;display:flex;gap:8px">
            <button mat-flat-button color="primary" style="flex:1" (click)="createStudent()">Crear</button>
            <button mat-stroked-button (click)="isNew.set(false)">Cancelar</button>
          </div>
        }
      </mat-sidenav>
    </mat-sidenav-container>
  `,
})
export class StudentsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly students = signal<Student[]>([]);
  readonly loading = signal(false);
  readonly selected = signal<Student | null>(null);
  readonly editMode = signal(false);
  readonly isNew = signal(false);
  readonly years = signal<AcademicYear[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly currentEnrollment = signal<Enrollment | null>(null);
  readonly loadingEnrollment = signal(false);

  searchTerm = '';
  form = { name: '', idNumber: '', gender: '', birthDate: '' };
  guardianForm = { name: '', idNumber: '', phone: '', email: '' };
  newSelYear: number | null = null;
  newSelCourse: number | null = null;

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
    this.isNew.set(false);
    this.editMode.set(false);
    this.currentEnrollment.set(null);
    this.loadingEnrollment.set(true);
    try {
      const data = await firstValueFrom(this.http.get<Enrollment[]>(`/api/enrollments?student_id=${s.id}`));
      this.currentEnrollment.set(data[0] ?? null);
    } finally { this.loadingEnrollment.set(false); }
  }

  onPanelOpenedChange(opened: boolean): void {
    if (!opened) { this.selected.set(null); this.isNew.set(false); }
  }

  openNew(): void {
    this.selected.set(null);
    this.isNew.set(true);
    this.form = { name: '', idNumber: '', gender: '', birthDate: '' };
    this.guardianForm = { name: '', idNumber: '', phone: '', email: '' };
    this.newSelYear = null;
    this.newSelCourse = null;
  }

  startEdit(): void {
    const s = this.selected()!;
    this.form = { name: s.name, idNumber: s.idNumber ?? '', gender: s.gender ?? '', birthDate: s.birthDate ?? '' };
    const e = this.currentEnrollment();
    this.guardianForm = {
      name: e?.guardianName ?? '', idNumber: e?.guardianIdNumber ?? '',
      phone: e?.guardianPhone ?? '', email: e?.guardianEmail ?? '',
    };
    this.editMode.set(true);
  }

  async saveEdit(): Promise<void> {
    await firstValueFrom(this.http.put(`/api/students/${this.selected()!.id}`, this.form));
    const e = this.currentEnrollment();
    if (e && this.guardianForm.name) {
      if (e.guardianId) {
        await firstValueFrom(this.http.put(`/api/guardians/${e.guardianId}`, this.guardianForm));
      } else {
        const guardian = await firstValueFrom(this.http.post<Guardian>('/api/guardians', this.guardianForm));
        await firstValueFrom(this.http.put(`/api/enrollments/${e.enrollmentId}`, { guardianId: guardian.id }));
      }
    }
    this.snack.open('Guardado', '', { duration: 2000 });
    this.editMode.set(false);
    await this.loadStudents(this.searchTerm);
    const updated = this.students().find(s => s.id === this.selected()!.id);
    if (updated) await this.selectStudent(updated);
  }

  async createStudent(): Promise<void> {
    if (!this.form.name) { this.snack.open('El nombre es requerido', '', { duration: 3000 }); return; }
    const student = await firstValueFrom(this.http.post<Student>('/api/students', this.form));
    if (this.newSelYear && this.newSelCourse) {
      let guardianId: number | undefined;
      if (this.guardianForm.name) {
        const guardian = await firstValueFrom(this.http.post<Guardian>('/api/guardians', this.guardianForm));
        guardianId = guardian.id;
      }
      await firstValueFrom(this.http.post('/api/enrollments', {
        studentId: student.id, courseId: this.newSelCourse, academicYearId: this.newSelYear, guardianId,
      }));
    }
    this.snack.open('Estudiante creado', '', { duration: 2000 });
    this.isNew.set(false);
    await this.loadStudents(this.searchTerm);
  }

  async deleteStudent(id: number): Promise<void> {
    if (!confirm('¿Eliminar este estudiante?')) return;
    await firstValueFrom(this.http.delete(`/api/students/${id}`));
    this.snack.open('Eliminado', '', { duration: 2000 });
    this.selected.set(null);
    await this.loadStudents(this.searchTerm);
  }
}
