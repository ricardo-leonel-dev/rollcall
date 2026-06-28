import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { Justification, Course, Absence } from '../../core/models/index';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { NotificationService } from '../../core/services/notification.service';
import { JustificationCreateDialogComponent, JustifyGroup } from './justification-create-dialog.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTabsModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatButtonModule, MatIconModule],
  styles: [`
    .tab-content { padding: 20px 0; }
    /* Evidencias — mismo lenguaje visual que el wizard de creación */
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

    <!-- Filtro de curso compartido entre tabs -->
    <div class="filter-bar" style="margin-bottom:0;border-radius:var(--radius-lg) var(--radius-lg) 0 0;border-bottom:none">
      <mat-form-field appearance="outline" style="width:220px">
        <mat-label>Curso</mat-label>
        <mat-select [(ngModel)]="selCourse" (ngModelChange)="onCourseChange()">
          <mat-option [value]="null">Todos los cursos</mat-option>
          @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
    </div>

    <mat-tab-group [(selectedIndex)]="selectedTabIndex"
                   style="background:var(--paper);border-radius:0 0 var(--radius-lg) var(--radius-lg);border:1px solid var(--border);border-top:none;overflow:hidden;margin-bottom:20px">

      <!-- ═══ TAB 1: NUEVA JUSTIFICACIÓN ═══ -->
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">add_task</mat-icon>
          Nueva justificación
        </ng-template>

        <div class="tab-content" style="padding:20px">
          @if (!selYear || !selCourse) {
            <div class="empty-state" style="padding:32px">
              <mat-icon style="font-size:40px;width:40px;height:40px;color:var(--border)">school</mat-icon>
              <div style="margin-top:8px;color:var(--ink-soft)">Selecciona un curso para ver estudiantes con faltas pendientes</div>
            </div>
          } @else if (!pendingStudents().length) {
            <div class="empty-state" style="padding:32px">
              <mat-icon style="font-size:40px;width:40px;height:40px;color:var(--border)">check_circle</mat-icon>
              <div style="margin-top:8px;color:var(--ink-soft)">Nadie en este curso tiene faltas pendientes de justificar</div>
            </div>
          } @else {
            <div style="margin-bottom:16px">
              <mat-form-field appearance="outline" style="width:320px">
                <mat-label>Estudiante con faltas pendientes</mat-label>
                <mat-select [(ngModel)]="selStudentCreate" (ngModelChange)="onStudentCreateChange()">
                  <mat-option [value]="null">— Seleccionar estudiante —</mat-option>
                  @for (s of pendingStudents(); track s.enrollmentId) {
                    <mat-option [value]="s.enrollmentId">{{s.fullName}}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>

            @if (selStudentCreate) {
              @if (!unjustified().length) {
                <div style="font-size:13px;color:var(--muted)">Este estudiante no tiene faltas pendientes de justificar.</div>
              } @else {
                <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted-strong);margin-bottom:10px">
                  Marca las faltas a justificar
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
                  @for (a of unjustified(); track a.id) {
                    <label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px">
                      <input type="checkbox" [checked]="selectedIds().has(a.id)" (change)="toggleSelect(a.id)">
                      {{a.date}} <span [class]="'badge-' + a.type">{{a.type}}</span>
                    </label>
                  }
                </div>

                @if (groups().length) {
                  <div style="font-size:13px;color:var(--muted-strong);margin-bottom:12px">
                    {{groups().length}} semana(s) seleccionada(s). El motivo y adjuntos se completan en el siguiente paso.
                  </div>
                  <button mat-flat-button color="primary" (click)="openCreateWizard()">
                    <mat-icon>arrow_forward</mat-icon> Continuar ({{groups().length}} semana(s))
                  </button>
                }
              }
            }
          }
        </div>
      </mat-tab>

      <!-- ═══ TAB 2: HISTORIAL ═══ -->
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">history</mat-icon>
          Historial
        </ng-template>

        <div class="tab-content" style="padding:20px">

          <!-- Sub-filtro interno del historial -->
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:20px">
            @if (studentsWithJustifications().length) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:300px">
                <mat-label>Filtrar por estudiante</mat-label>
                <mat-select [ngModel]="selStudentHistorial()" (ngModelChange)="selStudentHistorial.set($event); currentPage.set(0)">
                  <mat-option [value]="null">Todos los estudiantes</mat-option>
                  @for (s of studentsWithJustifications(); track s.enrollmentId) {
                    <mat-option [value]="s.enrollmentId">{{s.fullName}}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
            @if (filteredJustifications().length) {
              <div style="align-self:center;background:var(--accent-soft);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;color:var(--accent)">
                {{filteredJustifications().length}} justificación(es)
              </div>
            }
          </div>

          <!-- Lista -->
          @if (loading()) {
            <div class="spinner-center" style="height:200px">
              <div class="spinner"></div>
            </div>
          } @else if (!filteredJustifications().length) {
            <div class="empty-state" style="padding:40px">
              <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">task_alt</mat-icon>
              <div style="font-weight:600;color:var(--ink-soft)">Sin justificaciones</div>
              <div style="font-size:13px;color:var(--muted);margin-top:4px;max-width:340px;text-align:center">
                No hay justificaciones con los filtros seleccionados.
              </div>
            </div>
          } @else {
            <div style="display:flex;flex-direction:column;gap:12px">
              @for (j of pagedJustifications(); track j.id) {
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
                        @if (j.studentName) {
                          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">
                            <mat-icon style="font-size:14px;width:14px;height:14px;color:var(--accent)">person</mat-icon>
                            <span style="font-weight:600;font-size:13px;color:var(--ink-soft)">{{j.studentName}}</span>
                            @if (j.courseName) {
                              <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted-strong);background:var(--paper-deep);padding:2px 7px;border-radius:4px">{{j.courseName}}</span>
                            }
                          </div>
                        }
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

            <!-- Paginador -->
            @if (totalPages() > 1) {
              <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
                <span style="font-size:13px;color:var(--muted)">
                  {{currentPage() * PAGE_SIZE + 1}}–{{clamp(filteredJustifications().length, (currentPage() + 1) * PAGE_SIZE)}}
                  de {{filteredJustifications().length}}
                </span>
                <div style="display:flex;align-items:center;gap:4px">
                  <button mat-icon-button [disabled]="currentPage() === 0" (click)="prevPage()">
                    <mat-icon>chevron_left</mat-icon>
                  </button>
                  <span style="font-size:13px;font-weight:600;color:var(--ink-soft);padding:0 8px">
                    {{currentPage() + 1}} / {{totalPages()}}
                  </span>
                  <button mat-icon-button [disabled]="currentPage() === totalPages() - 1" (click)="nextPage()">
                    <mat-icon>chevron_right</mat-icon>
                  </button>
                </div>
              </div>
            }
          }
        </div>
      </mat-tab>

    </mat-tab-group>
  `,
})
export class JustificationsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  readonly academicYearContext = inject(AcademicYearContextService);

  readonly courses = signal<Course[]>([]);

  // ─── Shared ───────────────────────────────────────────────────────────────
  selectedTabIndex = 0;
  selYear: number | null = null;
  selCourse: number | null = null;

  // ─── Tab 1: Nueva justificación ───────────────────────────────────────────
  readonly pendingStudents = signal<{ enrollmentId: number; fullName: string }[]>([]);
  selStudentCreate: number | null = null;
  readonly unjustified = signal<Absence[]>([]);
  readonly selectedIds = signal<Set<number>>(new Set());

  // ─── Tab 2: Historial ─────────────────────────────────────────────────────
  readonly allJustifications = signal<Justification[]>([]);
  readonly loading = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly selStudentHistorial = signal<number | null>(null);
  readonly currentPage = signal(0);
  readonly PAGE_SIZE = 10;
  editReason = '';
  editNotifiedBy = '';

  readonly studentsWithJustifications = computed(() => {
    const seen = new Map<number, string>();
    for (const j of this.allJustifications()) {
      if (!seen.has(j.enrollmentId)) seen.set(j.enrollmentId, j.studentName ?? '');
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ enrollmentId: id, fullName: name }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  });

  readonly filteredJustifications = computed(() => {
    const sel = this.selStudentHistorial();
    if (!sel) return this.allJustifications();
    return this.allJustifications().filter(j => j.enrollmentId === sel);
  });

  readonly pagedJustifications = computed(() => {
    const start = this.currentPage() * this.PAGE_SIZE;
    return this.filteredJustifications().slice(start, start + this.PAGE_SIZE);
  });

  readonly totalPages = computed(() =>
    Math.ceil(this.filteredJustifications().length / this.PAGE_SIZE)
  );

  async ngOnInit(): Promise<void> {
    this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
    const active = this.academicYearContext.selected();
    if (active) { this.selYear = active.id; await this.loadHistorial(); }
  }

  async loadHistorial(): Promise<void> {
    this.loading.set(true);
    try {
      const params: string[] = [];
      if (this.selYear)   params.push(`academic_year_id=${this.selYear}`);
      if (this.selCourse) params.push(`course_id=${this.selCourse}`);
      const qs = params.length ? '?' + params.join('&') : '';
      const data = await firstValueFrom(this.http.get<Justification[]>(`/api/justifications${qs}`));
      this.allJustifications.set(data);
    } finally { this.loading.set(false); }
  }

  async loadPendingStudents(): Promise<void> {
    if (!this.selYear || !this.selCourse) { this.pendingStudents.set([]); return; }
    const pending = await firstValueFrom(
      this.http.get<Absence[]>(
        `/api/absences?course_id=${this.selCourse}&academic_year_id=${this.selYear}&is_justified=false`
      )
    );
    const seen = new Map<number, string>();
    for (const a of pending) {
      if (!seen.has(a.enrollmentId)) seen.set(a.enrollmentId, a.studentName);
    }
    this.pendingStudents.set(
      [...seen.entries()]
        .map(([id, name]) => ({ enrollmentId: id, fullName: name }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
    );
  }

  async onCourseChange(): Promise<void> {
    this.selStudentCreate = null;
    this.selStudentHistorial.set(null);
    this.unjustified.set([]);
    this.selectedIds.set(new Set());
    this.currentPage.set(0);
    await Promise.all([this.loadHistorial(), this.loadPendingStudents()]);
  }

  async onStudentCreateChange(): Promise<void> {
    this.selectedIds.set(new Set());
    this.unjustified.set([]);
    if (!this.selStudentCreate) return;
    const data = await firstValueFrom(
      this.http.get<Absence[]>(`/api/absences?enrollment_id=${this.selStudentCreate}&is_justified=false`)
    );
    this.unjustified.set(data);
  }

  onStudentHistorialChange(): void { this.currentPage.set(0); }

  prevPage(): void { this.currentPage.update(p => p - 1); }
  nextPage(): void { this.currentPage.update(p => p + 1); }

  clamp(total: number, end: number): number { return Math.min(total, end); }

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
      await Promise.all([
        this.onStudentCreateChange(),
        this.loadHistorial(),
        this.loadPendingStudents(),
      ]);
    }
  }

  // Misma inclinación determinista que los tiles del wizard — estable entre renders.
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
      await this.loadHistorial();
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
      await this.loadHistorial();
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
    await this.loadHistorial();
  }

  remove(id: number): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar justificación', message: '¿Eliminar esta justificación? Las faltas asociadas no se eliminan, solo dejan de estar justificadas. Esta acción no se puede deshacer.' },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await firstValueFrom(this.http.delete(`/api/justifications/${id}`));
      this.notify.success('Eliminada');
      await this.loadHistorial();
    });
  }
}
