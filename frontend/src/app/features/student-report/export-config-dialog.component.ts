import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { dateToDateString } from '../../shared/utils/date.util';
import { AcademicYear, Course, CourseReport } from '../../core/models/index';

export interface ExportConfigDialogData {
  mode: 'F' | 'AT' | 'J' | 'CUSTOM';
  label: string;
  accent: string;
  icon: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatDividerModule,
    MatSlideToggleModule,
  ],
  styles: [`
    /* ── Title ── */
    .dlg-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .dlg-title-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .dlg-title-icon mat-icon {
      font-size: 20px !important;
      width: 20px !important;
      height: 20px !important;
    }

    /* ── Section labels ── */
    .sec-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .07em;
      color: var(--muted);
      margin: 0 0 8px;
    }

    /* ── Dates row ── */
    .dates-row { display: flex; gap: 12px; }
    .dates-row mat-form-field { flex: 1; }

    /* ── Trimester pills ── */
    .trimester-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }

    /* ── CUSTOM type pills ── */
    .type-pills { display: flex; gap: 10px; flex-wrap: wrap; }
    .type-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 600;
      border: 1.5px solid;
      cursor: pointer;
      background: transparent;
      transition: background .12s, color .12s;
      line-height: 1;
    }
    .type-pill mat-icon {
      font-size: 16px !important;
      width: 16px !important;
      height: 16px !important;
    }
    /* Faltas */
    .tp-f         { color: #b91c1c; border-color: #fca5a5; }
    .tp-f.active  { background: #dc2626; color: #fff; border-color: #dc2626; }
    /* Atrasos */
    .tp-at        { color: #92400e; border-color: #fcd34d; }
    .tp-at.active { background: #d97706; color: #fff; border-color: #d97706; }
    /* Justificaciones */
    .tp-j         { color: #15803d; border-color: #86efac; }
    .tp-j.active  { background: #16a34a; color: #fff; border-color: #16a34a; }

    /* ── Output card (output settings grouped) ── */
    .output-card {
      background: var(--paper-deep);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-md);
      overflow: hidden;
      margin-top: 16px;
    }
    .output-section { padding: 14px 16px; }
    .output-sep { height: 1px; background: var(--border-soft); }

    /* Student filter cards */
    .sf-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 8px;
    }
    .sf-card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      padding: 10px 12px;
      background: var(--paper);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      text-align: left;
      transition: border-color .12s, background .12s;
    }
    .sf-card:hover { border-color: var(--muted); }
    .sf-card.sf-active {
      border-width: 2px;
    }
    .sf-card-top {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .sf-card-top mat-icon {
      font-size: 18px !important;
      width: 18px !important;
      height: 18px !important;
    }
    .sf-name {
      font-size: 13px;
      font-weight: 700;
      color: var(--ink);
    }
    .sf-desc {
      font-size: 11px;
      color: var(--muted-strong);
      line-height: 1.4;
    }

    /* Color toggle row */
    .color-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .color-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--ink-soft);
    }
    .color-hint {
      font-size: 11px;
      color: var(--muted);
      margin-top: 1px;
    }
  `],
  template: `
    <div mat-dialog-title>
      <div class="dlg-title-row">
        <div class="dlg-title-icon"
          [style.background]="data.accent + '18'"
          [style.color]="data.accent">
          <mat-icon>{{data.icon}}</mat-icon>
        </div>
        <span>{{data.label}}</span>
      </div>
    </div>

    <mat-dialog-content>

      <!-- Cursos -->
      <p class="sec-label">Cursos</p>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Selecciona uno o varios cursos</mat-label>
        <mat-select [ngModel]="selectModel" [multiple]="true" (ngModelChange)="handleSelectChange($event)">
          <mat-select-trigger>
            @if (selectModel.includes(0)) {
              Todos los cursos
            } @else if (selCourseIds.length === 1) {
              {{ courses().find(c => c.id === selCourseIds[0])?.name }}
            } @else if (selCourseIds.length > 1) {
              {{ selCourseIds.length }} cursos seleccionados
            }
          </mat-select-trigger>
          <mat-option [value]="0" style="font-weight:600">Seleccionar todos</mat-option>
          <mat-divider></mat-divider>
          @for (c of courses(); track c.id) {
            <mat-option [value]="c.id">{{c.name}}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <!-- Fechas -->
      <p class="sec-label" style="margin-top:14px">Período</p>
      <div class="dates-row">
        <mat-form-field appearance="outline">
          <mat-label>Desde</mat-label>
          <input matInput [matDatepicker]="pickerFrom" [(ngModel)]="dateFrom"
            (ngModelChange)="activeTrimester.set(null)">
          <mat-datepicker-toggle matIconSuffix [for]="pickerFrom"></mat-datepicker-toggle>
          <mat-datepicker #pickerFrom></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Hasta</mat-label>
          <input matInput [matDatepicker]="pickerTo" [(ngModel)]="dateTo"
            (ngModelChange)="activeTrimester.set(null)">
          <mat-datepicker-toggle matIconSuffix [for]="pickerTo"></mat-datepicker-toggle>
          <mat-datepicker #pickerTo></mat-datepicker>
        </mat-form-field>
      </div>
      <div class="trimester-row">
        @for (t of ['Primer', 'Segundo', 'Tercer']; track t; let i = $index) {
          <button class="period-pill" [class.active]="activeTrimester() === i"
            (click)="selectTrimester(i)">
            {{t}} trimestre
          </button>
        }
      </div>

      <!-- Tipos (solo CUSTOM) -->
      @if (data.mode === 'CUSTOM') {
        <p class="sec-label" style="margin-top:16px">Tipos a incluir</p>
        <div class="type-pills">
          <button class="type-pill tp-f" [class.active]="includeF" (click)="includeF = !includeF">
            <mat-icon>event_busy</mat-icon> Faltas
          </button>
          <button class="type-pill tp-at" [class.active]="includeAT" (click)="includeAT = !includeAT">
            <mat-icon>schedule</mat-icon> Atrasos
          </button>
          <button class="type-pill tp-j" [class.active]="includeJ" (click)="includeJ = !includeJ">
            <mat-icon>task_alt</mat-icon> Justificaciones
          </button>
        </div>
      }

      <!-- Output card -->
      <div class="output-card">

        <!-- Student filter -->
        <div class="output-section">
          <p class="sec-label" style="margin-bottom:0">Estudiantes a incluir</p>
          <div class="sf-grid">
            <button class="sf-card" [class.sf-active]="!onlyWithRecords()"
              [style.border-color]="!onlyWithRecords() ? data.accent : null"
              [style.background]="!onlyWithRecords() ? data.accent + '0d' : null"
              (click)="onlyWithRecords.set(false)">
              <div class="sf-card-top" [style.color]="!onlyWithRecords() ? data.accent : 'var(--muted-strong)'">
                <mat-icon>groups</mat-icon>
                <span class="sf-name" [style.color]="!onlyWithRecords() ? data.accent : 'var(--ink)'">
                  Todos
                </span>
              </div>
              <span class="sf-desc">Incluye alumnos sin registros</span>
            </button>

            <button class="sf-card" [class.sf-active]="onlyWithRecords()"
              [style.border-color]="onlyWithRecords() ? data.accent : null"
              [style.background]="onlyWithRecords() ? data.accent + '0d' : null"
              (click)="onlyWithRecords.set(true)">
              <div class="sf-card-top" [style.color]="onlyWithRecords() ? data.accent : 'var(--muted-strong)'">
                <mat-icon>filter_list</mat-icon>
                <span class="sf-name" [style.color]="onlyWithRecords() ? data.accent : 'var(--ink)'">
                  Solo con registros
                </span>
              </div>
              <span class="sf-desc">Omite alumnos sin ningún registro</span>
            </button>
          </div>
        </div>

        <div class="output-sep"></div>

        <!-- Color toggle -->
        <div class="output-section">
          <div class="color-row">
            <div>
              <div class="color-label">Generar en color</div>
              <div class="color-hint">{{colorMode() ? 'Encabezados y conteos con color' : 'Blanco y negro'}}</div>
            </div>
            <mat-slide-toggle [ngModel]="colorMode()" (ngModelChange)="colorMode.set($event)">
            </mat-slide-toggle>
          </div>
        </div>

      </div>

    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button [mat-dialog-close]="undefined">Cancelar</button>
      <button mat-flat-button color="primary" (click)="generatePdf()"
        [disabled]="generating() || !selCourseIds.length">
        @if (generating()) {
          <span class="spinner spinner-sm" style="margin-right:8px"></span>
        }
        <mat-icon>print</mat-icon>
        Generar PDF
        @if (selCourseIds.length > 1) {
          <span style="margin-left:4px;opacity:.75;font-size:12px">({{selCourseIds.length}} hojas)</span>
        }
      </button>
    </mat-dialog-actions>
  `,
})
export class ExportConfigDialogComponent implements OnInit {
  readonly data = inject<ExportConfigDialogData>(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);
  readonly academicYearContext = inject(AcademicYearContextService);

