import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { Justification, Course, Enrollment, Absence } from '../../core/models/index';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { NotificationService } from '../../core/services/notification.service';
import { JustificationCreateDialogComponent, JustifyGroup } from './justification-create-dialog.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatButtonModule, MatIconModule],
  styles: [`
    /* Same pinned-evidence language as the "Nueva justificación" wizard, so a
       photo looks like the same object whether it's mid-upload there or
       already filed here. */
    .evidence-row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 4px; }
    .evidence-tile {
      position: relative; display: block;
      width: 56px; height: 56px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px;
      box-shadow: 0 2px 6px rgba(15, 23, 42, .14);
      transform: rotate(var(--r, 0deg));
      transition: transform .15s ease;
    }
    .evidence-tile:hover { transform: rotate(0deg) scale(1.1); z-index: 2; }
    .evidence-tile img { width: 100%; height: 100%; object-fit: cover; border-radius: 2px; display: block; }
    .evidence-tile-doc {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 2px; background: var(--paper-deep); border-style: dashed; border-color: var(--muted);
    }
    .evidence-tile-doc mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--muted-strong); }
    .evidence-tile-doc span {
      display: block; max-width: 46px; font-size: 8px; color: var(--muted-strong);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px;
    }
    .evidence-remove {
      position: absolute; top: -8px; right: -8px;
      width: 20px; height: 20px; border-radius: 50%;
      background: #fff; border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; padding: 0;
    }
    .evidence-remove mat-icon { font-size: 12px; width: 12px; height: 12px; color: #b91c1c; }
    .evidence-add-pill {
      display: inline-flex; align-items: center; gap: 4px;
      height: 32px; padding: 0 12px;
      border-radius: 8px; border: 1px dashed var(--muted);
      background: transparent; color: var(--muted-strong);
      font-size: 12px; font-weight: 600; cursor: pointer;
      transition: all .15s ease;
    }
    .evidence-add-pill:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .evidence-add-pill mat-icon { font-size: 16px; width: 16px; height: 16px; }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Justificaciones</h1>
    </div>

    <div class="filter-bar">
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
      } @else if (!studentEnrollments().length) {
        <div style="font-size:13px;color:var(--muted)">Nadie en este curso tiene faltas pendientes de justificar.</div>
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
          <div style="font-size:13px;color:var(--muted-strong);margin-bottom:12px">
            {{groups().length}} semana(s) con faltas seleccionadas. El motivo y los adjuntos se completan en el siguiente paso.
          </div>
          <button mat-flat-button color="primary" (click)="openCreateWizard()">
            <mat-icon>arrow_forward</mat-icon> Continuar ({{groups().length}} semana(s))
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

                  <div class="evidence-row" style="margin-top:10px">
                    @for (a of j.attachments; track a.id) {
                      @if (a.mimeType.startsWith('image/')) {
                        <a class="evidence-tile" [href]="a.url" target="_blank" [style.--r.deg]="rotationFor(a.fileName)">
                          <img [src]="a.url">
                          <button class="evidence-remove" (click)="removeAttachment(j.id, a.id); $event.preventDefault()">
                            <mat-icon>close</mat-icon>
                          </button>
                        </a>
                      } @else {
                        <a class="evidence-tile evidence-tile-doc" [href]="a.url" target="_blank" [style.--r.deg]="rotationFor(a.fileName)">
                          <mat-icon>description</mat-icon>
                          <span>{{a.originalName}}</span>
                          <button class="evidence-remove" (click)="removeAttachment(j.id, a.id); $event.preventDefault()">
                            <mat-icon>close</mat-icon>
                          </button>
                        </a>
                      }
                    }
                    <input type="file" #attInput hidden multiple
                           accept="image/png,image/jpeg,image/webp,application/pdf,.doc,.docx"
                           (change)="onAddAttachments(j.id, $event)">
                    <button class="evidence-add-pill" (click)="attInput.click()">
                      <mat-icon>add</mat-icon> Adjuntar
                    </button>
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
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  readonly academicYearContext = inject(AcademicYearContextService);

  readonly courses = signal<Course[]>([]);
  readonly justifications = signal<Justification[]>([]);
  readonly loading = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly studentEnrollments = signal<Enrollment[]>([]);
  readonly unjustified = signal<Absence[]>([]);
  readonly selectedIds = signal<Set<number>>(new Set());

  selYear: number | null = null;
  selCourse: number | null = null;
  selStudent: number | null = null;
  editReason = '';
  editNotifiedBy = '';

  async ngOnInit(): Promise<void> {
    this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
    const active = this.academicYearContext.selected();
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
    if (this.selYear && this.selCourse) {
      const [enrollments, pending] = await Promise.all([
        firstValueFrom(this.http.get<Enrollment[]>(`/api/enrollments?course_id=${this.selCourse}&academic_year_id=${this.selYear}`)),
        firstValueFrom(this.http.get<Absence[]>(`/api/absences?course_id=${this.selCourse}&academic_year_id=${this.selYear}&is_justified=false`)),
      ]);
      const pendingEnrollmentIds = new Set(pending.map(a => a.enrollmentId));
      this.studentEnrollments.set(enrollments.filter(e => pendingEnrollmentIds.has(e.enrollmentId)));
    } else {
      this.studentEnrollments.set([]);
    }
  }

  async onStudentChange(): Promise<void> {
    this.selectedIds.set(new Set());
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

  async openCreateWizard(): Promise<void> {
    const gs = this.groups();
    if (!gs.length) return;
    const ref = this.dialog.open(JustificationCreateDialogComponent, {
      width: '560px',
      data: { groups: gs },
    });
    const saved = await firstValueFrom(ref.afterClosed());
    if (saved) {
      this.selectedIds.set(new Set());
      await this.onStudentChange();
      await this.load();
    }
  }

  // Same deterministic tilt as the wizard's evidence tiles — stable across
  // re-renders, just enough to read as loosely pinned rather than aligned.
  rotationFor(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return (Math.abs(hash) % 9) - 4;
  }

  async onAddAttachments(justificationId: number, ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    try {
      await firstValueFrom(this.http.post(`/api/justifications/${justificationId}/attachments`, fd));
      this.notify.success('Adjunto(s) agregado(s)');
      await this.load();
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'Error al subir archivo');
    }
  }

  removeAttachment(justificationId: number, attachmentId: number): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar adjunto', message: 'Esta evidencia se eliminará permanentemente. Esta acción no se puede deshacer.' },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await firstValueFrom(this.http.delete(`/api/justifications/${justificationId}/attachments/${attachmentId}`));
      this.notify.success('Adjunto eliminado');
      await this.load();
    });
  }

  startEdit(j: Justification): void {
    this.editReason = j.reason ?? '';
    this.editNotifiedBy = j.notifiedBy ?? '';
    this.editingId.set(j.id);
  }

  async saveEdit(id: number): Promise<void> {
    await firstValueFrom(this.http.put(`/api/justifications/${id}`, { reason: this.editReason, notifiedBy: this.editNotifiedBy }));
    this.editingId.set(null);
    this.notify.success('Justificación actualizada');
    await this.load();
  }

  remove(id: number): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar justificación', message: '¿Eliminar esta justificación? Las faltas asociadas no se eliminan, solo dejan de estar justificadas. Esta acción no se puede deshacer.' },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await firstValueFrom(this.http.delete(`/api/justifications/${id}`));
      this.notify.success('Eliminada');
      await this.load();
    });
  }
}
