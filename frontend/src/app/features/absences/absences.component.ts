import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { firstValueFrom } from 'rxjs';
import { Course, Enrollment, Absence, OcrResult } from '../../core/models/index';
import { dateToDateString } from '../../shared/utils/date.util';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { NotificationService } from '../../core/services/notification.service';
import { DEFAULT_NOTIFICATION_TEMPLATE } from '../../shared/components/profile-dialog/profile-dialog.component';
import { WhatsappIconComponent } from '../../shared/components/whatsapp-icon/whatsapp-icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { AbsenceRangeDialogComponent, AbsenceRangeDialogResult } from './absence-range-dialog.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTabsModule, MatFormFieldModule, MatSelectModule, MatInputModule,
            MatButtonModule, MatIconModule, MatTooltipModule, MatDatepickerModule, WhatsappIconComponent],
  styles: [`
    .tab-content { padding: 20px 0; }
    .enroll-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; border-bottom: 1px solid var(--border-soft);
      transition: background 0.1s;
    }
    .enroll-row:hover { background: var(--paper-deep); }
    .marked-today { font-size: 11px; color: #15803d; display: flex; align-items: center; gap: 2px; margin-right: 6px; }
    .manual-search {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 10px 5px 8px;
      background: var(--paper); border: 1px solid var(--border-soft); border-radius: 10px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .manual-search:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .manual-search input {
      border: none; outline: none; background: transparent;
      font-family: Nunito, sans-serif; font-size: 13px; color: var(--ink-soft);
      width: 150px;
    }
    .manual-search input::placeholder { color: var(--muted); }
    .manual-search .ms-clear {
      display: flex; align-items: center; cursor: pointer;
      padding: 0; background: none; border: none; color: var(--muted); line-height: 1;
    }
    .manual-search .ms-clear:hover { color: var(--ink-soft); }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Inasistencias</h1>
    </div>

    <!-- Filtros comunes -->
    <div class="filter-bar">
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
            <input matInput [matDatepicker]="pickerPhoto" [(ngModel)]="photoDate">
            <mat-datepicker-toggle matIconSuffix [for]="pickerPhoto"></mat-datepicker-toggle>
            <mat-datepicker #pickerPhoto></mat-datepicker>
          </mat-form-field>

          <div class="upload-zone" (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
            <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px">cloud_upload</mat-icon>
            <div style="font-weight:600;color:var(--ink-soft);margin-bottom:4px">Arrastra la foto aquí</div>
            <div style="font-size:13px;color:var(--muted);margin-bottom:16px">o usa los botones para seleccionar</div>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
              <label>
                <input type="file" style="display:none" accept="image/*" (change)="onFileSelect($event)">
                <span style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:var(--accent);color:white;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">
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
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px;background:var(--paper-deep);border-bottom:1px solid var(--border)">
              <span style="font-size:12px;color:var(--muted-strong);white-space:nowrap">
                @if (manualSearch) {
                  <strong style="color:var(--ink-soft)">{{filteredEnrollments().length}}</strong> de {{enrollments().length}}
                } @else {
                  {{enrollments().length}} estudiantes
                }
              </span>
              <div class="manual-search">
                <mat-icon style="font-size:16px;width:16px;height:16px;color:var(--muted);flex-shrink:0">search</mat-icon>
                <input [(ngModel)]="manualSearch" placeholder="Buscar por nombre...">
                @if (manualSearch) {
                  <button class="ms-clear" (click)="manualSearch = ''" tabindex="-1">
                    <mat-icon style="font-size:16px;width:16px;height:16px">close</mat-icon>
                  </button>
                }
              </div>
            </div>
            @for (e of filteredEnrollments(); track e.enrollmentId) {
              <div class="enroll-row">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:28px;height:28px;border-radius:7px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent);flex-shrink:0">
                    {{e.rosterNumber}}
                  </div>
                  <span style="font-size:14px;font-weight:500">{{e.fullName}}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  @if (markedToday(e.enrollmentId, 'F')) { <span class="marked-today"><mat-icon style="font-size:14px;width:14px;height:14px">check</mat-icon> Falta hoy</span> }
                  @if (markedToday(e.enrollmentId, 'AT')) { <span class="marked-today"><mat-icon style="font-size:14px;width:14px;height:14px">check</mat-icon> Atraso hoy</span> }
                  <button class="action-pill action-pill-f" (click)="openRangeForm(e, 'F')">
                    <mat-icon style="font-size:14px;width:14px;height:14px">event_busy</mat-icon> Falta
                  </button>
                  <button class="action-pill action-pill-at" (click)="openRangeForm(e, 'AT')">
                    <mat-icon style="font-size:14px;width:14px;height:14px">schedule</mat-icon> Atrasado
                  </button>
                </div>
              </div>
            } @empty {
              @if (manualSearch) {
                <div class="empty-state" style="padding:32px">
                  <mat-icon style="font-size:36px;width:36px;height:36px;color:var(--border)">search_off</mat-icon>
                  <div style="margin-top:8px;color:var(--ink-soft)">Ningún estudiante coincide con "<strong>{{manualSearch}}</strong>"</div>
                </div>
              }
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
          <!-- Sub-filtros — vacíos/"Todos" por defecto, que ya equivale a ver todo -->
          <div class="filter-bar" style="flex-direction:column;align-items:stretch">
            <div class="flex flex-col items-stretch md:flex-row md:flex-wrap md:items-center gap-3">
              <div class="flex gap-3 min-w-0">
                <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1;min-width:0;max-width:130px">
                  <mat-label>Desde</mat-label>
                  <input matInput [matDatepicker]="pickerFrom" [(ngModel)]="dateFrom">
                  <mat-datepicker-toggle matIconSuffix [for]="pickerFrom"></mat-datepicker-toggle>
                  <mat-datepicker #pickerFrom></mat-datepicker>
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1;min-width:0;max-width:130px">
                  <mat-label>Hasta</mat-label>
                  <input matInput [matDatepicker]="pickerTo" [(ngModel)]="dateTo">
                  <mat-datepicker-toggle matIconSuffix [for]="pickerTo"></mat-datepicker-toggle>
                  <mat-datepicker #pickerTo></mat-datepicker>
                </mat-form-field>
              </div>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:130px">
                <mat-label>Tipo</mat-label>
                <mat-select [(ngModel)]="filterType">
                  <mat-option value="">Todos</mat-option>
                  <mat-option value="F">Falta</mat-option>
                  <mat-option value="AT">Atrasado</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="md:flex-1" style="min-width:160px">
                <mat-label>Buscar estudiante</mat-label>
                <mat-icon matPrefix style="color:var(--muted)">search</mat-icon>
                <input matInput [(ngModel)]="studentSearch" placeholder="Ej: ANDRADE">
              </mat-form-field>
              <div class="flex gap-2 shrink-0">
                <button mat-flat-button color="primary" (click)="loadAbsences()" style="white-space:nowrap">
                  <mat-icon>filter_alt</mat-icon> Aplicar filtros
                </button>
                <button mat-stroked-button (click)="clearFilters()" style="white-space:nowrap">
                  Limpiar
                </button>
              </div>
            </div>
            @if (studentSearch) {
              <span style="color:var(--muted);font-size:12px;margin-top:8px">{{filteredAbsences().length}} de {{absences().length}}</span>
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
          } @else if (!filteredAbsences().length) {
            <div class="empty-state">
              <mat-icon style="font-size:40px;width:40px;height:40px;color:var(--border)">search_off</mat-icon>
              <div style="margin-top:8px;color:var(--ink-soft)">Ningún estudiante coincide con "{{studentSearch}}"</div>
            </div>
          } @else {
            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Notas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of filteredAbsences(); track a.id) {
                    <tr>
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
                        <button mat-icon-button style="color:#b91c1c" (click)="deleteAbsence(a)">
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
  `,
})
export class AbsencesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  readonly academicYearContext = inject(AcademicYearContextService);

  readonly courses = signal<Course[]>([]);
  readonly enrollments = signal<Enrollment[]>([]);
  readonly absences = signal<Absence[]>([]);
  readonly ocrResult = signal<OcrResult | null>(null);
  readonly ocrLoading = signal(false);
  readonly enrollLoading = signal(false);
  readonly absLoading = signal(false);
  readonly todayAbsences = signal<Absence[]>([]);

  selYear: number | null = null;
  selCourse: number | null = null;
  photoDate: Date | null = null;
  dateFrom: Date | null = null;
  dateTo: Date | null = null;
  filterType = '';
  studentSearch = '';
  manualSearch = '';
  private notificationTemplate = DEFAULT_NOTIFICATION_TEMPLATE;

  async ngOnInit(): Promise<void> {
    const [courses, me] = await Promise.all([
      firstValueFrom(this.http.get<Course[]>('/api/courses')),
      firstValueFrom(this.http.get<{ notificationTemplate: string | null }>('/api/auth/me')),
    ]);
    this.courses.set(courses);
    this.selYear = this.academicYearContext.selected()?.id ?? null;
    if (me.notificationTemplate) this.notificationTemplate = me.notificationTemplate;
  }

  private todayStr(): string { return new Date().toISOString().split('T')[0]; }

  async onFiltersChange(): Promise<void> {
    this.manualSearch = '';
    if (this.selCourse && this.selYear) {
      this.enrollLoading.set(true);
      try {
        const data = await firstValueFrom(
          this.http.get<Enrollment[]>(`/api/enrollments?course_id=${this.selCourse}&academic_year_id=${this.selYear}`)
        );
        this.enrollments.set(data);
      } finally { this.enrollLoading.set(false); }
      await Promise.all([this.loadAbsences(), this.loadTodayAbsences()]);
    }
  }

  async loadTodayAbsences(): Promise<void> {
    if (!this.selCourse) { this.todayAbsences.set([]); return; }
    const today = this.todayStr();
    const data = await firstValueFrom(
      this.http.get<Absence[]>(`/api/absences?course_id=${this.selCourse}&date_from=${today}&date_to=${today}`)
    );
    this.todayAbsences.set(data);
  }

  markedToday(enrollmentId: number, type: 'F' | 'AT'): boolean {
    return this.todayAbsences().some(a => a.enrollmentId === enrollmentId && a.type === type);
  }

  async loadAbsences(): Promise<void> {
    const params: string[] = [];
    if (this.selCourse)  params.push(`course_id=${this.selCourse}`);
    if (this.selYear)    params.push(`academic_year_id=${this.selYear}`);
    if (this.dateFrom)   params.push(`date_from=${dateToDateString(this.dateFrom)}`);
    if (this.dateTo)     params.push(`date_to=${dateToDateString(this.dateTo)}`);
    if (this.filterType) params.push(`type=${this.filterType}`);
    this.absLoading.set(true);
    try {
      const data = await firstValueFrom(this.http.get<Absence[]>(`/api/absences?${params.join('&')}`));
      this.absences.set(data);
    } finally { this.absLoading.set(false); }
  }

  filteredEnrollments(): Enrollment[] {
    const q = this.manualSearch.trim().toLowerCase();
    if (!q) return this.enrollments();
    return this.enrollments().filter(e =>
      e.fullName.toLowerCase().includes(q) ||
      String(e.rosterNumber ?? '').includes(q)
    );
  }

  filteredAbsences(): Absence[] {
    const q = this.studentSearch.trim().toLowerCase();
    if (!q) return this.absences();
    return this.absences().filter(a => a.studentName.toLowerCase().includes(q));
  }

  clearFilters(): void {
    this.dateFrom = null;
    this.dateTo = null;
    this.filterType = '';
    this.studentSearch = '';
    this.loadAbsences();
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
      this.notify.warning('Selecciona un curso y año lectivo primero');
      return;
    }
    this.ocrLoading.set(true);
    this.ocrResult.set(null);
    try {
      const fd = new FormData();
      fd.append('foto', file);
      fd.append('course_id', String(this.selCourse));
      fd.append('academic_year_id', String(this.selYear));
      if (this.photoDate) fd.append('date', dateToDateString(this.photoDate));
      const result = await firstValueFrom(this.http.post<OcrResult>('/api/ocr/process-photo', fd));
      this.ocrResult.set(result);
      await this.loadAbsences();
    } catch (err: any) {
      this.notify.error(err?.error?.detail ?? err.message, { duration: 5000 });
    } finally { this.ocrLoading.set(false); }
  }

  typeLabel(type: 'F' | 'AT'): string {
    return type === 'F' ? 'Falta' : 'Atrasado';
  }

  openRangeForm(enrollment: Enrollment, type: 'F' | 'AT'): void {
    this.dialog.open(AbsenceRangeDialogComponent, {
      width: '420px',
      data: { fullName: enrollment.fullName, type },
    }).afterClosed().subscribe((result?: AbsenceRangeDialogResult) => {
      if (result) this.saveAbsenceRange(enrollment, type, result);
    });
  }

  private async saveAbsenceRange(enrollment: Enrollment, type: 'F' | 'AT', f: AbsenceRangeDialogResult): Promise<void> {
    try {
      const result = await firstValueFrom(this.http.post<{ created: number; skipped: number }>('/api/absences', {
        enrollmentId: enrollment.enrollmentId, type, dateFrom: f.dateFrom, dateTo: f.dateTo,
        notes: f.notes || undefined,
      }));
      const msg = result.skipped > 0
        ? `${result.created} registro(s) creado(s), ${result.skipped} ya existían`
        : `${result.created} registro(s) creado(s)`;
      const link = enrollment.whatsappLink;
      const dateLabel = f.dateFrom === f.dateTo ? f.dateFrom : `${f.dateFrom} al ${f.dateTo}`;
      this.notify.success(msg, {
        duration: 10000,
        actionLabel: link ? 'Enviar WhatsApp' : undefined,
        actionIcon: 'whatsapp',
        onAction: link ? () => this.notifyGuardian(link, enrollment.fullName, dateLabel, type, enrollment.course) : undefined,
      });
      await Promise.all([this.loadTodayAbsences(), this.loadAbsences()]);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo guardar');
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
    this.notify.info(`Busca "${name}" en la pestaña Manual`);
  }

  deleteAbsence(a: Absence): void {
    const message = a.isJustified
      ? 'Esta falta ya está justificada. Si la eliminas, también se quitará de esa justificación (y la justificación se eliminará si no le queda ninguna otra falta). Esta acción no se puede deshacer.'
      : '¿Eliminar esta inasistencia? Esta acción no se puede deshacer.';
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar inasistencia', message },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await firstValueFrom(this.http.delete(`/api/absences/${a.id}`));
      await this.loadAbsences();
    });
  }
}
