import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, firstValueFrom } from 'rxjs';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { AcademicYear, Course, Enrollment, Absence, OcrResult } from '../../core/models/index';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatTabsModule, MatCardModule, MatFormFieldModule, MatSelectModule,
    MatInputModule, MatButtonModule, MatIconModule, MatTableModule, MatCheckboxModule,
    MatDialogModule, MatProgressSpinnerModule, MatSnackBarModule,
    MatDatepickerModule, MatNativeDateModule, LoadingSpinnerComponent,
  ],
  template: `
    <div class="page-title">Inasistencias</div>

    <!-- Filtros comunes -->
    <div class="flex flex-wrap gap-3 mb-4">
      <mat-form-field appearance="outline" class="w-44">
        <mat-label>Año lectivo</mat-label>
        <mat-select [(ngModel)]="selYear" (ngModelChange)="onFiltersChange()">
          @for (y of years(); track y.id) { <mat-option [value]="y.id">{{y.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="w-56">
        <mat-label>Curso</mat-label>
        <mat-select [(ngModel)]="selCourse" (ngModelChange)="onFiltersChange()">
          <mat-option [value]="null">-- Seleccionar --</mat-option>
          @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
    </div>

    <mat-tab-group>
      <!-- TAB 1: DESDE FOTO -->
      <mat-tab label="📷 Desde foto">
        <div class="pt-4">
          <div class="flex flex-wrap gap-3 mb-4">
            <mat-form-field appearance="outline" class="w-44">
              <mat-label>Fecha (opcional)</mat-label>
              <input matInput type="date" [(ngModel)]="photoDate">
            </mat-form-field>
          </div>

          <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
               (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
            <mat-icon class="text-gray-400 text-5xl" style="font-size:48px">photo_camera</mat-icon>
            <p class="text-gray-500 mt-2">Arrastra una foto aquí o usa los botones</p>
            <div class="flex justify-center gap-3 mt-4 flex-wrap">
              <label mat-flat-button color="primary" class="cursor-pointer">
                <input type="file" class="hidden" accept="image/*" (change)="onFileSelect($event)">
                <span class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded">
                  <mat-icon>upload_file</mat-icon> Subir imagen
                </span>
              </label>
              <label mat-stroked-button class="cursor-pointer md:hidden">
                <input type="file" class="hidden" accept="image/*" capture="environment" (change)="onFileSelect($event)">
                <span class="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded">
                  <mat-icon>camera_alt</mat-icon> Tomar foto
                </span>
              </label>
            </div>
          </div>

          @if (ocrLoading()) {
            <app-loading-spinner message="Procesando imagen con IA... esto puede tomar varios minutos" />
          }

          @if (ocrResult()) {
            <div class="mt-4 space-y-4">
              <div class="card">
                <div class="text-green-700 font-medium mb-2">
                  ✅ {{ocrResult()!.records_created}} registros creados — Fecha: {{ocrResult()!.date}}
                </div>
                @if (ocrResult()!.not_found.length > 0) {
                  <div class="mt-3">
                    <div class="text-orange-600 font-medium mb-2">⚠️ No encontrados ({{ocrResult()!.not_found.length}}):</div>
                    @for (name of ocrResult()!.not_found; track name) {
                      <div class="flex items-center justify-between py-1 border-b border-gray-100">
                        <span class="text-sm">{{name}}</span>
                        <button mat-stroked-button color="accent" class="text-xs"
                                (click)="openManualAdd(name)">
                          Agregar manual
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </mat-tab>

      <!-- TAB 2: MANUAL -->
      <mat-tab label="✏️ Manual">
        <div class="pt-4">
          @if (!selCourse) {
            <p class="text-gray-500">Selecciona un curso para ver los estudiantes</p>
          } @else if (enrollLoading()) {
            <app-loading-spinner />
          } @else {
            <div class="overflow-auto">
              @for (e of enrollments(); track e.enrollmentId) {
                <div class="flex items-center justify-between py-2 border-b border-gray-100 hover:bg-gray-50">
                  <div>
                    <span class="text-sm font-medium">{{e.rosterNumber}}. {{e.fullName}}</span>
                  </div>
                  <div class="flex gap-2">
                    <button mat-mini-fab color="warn" (click)="addAbsence(e.enrollmentId, 'A')" title="Falta (A)" class="scale-75">A</button>
                    <button mat-mini-fab color="accent" (click)="addAbsence(e.enrollmentId, 'AT')" title="Atraso (AT)" class="scale-75">AT</button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </mat-tab>

      <!-- TAB 3: LISTADO -->
      <mat-tab label="📋 Listado">
        <div class="pt-4">
          <div class="flex flex-wrap gap-3 mb-4">
            <mat-form-field appearance="outline" class="w-36">
              <mat-label>Desde</mat-label>
              <input matInput type="date" [(ngModel)]="dateFrom" (change)="loadAbsences()">
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-36">
              <mat-label>Hasta</mat-label>
              <input matInput type="date" [(ngModel)]="dateTo" (change)="loadAbsences()">
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-32">
              <mat-label>Tipo</mat-label>
              <mat-select [(ngModel)]="filterType" (ngModelChange)="loadAbsences()">
                <mat-option value="">Todos</mat-option>
                <mat-option value="A">Falta (A)</mat-option>
                <mat-option value="AT">Atraso (AT)</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-40">
              <mat-label>Justificación</mat-label>
              <mat-select [(ngModel)]="filterJustified" (ngModelChange)="loadAbsences()">
                <mat-option value="">Todos</mat-option>
                <mat-option value="true">Justificadas</mat-option>
                <mat-option value="false">Sin justificar</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          @if (selectedAbsences().length > 0) {
            <div class="mb-3 flex items-center gap-3">
              <span class="text-sm text-blue-600">{{selectedAbsences().length}} seleccionadas</span>
              <button mat-flat-button color="primary" (click)="openJustifyDialog()">
                <mat-icon>verified</mat-icon> Justificar selección
              </button>
              <button mat-stroked-button (click)="selectedAbsences.set([])">Limpiar</button>
            </div>
          }

          @if (absLoading()) {
            <app-loading-spinner />
          } @else {
            <!-- Desktop table -->
            <div class="hidden md:block overflow-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="p-2 text-left"><mat-checkbox (change)="toggleAll($event.checked)" /></th>
                    <th class="p-2 text-left">N°</th>
                    <th class="p-2 text-left">Estudiante</th>
                    <th class="p-2 text-left">Fecha</th>
                    <th class="p-2 text-left">Tipo</th>
                    <th class="p-2 text-left">Estado</th>
                    <th class="p-2 text-left">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of absences(); track a.id) {
                    <tr class="border-b border-gray-100 hover:bg-gray-50">
                      <td class="p-2">
                        <mat-checkbox
                          [checked]="isSelected(a.id)"
                          [disabled]="a.isJustified"
                          (change)="toggleAbsence(a, $event.checked)" />
                      </td>
                      <td class="p-2 text-gray-500">{{a.rosterNumber}}</td>
                      <td class="p-2">{{a.studentName}}</td>
                      <td class="p-2">{{a.date}}</td>
                      <td class="p-2"><span [class]="'badge-' + a.type">{{a.type}}</span></td>
                      <td class="p-2">
                        @if (a.isJustified) {
                          <span class="badge-J">J</span>
                        } @else {
                          <span class="text-gray-400 text-xs">—</span>
                        }
                      </td>
                      <td class="p-2">
                        <button mat-icon-button color="warn" (click)="deleteAbsence(a.id)" title="Eliminar">
                          <mat-icon class="text-sm">delete</mat-icon>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- Mobile cards -->
            <div class="md:hidden space-y-2">
              @for (a of absences(); track a.id) {
                <div class="card flex justify-between items-start">
                  <div>
                    <div class="font-medium text-sm">{{a.studentName}}</div>
                    <div class="text-xs text-gray-500">{{a.date}} · {{a.course}}</div>
                    <div class="flex gap-2 mt-1">
                      <span [class]="'badge-' + a.type">{{a.type}}</span>
                      @if (a.isJustified) { <span class="badge-J">J</span> }
                    </div>
                  </div>
                  <div class="flex gap-1">
                    <mat-checkbox [checked]="isSelected(a.id)" [disabled]="a.isJustified"
                                  (change)="toggleAbsence(a, $event.checked)" />
                    <button mat-icon-button color="warn" (click)="deleteAbsence(a.id)">
                      <mat-icon class="text-sm">delete</mat-icon>
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </mat-tab>
    </mat-tab-group>

    <!-- Dialog justificación -->
    @if (showJustifyForm()) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <mat-card class="w-full max-w-md">
          <mat-card-header>
            <mat-card-title>Justificar {{selectedAbsences().length}} falta(s)</mat-card-title>
          </mat-card-header>
          <mat-card-content class="pt-4 space-y-3">
            <div class="text-sm text-gray-600 mb-3">
              @for (a of selectedAbsences(); track a.id) {
                <div>• {{a.studentName}} — {{a.date}} <span [class]="'badge-' + a.type">{{a.type}}</span></div>
              }
            </div>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Motivo de justificación</mat-label>
              <textarea matInput [(ngModel)]="justifyReason" rows="3"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Quién notificó</mat-label>
              <input matInput [(ngModel)]="justifyNotifiedBy">
            </mat-form-field>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button (click)="showJustifyForm.set(false)">Cancelar</button>
            <button mat-flat-button color="primary" (click)="submitJustification()" [disabled]="!justifyReason">
              Guardar
            </button>
          </mat-card-actions>
        </mat-card>
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
  filterJustified = '';
  justifyReason = '';
  justifyNotifiedBy = '';

  async ngOnInit(): Promise<void> {
    const [years, courses] = await Promise.all([
      firstValueFrom(this.http.get<AcademicYear[]>('/api/academic-years')),
      firstValueFrom(this.http.get<Course[]>('/api/courses')),
    ]);
    this.years.set(years);
    this.courses.set(courses);
    const active = years.find(y => y.isActive);
    if (active) this.selYear = active.id;
  }

  async onFiltersChange(): Promise<void> {
    if (this.selCourse && this.selYear) {
      this.enrollLoading.set(true);
      try {
        const data = await firstValueFrom(
          this.http.get<Enrollment[]>(`/api/enrollments?course_id=${this.selCourse}&academic_year_id=${this.selYear}`)
        );
        this.enrollments.set(data);
      } finally {
        this.enrollLoading.set(false);
      }
      await this.loadAbsences();
    }
  }

  async loadAbsences(): Promise<void> {
    const params: string[] = [];
    if (this.selCourse)       params.push(`course_id=${this.selCourse}`);
    if (this.selYear)         params.push(`academic_year_id=${this.selYear}`);
    if (this.dateFrom)        params.push(`date_from=${this.dateFrom}`);
    if (this.dateTo)          params.push(`date_to=${this.dateTo}`);
    if (this.filterType)      params.push(`type=${this.filterType}`);
    if (this.filterJustified) params.push(`is_justified=${this.filterJustified}`);
    this.absLoading.set(true);
    try {
      const data = await firstValueFrom(this.http.get<Absence[]>(`/api/absences?${params.join('&')}`));
      this.absences.set(data);
    } finally {
      this.absLoading.set(false);
    }
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
      this.snackBar.open('Error al procesar imagen: ' + (err?.error?.detail ?? err.message), '', { duration: 5000 });
    } finally {
      this.ocrLoading.set(false);
    }
  }

  async addAbsence(enrollmentId: number, type: 'A' | 'AT'): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    try {
      await firstValueFrom(this.http.post('/api/absences', { enrollmentId, date: today, type }));
      this.snackBar.open(`Falta ${type} registrada`, '', { duration: 2000 });
    } catch (err: any) {
      this.snackBar.open('Error: ' + (err?.error?.error ?? 'ya existe una falta este día'), '', { duration: 3000 });
    }
  }

  openManualAdd(name: string): void {
    this.snackBar.open(`Buscando "${name}" en la pestaña Manual`, '', { duration: 2000 });
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
    const enrollmentId = sel[0].enrollmentId;
    try {
      await firstValueFrom(this.http.post('/api/justifications', {
        enrollmentId,
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
