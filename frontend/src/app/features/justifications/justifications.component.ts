import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { Justification, AcademicYear, Course } from '../../core/models/index';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, MatFormFieldModule, MatSelectModule, MatInputModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="page-header">
      <h1 class="page-title">Justificaciones</h1>
    </div>

    <div class="filter-bar">
      <mat-form-field appearance="outline" style="width:180px">
        <mat-label>Año lectivo</mat-label>
        <mat-select [(ngModel)]="selYear" (ngModelChange)="load()">
          @for (y of years(); track y.id) { <mat-option [value]="y.id">{{y.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:220px">
        <mat-label>Curso</mat-label>
        <mat-select [(ngModel)]="selCourse" (ngModelChange)="load()">
          <mat-option [value]="null">Todos los cursos</mat-option>
          @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
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
          No hay justificaciones con los filtros seleccionados. Para crear una, ve a Inasistencias → pestaña "Listado", marca las faltas a justificar y presiona "Justificar".
        </div>
        <a mat-flat-button color="primary" routerLink="/absences" style="margin-top:16px">
          <mat-icon>event_busy</mat-icon> Ir a Inasistencias
        </a>
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

  selYear: number | null = null;
  selCourse: number | null = null;
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
