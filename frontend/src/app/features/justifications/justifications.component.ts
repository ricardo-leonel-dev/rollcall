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
import { Justification, AcademicYear, Course, Enrollment, Absence } from '../../core/models/index';

interface JustifyGroup { weekKey: string; absences: Absence[]; }
interface GroupInput { reason: string; notifiedBy: string; }

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="page-header">
      <h1 class="page-title">Justificaciones</h1>
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
    </div>

    <div class="card" style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted-strong);margin-bottom:12px">Nueva justificación</div>
      @if (!selYear || !selCourse) {
        <div style="font-size:13px;color:var(--muted)">Selecciona año lectivo y un curso específico arriba para elegir un estudiante.</div>
      } @else {
        <mat-form-field appearance="outline" style="width:280px;margin-bottom:12px">
          <mat-label>Estudiante</mat-label>
          <mat-select [(ngModel)]="selStudent" (ngModelChange)="onStudentChange()">
            @for (e of studentEnrollments(); track e.enrollmentId) { <mat-option [value]="e.enrollmentId">{{e.fullName}}</mat-option> }
          </mat-select>
        </mat-form-field>

        @if (selStudent && !unjustified().length) {
          <div style="font-size:13px;color:var(--muted)">Este estudiante no tiene faltas pendientes de justificar.</div>
        }

        @if (unjustified().length) {
          <div style="font-size:12px;color:var(--muted-strong);margin-bottom:8px">Marca las faltas a justificar:</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
            @for (a of unjustified(); track a.id) {
              <label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px">
                <input type="checkbox" [checked]="selectedIds().has(a.id)" (change)="toggleSelect(a.id)">
                {{a.date}} <span [class]="'badge-' + a.type">{{a.type}}</span>
              </label>
            }
          </div>
        }

        @if (groups().length) {
          @for (g of groups(); track g.weekKey) {
            <div style="background:var(--paper-deep);border-radius:10px;padding:14px;margin-bottom:12px">
              <div style="font-size:12px;font-weight:600;color:var(--muted-strong);margin-bottom:8px">
                Semana del {{g.weekKey}} — {{g.absences.length}} falta(s): {{datesLabel(g.absences)}}
              </div>
              <mat-form-field appearance="outline" style="width:100%;margin-bottom:8px">
                <mat-label>Motivo *</mat-label>
                <textarea matInput rows="2" [ngModel]="groupInput(g.weekKey).reason" (ngModelChange)="updateGroupInput(g.weekKey, 'reason', $event)"></textarea>
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:100%">
                <mat-label>Quién notificó</mat-label>
                <input matInput [ngModel]="groupInput(g.weekKey).notifiedBy" (ngModelChange)="updateGroupInput(g.weekKey, 'notifiedBy', $event)">
              </mat-form-field>
            </div>
          }
          <button mat-flat-button color="primary" [disabled]="creating()" (click)="createJustifications()">
            <mat-icon>task_alt</mat-icon> Crear {{groups().length}} justificación(es)
          </button>
        }
      }
    </div>

    @if (loading()) {
      <div class="spinner-center" style="height:200px">
        <div class="spinner"></div>
      </div>
    } @else if (!justifications().length) {
      <div class="empty-state card">
        <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">task_alt</mat-icon>
        <div style="font-weight:600;color:var(--ink-soft)">Sin justificaciones</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px;max-width:340px;text-align:center">
          No hay justificaciones con los filtros seleccionados. Usa "Nueva justificación" arriba para crear una.
        </div>
      </div>
    } @else {
      <div style="display:flex;flex-direction:column;gap:12px">
        @for (j of justifications(); track j.id) {
          <div class="card" style="padding:0;overflow:hidden">
            @if (editingId() === j.id) {
              <div style="padding:20px">
                <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:16px">Editar justificación</div>
                <mat-form-field appearance="outline" style="width:100%;margin-bottom:12px">
                  <mat-label>Motivo</mat-label>
                  <textarea matInput [(ngModel)]="editReason" rows="3"></textarea>
                </mat-form-field>
                <mat-form-field appearance="outline" style="width:100%;margin-bottom:12px">
                  <mat-label>Quién notificó</mat-label>
                  <input matInput [(ngModel)]="editNotifiedBy">
                </mat-form-field>
                <div style="display:flex;gap:8px">
                  <button mat-flat-button color="primary" (click)="saveEdit(j.id)">Guardar</button>
                  <button mat-stroked-button (click)="editingId.set(null)">Cancelar</button>
                </div>
              </div>
            } @else {
              <div style="display:flex;align-items:flex-start;gap:0">
                <div style="width:5px;background:var(--stripe);align-self:stretch;flex-shrink:0;border-radius:4px 0 0 4px"></div>
                <div style="padding:16px 20px;flex:1">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
                    <div style="flex:1;min-width:0">
                      <div style="font-weight:600;color:var(--ink-soft);margin-bottom:4px">{{j.reason}}</div>
                      @if (j.notifiedBy) {
                        <div style="font-size:13px;color:var(--muted-strong);display:flex;align-items:center;gap:4px">
                          <mat-icon style="font-size:14px;width:14px;height:14px">person</mat-icon>
                          Notificó: {{j.notifiedBy}}
                        </div>
                      }
                      <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
                        <span class="stamp stamp-j">
                          <mat-icon style="font-size:12px;width:12px;height:12px">event</mat-icon>
                          {{j.absenceIds?.length ?? 0}} falta(s)
                        </span>
                        <span style="font-size:12px;color:var(--muted)">{{j.createdAt?.substring(0, 10)}}</span>
                      </div>
                    </div>
                    <div style="display:flex;gap:4px;flex-shrink:0">
                      <button mat-icon-button style="color:var(--muted-strong)" (click)="startEdit(j)">
                        <mat-icon>edit</mat-icon>
                      </button>
                      <button mat-icon-button style="color:#b91c1c" (click)="remove(j.id)">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class JustificationsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly years = signal<AcademicYear[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly justifications = signal<Justification[]>([]);
  readonly loading = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly studentEnrollments = signal<Enrollment[]>([]);
  readonly unjustified = signal<Absence[]>([]);
  readonly selectedIds = signal<Set<number>>(new Set());
  readonly groupInputs = signal<Record<string, GroupInput>>({});
  readonly creating = signal(false);

  selYear: number | null = null;
  selCourse: number | null = null;
  selStudent: number | null = null;
  editReason = '';
  editNotifiedBy = '';

  async ngOnInit(): Promise<void> {
    const [years, courses] = await Promise.all([
      firstValueFrom(this.http.get<AcademicYear[]>('/api/academic-years')),
      firstValueFrom(this.http.get<Course[]>('/api/courses')),
    ]);
    this.years.set(years);
    this.courses.set(courses);
    const active = years.find(y => y.isActive);
    if (active) { this.selYear = active.id; await this.load(); }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const params: string[] = [];
      if (this.selYear)   params.push(`academic_year_id=${this.selYear}`);
      if (this.selCourse) params.push(`course_id=${this.selCourse}`);
      const qs = params.length ? '?' + params.join('&') : '';
      const data = await firstValueFrom(this.http.get<Justification[]>(`/api/justifications${qs}`));
      this.justifications.set(data);
    } finally { this.loading.set(false); }
  }

  async onFiltersChange(): Promise<void> {
    await this.load();
    this.selStudent = null;
    this.unjustified.set([]);
    this.selectedIds.set(new Set());
    this.groupInputs.set({});
    if (this.selYear && this.selCourse) {
      const data = await firstValueFrom(
        this.http.get<Enrollment[]>(`/api/enrollments?course_id=${this.selCourse}&academic_year_id=${this.selYear}`)
      );
      this.studentEnrollments.set(data);
    } else {
      this.studentEnrollments.set([]);
    }
  }

  async onStudentChange(): Promise<void> {
    this.selectedIds.set(new Set());
    this.groupInputs.set({});
    if (!this.selStudent) { this.unjustified.set([]); return; }
    const data = await firstValueFrom(
      this.http.get<Absence[]>(`/api/absences?enrollment_id=${this.selStudent}&is_justified=false`)
    );
    this.unjustified.set(data);
  }

  toggleSelect(id: number): void {
    this.selectedIds.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Lunes de la semana ISO que contiene la fecha — separa "jueves+viernes"
  // de "lunes+martes" de la semana siguiente en grupos distintos.
  private mondayOf(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const dow = date.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    date.setUTCDate(date.getUTCDate() + diff);
    return date.toISOString().split('T')[0];
  }

  groups(): JustifyGroup[] {
    const selected = this.unjustified().filter(a => this.selectedIds().has(a.id));
    const map = new Map<string, Absence[]>();
    for (const a of selected) {
      const key = this.mondayOf(a.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekKey, absences]) => ({ weekKey, absences }));
  }

  datesLabel(absences: Absence[]): string {
    return absences.map(a => a.date).join(', ');
  }

  groupInput(weekKey: string): GroupInput {
    return this.groupInputs()[weekKey] ?? { reason: '', notifiedBy: '' };
  }

  updateGroupInput(weekKey: string, field: 'reason' | 'notifiedBy', value: string): void {
    this.groupInputs.update(g => ({ ...g, [weekKey]: { ...this.groupInput(weekKey), [field]: value } }));
  }

  async createJustifications(): Promise<void> {
    const gs = this.groups();
    if (!gs.length) return;
    for (const g of gs) {
      if (!this.groupInput(g.weekKey).reason) {
        this.snack.open(`Falta el motivo para la semana del ${g.weekKey}`, '', { duration: 3000 });
        return;
      }
    }

    this.creating.set(true);
    let okCount = 0;
    const errors: string[] = [];
    for (const g of gs) {
      const input = this.groupInput(g.weekKey);
      try {
        await firstValueFrom(this.http.post('/api/justifications', {
          enrollmentId: g.absences[0].enrollmentId,
          reason: input.reason,
          notifiedBy: input.notifiedBy || null,
          absenceIds: g.absences.map(a => a.id),
        }));
        okCount++;
      } catch (err: any) {
        errors.push(`Semana del ${g.weekKey}: ${err?.error?.error ?? 'error'}`);
      }
    }
    this.creating.set(false);
    this.snack.open(
      errors.length ? `${okCount} creada(s), ${errors.length} con error` : `${okCount} justificación(es) creada(s)`,
      '', { duration: 4000 }
    );
    this.selectedIds.set(new Set());
    this.groupInputs.set({});
    await this.onStudentChange();
    await this.load();
  }

  startEdit(j: Justification): void {
    this.editReason = j.reason ?? '';
    this.editNotifiedBy = j.notifiedBy ?? '';
    this.editingId.set(j.id);
  }

  async saveEdit(id: number): Promise<void> {
    await firstValueFrom(this.http.put(`/api/justifications/${id}`, { reason: this.editReason, notifiedBy: this.editNotifiedBy }));
    this.editingId.set(null);
    this.snack.open('Justificación actualizada', '', { duration: 2000 });
    await this.load();
  }

  async remove(id: number): Promise<void> {
    if (!confirm('¿Eliminar esta justificación?')) return;
    await firstValueFrom(this.http.delete(`/api/justifications/${id}`));
    this.snack.open('Eliminada', '', { duration: 2000 });
    await this.load();
  }
}