  readonly courses = signal<Course[]>([]);
  readonly generating = signal(false);
  readonly activeTrimester = signal<number | null>(null);
  readonly colorMode = signal(true);
  readonly onlyWithRecords = signal(false);

  selectModel: number[] = [];
  dateFrom: Date | null = null;
  dateTo: Date | null = null;

  includeF = true;
  includeAT = true;
  includeJ = true;

  get selCourseIds(): number[] {
    return this.selectModel.filter(id => id !== 0);
  }

  async ngOnInit(): Promise<void> {
    this.courses.set(await firstValueFrom(this.http.get<Course[]>('/api/courses')));
    const active = this.academicYearContext.selected();
    if (active) this.setDefaultTrimester(active);
  }

  private setDefaultTrimester(year: AcademicYear): void {
    if (!year.startDate || !year.endDate) return;
    const start = new Date(year.startDate);
    const end = new Date(year.endDate);
    const third = (end.getTime() - start.getTime()) / 3;
    const bounds = [start, new Date(start.getTime() + third), new Date(start.getTime() + 2 * third), end];
    const today = new Date();
    const clamped = today < start ? start : today > end ? end : today;
    const idx = bounds.slice(1).findIndex(b => clamped.getTime() <= b.getTime());
    const i = idx === -1 ? 2 : idx;
    this.dateFrom = bounds[i];
    this.dateTo = bounds[i + 1];
    this.activeTrimester.set(i);
  }

