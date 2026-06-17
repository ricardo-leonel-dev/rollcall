import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { AcademicYear, Course, Enrollment, Absence, OcrResult } from '../../core/models/index';
import { DEFAULT_NOTIFICATION_TEMPLATE } from '../../shared/components/notification-settings-dialog/notification-settings-dialog.component';
import { WhatsappIconComponent } from '../../shared/components/whatsapp-icon/whatsapp-icon.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTabsModule, MatFormFieldModule, MatSelectModule, MatInputModule,
            MatButtonModule, MatIconModule, MatCheckboxModule, MatSnackBarModule, MatTooltipModule, WhatsappIconComponent],
  styles: [`
    .tab-content { padding: 20px 0; }
    .enroll-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; border-bottom: 1px solid var(--border-soft);
      transition: background 0.1s;
    }
    .enroll-row:hover { background: var(--paper-deep); }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Inasistencias</h1>
    </div>

    <!-- Filtros comunes -->
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
          <mat-option [value]="null">— Seleccionar —</mat-option>
          @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
    </div>

    <mat-tab-group style="background:var(--paper);border-radius:16px;border:1px solid var(--border);overflow:hidden">

      <!-- TAB FOTO -->
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">photo_camera</mat-icon>
          Desde foto
        </ng-template>
        <div class="tab-content" style="padding:20px">

          <mat-form-field appearance="outline" style="width:200px;margin-bottom:16px">
            <mat-label>Fecha (opcional)</mat-label>
            <input matInput type="date" [(ngModel)]="photoDate">
          </mat-form-field>

          <div class="upload-zone" (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
            <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">cloud_upload</mat-icon>
            <div style="font-weight:600;color:var(--ink-soft);margin-bottom:4px">Arrastra la foto aquí</div>
            <div style="font-size:13px;color:var(--muted);margin-bottom:16px">o usa los botones para seleccionar</div>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
              <label>
                <input type="file" style="display:none" accept="image/*" (change)="onFileSelect($event)">
                <span style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#6366f1;color:white;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">
                  <mat-icon style="font-size:16px;width:16px;height:16px">upload_file</mat-icon> Subir imagen
                </span>
              </label>
              <label class="md:hidden">
                <input type="file" style="display:none" accept="image/*" capture="environment" (change)="onFileSelect($event)">
                <span style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:var(--paper);border:1px solid var(--border);color:var(--ink-soft);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">
                  <mat-icon style="font-size:16px;width:16px;height:16px">camera_alt</mat-icon> Cámara
                </span>
              </label>
            </div>
          </div>

          @if (ocrLoading()) {
            <div style="display:flex;align-items:center;gap:16px;padding:20px;background:var(--paper-deep);border-radius:12px;margin-top:16px">
              <div class="spinner" style="flex-shrink:0"></div>
              <div>
                <div style="font-weight:600;color:var(--ink-soft)">Procesando con IA...</div>
                <div style="font-size:13px;color:var(--muted)">Esto puede tomar varios minutos</div>
              </div>
            </div>
          }

          @if (ocrResult()) {
            <div style="margin-top:16px">
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:12px">
                <div style="display:flex;align-items:center;gap:8px;color:#15803d;font-weight:600">
                  <mat-icon style="font-size:20px;width:20px;height:20px">check_circle</mat-icon>
                  {{ocrResult()!.records_created}} registros creados — Fecha: {{ocrResult()!.date}}
                </div>
              </div>
              @if (ocrResult()!.not_found.length) {
                <div class="card" style="border-left:4px solid #f59e0b">
                  <div style="font-weight:600;color:#b45309;margin-bottom:10px">
                    <mat-icon style="vertical-align:middle;margin-right:4px">warning_amber</mat-icon>
                    {{ocrResult()!.not_found.length}} no encontrados
                  </div>
                  @for (name of ocrResult()!.not_found; track name) {
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #fef3c7">
                      <span style="font-size:13px">{{name}}</span>
                      <button mat-button color="accent" style="font-size:12px" (click)="openManualAdd(name)">Agregar</button>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      </mat-tab>

      <!-- TAB MANUAL -->
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">edit</mat-icon>
          Manual
        </ng-template>
        <div class="tab-content">
          @if (!selCourse) {
            <div class="empty-state" style="padding:40px">
              <mat-icon style="font-size:40px;width:40px;height:40px;color:var(--border)">people</mat-icon>
              <div style="margin-top:8px;color:var(--ink-soft)">Selecciona un curso para registrar</div>
            </div>
          } @else if (enrollLoading()) {
            <div class="spinner-center">
              <div class="spinner"></div>
            </div>
          } @else {
            <div style="padding:12px 16px;background:var(--paper-deep);border-bottom:1px solid var(--border);font-size:12px;color:var(--muted-strong)">
              {{enrollments().length}} estudiantes — haz clic en A (Ausente) o AT (Atraso)
            </div>
            @for (e of enrollments(); track e.enrollmentId) {
              <div class="enroll-row">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:28px;height:28px;border-radius:7px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#4f46e5;flex-shrink:0">
                    {{e.rosterNumber}}
                  </div>
                  <span style="font-size:14px;font-weight:500">{{e.fullName}}</span>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="action-pill action-pill-f" (click)="addAbsence(e.enrollmentId, 'F')">
                    <mat-icon style="font-size:14px;width:14px;height:14px">event_busy</mat-icon> Falta
                  </button>
                  <button class="action-pill action-pill-at" (click)="addAbsence(e.enrollmentId, 'AT')">
                    <mat-icon style="font-size:14px;width:14px;height:14px">schedule</mat-icon> Atrasado
                  </button>
                </div>
              </div>
            }
          }
        </div>
      </mat-tab>

      <!-- TAB LISTADO -->
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">list</mat-icon>
          Listado
        </ng-template>
        <div class="tab-content" style="padding:16px">
          <!-- Sub-filtros -->
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">
            <mat-form-field appearance="outline" style="width:150px">
              <mat-label>Desde</mat-label>
              <input matInput type="date" [(ngModel)]="dateFrom" (change)="loadAbsences()">
            </mat-form-field>
            <mat-form-field appearance="outline" style="width:150px">
              <mat-label>Hasta</mat-label>
              <input matInput type="date" [(ngModel)]="dateTo" (change)="loadAbsences()">
            </mat-form-field>
            <mat-form-field appearance="outline" style="width:130px">
              <mat-label>Tipo</mat-label>
              <mat-select [(ngModel)]="filterType" (ngModelChange)="loadAbsences()">
                <mat-option value="">Todos</mat-option>
                <mat-option value="F">Falta</mat-option>
                <mat-option value="AT">Atrasado</mat-option>
              </mat-select>
            </mat-form-field>
            @if (selectedAbsences().length) {
              <button mat-flat-button color="primary" style="align-self:center" (click)="openJustifyDialog()">
                <mat-icon>task_alt</mat-icon> Justificar ({{selectedAbsences().length}})
              </button>
            }
          </div>

          @if (absLoading()) {
            <div class="spinner-center">
              <div class="spinner"></div>
            </div>
          } @else if (!absences().length) {
            <div class="empty-state">
              <mat-icon style="font-size:40px;width:40px;height:40px;color:var(--border)">event_available</mat-icon>
              <div style="margin-top:8px;color:var(--ink-soft)">Sin inasistencias con estos filtros</div>
            </div>
          } @else {
            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width:40px">
                      <mat-checkbox (change)="toggleAll($event.checked)"></mat-checkbox>
                    </th>
                    <th>Estudiante</th>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Notas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of absences(); track a.id) {
                    <tr>
                      <td>
                        @if (!a.isJustified) {
                          <mat-checkbox [checked]="isSelected(a.id)" (change)="toggleAbsence(a, $event.checked)"></mat-checkbox>
                        }
                      </td>
                      <td style="font-weight:500">{{a.studentName}}</td>
                      <td style="color:var(--muted-strong);white-space:nowrap">{{a.date}}</td>
                      <td><span [class]="'badge-' + a.type">{{typeLabel(a.type)}}</span></td>
                      <td>
                        @if (a.isJustified) {
                          <span class="badge-J">Justificada</span>
                        } @else {
                          <span class="badge-gray">Pendiente</span>
                        }
                      </td>
                      <td style="font-size:12px;color:var(--muted-strong);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                        {{a.notes ?? '—'}}
                      </td>
                      <td style="white-space:nowrap">
                        @if (a.whatsappLink) {
                          <button mat-icon-button style="color:#16a34a" (click)="notifyGuardian(a.whatsappLink, a.studentName, a.date, a.type, a.course, a.isJustified)" matTooltip="Notificar por WhatsApp">
                            <app-whatsapp-icon [size]="20" />
                          </button>
                        }
                        <button mat-icon-button style="color:#b91c1c" (click)="deleteAbsence(a.id)">
                          <mat-icon>delete_outline</mat-icon>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </mat-tab>
    </mat-tab-group>

    <!-- Modal justificación -->
    @if (showJustifyForm()) {
      <div class="modal-overlay">
        <div class="modal-panel">
          <div style="font-family:'Fraunces',serif;font-size:19px;font-weight:600;color:var(--ink);margin-bottom:4px">Justificar inasistencias</div>
          <div style="font-size:13px;color:var(--muted);margin-bottom:16px">{{selectedAbsences().length}} falta(s) seleccionadas</div>
          <div style="background:var(--paper-deep);border-radius:10px;padding:12px;margin-bottom:16px">
            @for (a of selectedAbsences(); track a.id) {
              <div style="font-size:13px;padding:4px 0;color:var(--muted-strong)">
                <strong style="color:var(--ink-soft)">{{a.studentName}}</strong> — {{a.date}}
                <span [class]="'badge-' + a.type" style="margin-left:6px">{{typeLabel(a.type)}}</span>
              </div>
            }
          </div>
          <mat-form-field appearance="outline" style="width:100%;margin-bottom:12px">
            <mat-label>Motivo *</mat-label>
            <textarea matInput [(ngModel)]="justifyReason" rows="3" placeholder="Describe el motivo de la justificación..."></textarea>
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%;margin-bottom:16px">
            <mat-label>Quién notificó</mat-label>
            <input matInput [(ngModel)]="justifyNotifiedBy" placeholder="Representante, médico, etc.">
          </mat-form-field>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button mat-stroked-button (click)="showJustifyForm.set(false)">Cancelar</button>
            <button mat-flat-button color="primary" (click)="submitJustification()" [disabled]="!justifyReason">
              Guardar justificación
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AbsencesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);

  readonly years = signal<AcademicYear[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly enrollments = signal<Enrollment[]>([]);
  readonly absences = signal<Absence[]>([]);
  readonly ocrResult = signal<OcrResult | null>(null);
  readonly ocrLoading = signal(false);
  readonly enrollLoading = signal(false);
  readonly absLoading = signal(false);
  readonly selectedAbsences = signal<Absence[]>([]);
  readonly showJustifyForm = signal(false);

  selYear: number | null = null;
  selCourse: number | null = null;
  photoDate = '';
  dateFrom = '';
  dateTo = '';
  filterType = '';
  justifyReason = '';
  justifyNotifiedBy = '';
  private notificationTemplate = DEFAULT_NOTIFICATION_TEMPLATE;

  async ngOnInit(): Promise<void> {
    const [years, courses, me] = await Promise.all([
      firstValueFrom(this.http.get<AcademicYear[]>('/api/academic-years')),
      firstValueFrom(this.http.get<Course[]>('/api/courses')),
      firstValueFrom(this.http.get<{ notificationTemplate: string | null }>('/api/auth/me')),
    ]);
    this.years.set(years);
    this.courses.set(courses);
    const active = years.find(y => y.isActive);
    if (active) this.selYear = active.id;
    if (me.notificationTemplate) this.notificationTemplate = me.notificationTemplate;
  }

  async onFiltersChange(): Promise<void> {
    if (this.selCourse && this.selYear) {
      this.enrollLoading.set(true);
      try {
        const data = await firstValueFrom(
          this.http.get<Enrollment[]>(`/api/enrollments?course_id=${this.selCourse}&academic_year_id=${this.selYear}`)
        );
        this.enrollments.set(data);
      } finally { this.enrollLoading.set(false); }
      await this.loadAbsences();
    }
  }

  async loadAbsences(): Promise<void> {
    const params: string[] = [];
    if (this.selCourse)  params.push(`course_id=${this.selCourse}`);
    if (this.selYear)    params.push(`academic_year_id=${this.selYear}`);
    if (this.dateFrom)   params.push(`date_from=${this.dateFrom}`);
    if (this.dateTo)     params.push(`date_to=${this.dateTo}`);
    if (this.filterType) params.push(`type=${this.filterType}`);
    this.absLoading.set(true);
    try {
      const data = await firstValueFrom(this.http.get<Absence[]>(`/api/absences?${params.join('&')}`));
      this.absences.set(data);
    } finally { this.absLoading.set(false); }
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) this.processPhoto(file);
  }

  onFileSelect(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.processPhoto(file);
  }

  async processPhoto(file: File): Promise<void> {
    if (!this.selCourse || !this.selYear) {
      this.snackBar.open('Selecciona un curso y año lectivo primero', '', { duration: 3000 });
      return;
    }
    this.ocrLoading.set(true);
    this.ocrResult.set(null);
    try {
      const fd = new FormData();
      fd.append('foto', file);
      fd.append('course_id', String(this.selCourse));
      fd.append('academic_year_id', String(this.selYear));
      if (this.photoDate) fd.append('date', this.photoDate);
      const result = await firstValueFrom(this.http.post<OcrResult>('/ocr/process-photo', fd));
      this.ocrResult.set(result);
      await this.loadAbsences();
    } catch (err: any) {
      this.snackBar.open('Error: ' + (err?.error?.detail ?? err.message), '', { duration: 5000 });
    } finally { this.ocrLoading.set(false); }
  }

  typeLabel(type: 'F' | 'AT'): string {
    return type === 'F' ? 'Falta' : 'Atrasado';
  }

  async addAbsence(enrollmentId: number, type: 'F' | 'AT'): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    try {
      await firstValueFrom(this.http.post('/api/absences', { enrollmentId, date: today, type }));
      const enrollment = this.enrollments().find(e => e.enrollmentId === enrollmentId);
      const link = enrollment?.whatsappLink;
      const ref = this.snackBar.open(`${this.typeLabel(type)} registrada`, link ? 'Notificar' : '', { duration: 4000 });
      if (link) {
        ref.onAction().subscribe(() => this.notifyGuardian(link, enrollment!.fullName, today, type, enrollment!.course));
      }
      await this.loadAbsences();
    } catch (err: any) {
      this.snackBar.open('Error: ' + (err?.error?.error ?? 'ya existe un registro este día'), '', { duration: 3000 });
    }
  }

  notifyGuardian(whatsappLink: string, studentName: string, date: string, type: 'F' | 'AT', course: string, isJustified?: boolean): void {
    if (isJustified) {
      // Ya justificada: abrir el chat vacío, igual que en el listado de estudiantes —
      // no tiene sentido mandar el mensaje con el formato de falta pendiente.
      window.open(whatsappLink, '_blank');
      return;
    }
    const label = type === 'F' ? 'una falta' : 'un atraso';
    const message = this.notificationTemplate
      .replace(/\{\{nombre\}\}/g, studentName)
      .replace(/\{\{fecha\}\}/g, date)
      .replace(/\{\{tipo\}\}/g, label)
      .replace(/\{\{curso\}\}/g, course);
    window.open(`${whatsappLink}?text=${encodeURIComponent(message)}`, '_blank');
  }

  openManualAdd(name: string): void {
    this.snackBar.open(`Busca "${name}" en la pestaña Manual`, '', { duration: 2000 });
  }

  isSelected(id: number): boolean { return this.selectedAbsences().some(a => a.id === id); }

  toggleAbsence(absence: Absence, checked: boolean): void {
    if (checked) this.selectedAbsences.update(s => [...s, absence]);
    else this.selectedAbsences.update(s => s.filter(a => a.id !== absence.id));
  }

  toggleAll(checked: boolean): void {
    if (checked) this.selectedAbsences.set(this.absences().filter(a => !a.isJustified));
    else this.selectedAbsences.set([]);
  }

  openJustifyDialog(): void {
    this.justifyReason = '';
    this.justifyNotifiedBy = '';
    this.showJustifyForm.set(true);
  }

  async submitJustification(): Promise<void> {
    const sel = this.selectedAbsences();
    if (!sel.length || !this.justifyReason) return;
    try {
      await firstValueFrom(this.http.post('/api/justifications', {
        enrollmentId: sel[0].enrollmentId,
        reason: this.justifyReason,
        notifiedBy: this.justifyNotifiedBy || null,
        absenceIds: sel.map(a => a.id),
      }));
      this.snackBar.open('Justificación guardada', '', { duration: 2000 });
      this.showJustifyForm.set(false);
      this.selectedAbsences.set([]);
      await this.loadAbsences();
    } catch (err: any) {
      this.snackBar.open('Error: ' + (err?.error?.error ?? 'Error al guardar'), '', { duration: 4000 });
    }
  }

  async deleteAbsence(id: number): Promise<void> {
    if (!confirm('¿Eliminar esta inasistencia?')) return;
    await firstValueFrom(this.http.delete(`/api/absences/${id}`));
    await this.loadAbsences();
  }
}