  selectTrimester(i: number): void {
    const year = this.academicYearContext.selected();
    if (!year?.startDate || !year?.endDate) return;
    const start = new Date(year.startDate);
    const end = new Date(year.endDate);
    const third = (end.getTime() - start.getTime()) / 3;
    const bounds = [start, new Date(start.getTime() + third), new Date(start.getTime() + 2 * third), end];
    this.dateFrom = bounds[i];
    this.dateTo = bounds[i + 1];
    this.activeTrimester.set(i);
  }

  private getTrimesterName(): string {
    const year = this.academicYearContext.selected();
    if (!this.dateFrom || !this.dateTo || !year?.startDate || !year?.endDate) return 'TRIMESTRE';
    const start = new Date(year.startDate);
    const end = new Date(year.endDate);
    const third = (end.getTime() - start.getTime()) / 3;
    const midpoint = new Date((this.dateFrom.getTime() + this.dateTo.getTime()) / 2);
    if (midpoint <= new Date(start.getTime() + third)) return 'PRIMER TRIMESTRE';
    if (midpoint <= new Date(start.getTime() + 2 * third)) return 'SEGUNDO TRIMESTRE';
    return 'TERCER TRIMESTRE';
  }

  handleSelectChange(values: number[]): void {
    const prevHadAll = this.selectModel.includes(0);
    const nowHasAll = values.includes(0);
    const allCourseIds = this.courses().map(c => c.id);

    if (nowHasAll && !prevHadAll) {
      this.selectModel = [0, ...allCourseIds];
    } else if (!nowHasAll && prevHadAll) {
      this.selectModel = [];
    } else {
      const courseIds = values.filter(id => id !== 0);
      if (courseIds.length === allCourseIds.length && allCourseIds.length > 0) {
        this.selectModel = [0, ...courseIds];
      } else {
        this.selectModel = courseIds;
      }
    }
  }

  async generatePdf(): Promise<void> {
    if (!this.selCourseIds.length) {
      this.notify.error('Selecciona al menos un curso');
      return;
    }
    if (!this.dateFrom || !this.dateTo) {
      this.notify.error('Selecciona el rango de fechas');
      return;
    }
    if (this.data.mode === 'CUSTOM' && !this.includeF && !this.includeAT && !this.includeJ) {
      this.notify.error('Selecciona al menos un tipo para incluir');
      return;
    }

    const year = this.academicYearContext.selected();
    if (!year) { this.notify.error('No hay año lectivo activo'); return; }

    this.generating.set(true);
    try {
      const params = new URLSearchParams({
        course_ids: this.selCourseIds.join(','),
        academic_year_id: String(year.id),
        date_from: dateToDateString(this.dateFrom),
        date_to: dateToDateString(this.dateTo),
      });
      let data = await firstValueFrom(
        this.http.get<CourseReport[]>(`/api/reports/student-summary?${params}`),
      );

      if (this.onlyWithRecords()) {
        const { mode } = this.data;
        const showF  = mode === 'F'  || (mode === 'CUSTOM' && this.includeF);
        const showAT = mode === 'AT' || (mode === 'CUSTOM' && this.includeAT);
        const showJ  = mode === 'J'  || (mode === 'CUSTOM' && this.includeJ);
        data = data
          .map(cr => ({
            ...cr,
            students: cr.students.filter(s =>
              (showF && s.absences > 0) || (showAT && s.tardies > 0) || (showJ && s.justified > 0),
            ),
          }))
          .filter(cr => cr.students.length > 0);
      }

      if (!data.length) {
        this.notify.error('No hay datos para generar el informe con los filtros seleccionados');
        return;
      }

      this.printReport(data);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'Error al generar el informe');
    } finally {
      this.generating.set(false);
    }
  }

  private printReport(data: CourseReport[]): void {
    const { mode } = this.data;
    const showF  = mode === 'F'  || (mode === 'CUSTOM' && this.includeF);
    const showAT = mode === 'AT' || (mode === 'CUSTOM' && this.includeAT);
    const showJ  = mode === 'J'  || (mode === 'CUSTOM' && this.includeJ);
    const useColor = this.colorMode();
    const accent = this.data.accent;

    const trimesterName = this.getTrimesterName();
    const dateLabel = `Del ${formatDate(this.dateFrom)} al ${formatDate(this.dateTo)}`;

    const mainTitle =
      mode === 'CUSTOM' ? 'ASISTENCIA'   :
      mode === 'F'      ? 'FALTAS'       :
      mode === 'AT'     ? 'ATRASOS'      :
                          'JUSTIFICACIONES';

    const user = this.auth.currentUser();
    const signerName = [user?.title, user?.fullName || user?.username].filter(Boolean).join(' ') || (user?.username ?? '');
    const signerRole = user?.signatureLabel || '';

    const headBg     = useColor ? hexToRgba(accent, 0.12) : '#efefef';
    const headColor  = useColor ? accent                  : '#222222';
    const stripeBg   = useColor ? '#faf8f3'               : '#f7f7f7';
    const countColor = useColor ? accent                  : 'inherit';
    const accentLine = useColor ? accent                  : '#555555';

    const th = (style: string, label: string) =>
      `<th style="${style};color:${headColor}">${label}</th>`;
    const colHeaders = [
      th('text-align:center;width:36pt', 'N°'),
      th('text-align:left', 'Nombre del Estudiante'),
      showF  ? th('text-align:center;width:48pt', 'Faltas')          : '',
      showAT ? th('text-align:center;width:48pt', 'Atrasos')         : '',
      showJ  ? th('text-align:center;width:72pt', 'Justificaciones') : '',
    ].join('');

    const coursePagesHtml = data.map(courseReport => {
      const title = `${mainTitle} ${trimesterName} — ${escapeHtml(courseReport.course.name.toUpperCase())}`;

      const rows = courseReport.students.map((s, idx) => `
        <tr${idx % 2 === 1 ? ` style="background:${stripeBg}"` : ''}>
          <td style="text-align:center;color:var(--m)">${idx + 1}</td>
          <td>${escapeHtml(s.studentName)}</td>
          ${showF  ? `<td style="text-align:center;font-weight:700;color:${countColor}">${s.absences}</td>`  : ''}
          ${showAT ? `<td style="text-align:center;font-weight:700;color:${countColor}">${s.tardies}</td>`   : ''}
          ${showJ  ? `<td style="text-align:center;font-weight:700;color:${countColor}">${s.justified}</td>` : ''}
        </tr>
      `).join('');

      return `
        <div class="page">
          <div class="page-hdr">
            <div class="accent-bar" style="background:${accentLine}"></div>
            <h1 style="color:${useColor ? accent : '#111'}">${title}</h1>
            <p class="subtitle">${dateLabel} &nbsp;·&nbsp; ${courseReport.students.length} estudiante${courseReport.students.length !== 1 ? 's' : ''}</p>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr style="background:${headBg}">${colHeaders}</tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="footer">
            <div class="sig-block" style="border-top-color:${accentLine}">
              <div class="sig-name">${escapeHtml(signerName)}</div>
              <div class="sig-role">${escapeHtml(signerRole)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const printStyles = `
      @page { size: A4 portrait; margin: 16mm 16mm 14mm 16mm; }
      * { box-sizing: border-box; margin: 0; padding: 0;
          -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: Arial, sans-serif; font-size: 9pt; color: #1e1b16; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: avoid; }
      .page-hdr { margin-bottom: 14pt; padding-bottom: 10pt; border-bottom: 1px solid #e0ddd6; }
      .accent-bar { height: 4pt; width: 40pt; border-radius: 2pt; margin-bottom: 8pt; }
      h1 { font-size: 10.5pt; font-weight: 700; letter-spacing: .03em; line-height: 1.3; }
      .subtitle { font-size: 8.5pt; color: #78716c; margin-top: 3pt; }
      table { width: 100%; border-collapse: collapse; margin-top: 6pt; }
      thead th { font-size: 7.5pt; font-weight: 700; text-transform: uppercase;
                 letter-spacing: .05em; padding: 5pt 7pt; border-bottom: 1.5pt solid #ccc; }
      tbody td { font-size: 8.5pt; padding: 4pt 7pt; border-bottom: 1pt solid #ece9e0; }
      .footer { margin-top: 56pt; text-align: center; page-break-inside: avoid; }
      .sig-block { display: inline-block; width: 180pt; border-top: 1.5pt solid; padding-top: 6pt; }
      .sig-name { font-size: 9pt; font-weight: 700; min-height: 11pt; }
      .sig-role { font-size: 8pt; color: #78716c; margin-top: 3pt; min-height: 10pt; }
    `;

    const html = `<!DOCTYPE html><html lang="es"><head>
      <meta charset="utf-8">
      <title>Informe</title>
      <style>${printStyles}</style>
    </head><body>${coursePagesHtml}</body></html>`;

    // Hidden iframe gives each page its own document context so @page rules
    // and page-break-after work correctly for multiple courses, without
    // opening a visible new window.
    const existing = document.getElementById('sr-print-frame');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'sr-print-frame';
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) { iframe.remove(); return; }

    doc.open();
    doc.write(html);
    doc.close();

    iframe.contentWindow?.addEventListener('afterprint', () => iframe.remove(), { once: true });
    setTimeout(() => iframe.contentWindow?.print(), 300);
  }
}
