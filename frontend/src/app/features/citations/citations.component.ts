import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { Course, Citation, CitationRosterRow, Quarter } from '../../core/models/index';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { NotificationService } from '../../core/services/notification.service';
import { QuarterContextService } from '../../core/services/quarter-context.service';
import { NotificationTemplateService } from '../../core/services/notification-template.service';
import { QuarterSelectorComponent } from '../../shared/components/quarter-selector/quarter-selector.component';
import { WhatsappIconComponent } from '../../shared/components/whatsapp-icon/whatsapp-icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { CitationHistoryDialogComponent } from './citation-history-dialog.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatSelectModule, MatFormFieldModule, MatButtonModule, MatIconModule,
            MatTooltipModule, MatMenuModule, WhatsappIconComponent, QuarterSelectorComponent],
  styles: [`
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
    .pills-cell { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill {
      cursor: pointer;
      border: none;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 999px;
      line-height: 1.2;
    }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Citaciones</h1>
    </div>

    <div class="filter-bar">
      <app-quarter-selector (quarterChange)="onQuarterChange($event)" />
      <mat-form-field appearance="outline" style="width:220px">
        <mat-label>Curso</mat-label>
        <mat-select [(ngModel)]="selCourse" (ngModelChange)="onCourseChange()">
          <mat-option [value]="null">— Seleccionar —</mat-option>
          @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
    </div>

    @if (!selCourse) {
      <div class="empty-state" style="padding:40px">
        <mat-icon style="font-size:40px;width:40px;height:40px;color:var(--border)">campaign</mat-icon>
        <div style="margin-top:8px;color:var(--ink-soft)">Selecciona un curso para ver las citaciones</div>
      </div>
    } @else if (rosterLoading()) {
      <div class="spinner-center">
        <div class="spinner"></div>
      </div>
    } @else {
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px;background:var(--paper-deep);border-bottom:1px solid var(--border)">
        <span style="font-size:12px;color:var(--muted-strong);white-space:nowrap">
          @if (manualSearch) {
            <strong style="color:var(--ink-soft)">{{filteredRoster().length}}</strong> de {{roster().length}}
          } @else {
            {{roster().length}} estudiantes
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
      @if (!filteredRoster().length) {
        <div class="empty-state" style="padding:32px">
          @if (manualSearch) {
            <mat-icon style="font-size:36px;width:36px;height:36px;color:var(--border)">search_off</mat-icon>
            <div style="margin-top:8px;color:var(--ink-soft)">Ningún estudiante coincide con "<strong>{{manualSearch}}</strong>"</div>
          } @else {
            <mat-icon style="font-size:40px;width:40px;height:40px;color:var(--border)">campaign</mat-icon>
            <div style="margin-top:8px;color:var(--ink-soft)">Sin citaciones registradas en este curso</div>
          }
        </div>
      } @else {
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Citaciones el:</th>
                <th style="text-align:right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (row of filteredRoster(); track row.enrollmentId) {
                <tr>
                  <td style="font-weight:500">{{row.studentName}}</td>
                  <td>
                    @if (scopedCitations(row).length === 0) {
                      <span style="color:var(--muted)">—</span>
                    } @else {
                      <div class="pills-cell">
                        @for (c of scopedCitations(row); track c.id) {
                          <button class="pill badge" [style]="pillStyle(c)" (click)="onPillClick(row, c)">
                            {{pillLabel(c)}}
                          </button>
                        }
                      </div>
                    }
                  </td>
                  <td style="white-space:nowrap;text-align:right">
                    @if (resolveTargetCitation(row); as target) {
                      @if (row.whatsappLink) {
                        <button mat-icon-button style="color:#16a34a" (click)="notifyGuardian(row)" matTooltip="Notificar por WhatsApp">
                          <app-whatsapp-icon [size]="20" />
                        </button>
                      }
                      <button mat-icon-button style="color:#b91c1c" (click)="deleteCitation(row)" matTooltip="Eliminar">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
                    }
                    <button mat-icon-button (click)="onAddCitation(row)" matTooltip="Agregar citación">
                      <mat-icon>add_circle_outline</mat-icon>
                    </button>
                    <button mat-icon-button [matMenuTriggerFor]="rowMenu" matTooltip="Más acciones">
                      <mat-icon>more_vert</mat-icon>
                    </button>
                    <mat-menu #rowMenu="matMenu">
                      <button mat-menu-item (click)="openHistory(row)">
                        <mat-icon>history</mat-icon> Ver historial completo
                      </button>
                    </mat-menu>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
})
export class CitationsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  readonly academicYearContext = inject(AcademicYearContextService);
  private readonly quarterContext = inject(QuarterContextService);
  private readonly templateService = inject(NotificationTemplateService);

  readonly courses = signal<Course[]>([]);
  readonly roster = signal<CitationRosterRow[]>([]);
  readonly rosterLoading = signal(false);

  selCourse: number | null = null;
  selYear: number | null = null;
  manualSearch = '';
  private scopeStart: string | null = null;
  private scopeEnd: string | null = null;

  // Local WhatsApp template (R25). Deferred migration to NotificationTemplateService
  // is intentionally bundled with feature #21's create/edit dialog (design.md,
  // discarded alternative #1).
  private readonly CITATION_WHATSAPP_TEMPLATE =
    'Estimado apoderado, se ha registrado una citación para {{nombre}} el {{fecha}}. ' +
    'Por favor confirmar asistencia.';

  async ngOnInit(): Promise<void> {
    this.applyDefaultQuarter();
    const [courses] = await Promise.all([
      firstValueFrom(this.http.get<Course[]>('/api/courses')),
      this.templateService.load(),
    ]);
    this.courses.set(courses);
    this.selYear = this.academicYearContext.selected()?.id ?? null;
  }

  private applyDefaultQuarter(): void {
    const id = this.quarterContext.defaultQuarterId();
    if (id === null) return;
    const q = this.quarterContext.quarters().find(qq => qq.id === id);
    if (!q || !q.startDate || !q.endDate) return;
    this.scopeStart = q.startDate;
    this.scopeEnd = q.endDate;
  }

  async onCourseChange(): Promise<void> {
    await this.loadRoster();
  }

  private async loadRoster(): Promise<void> {
    if (!this.selCourse || !this.selYear) { this.roster.set([]); return; }
    this.rosterLoading.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<CitationRosterRow[]>(
          `/api/citations?course_id=${this.selCourse}&academic_year_id=${this.selYear}`
        )
      );
      this.roster.set(data);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? err?.message ?? 'No se pudieron cargar las citaciones');
      this.roster.set([]);
    } finally {
      this.rosterLoading.set(false);
    }
  }

  filteredRoster(): CitationRosterRow[] {
    const q = this.manualSearch.trim().toLowerCase();
    if (!q) return this.roster();
    return this.roster().filter(r => r.studentName.toLowerCase().includes(q));
  }

  scopedCitations(row: CitationRosterRow): Citation[] {
    if (!this.scopeStart || !this.scopeEnd) return row.citations;
    return row.citations.filter(c => c.dateFrom >= this.scopeStart! && c.dateFrom <= this.scopeEnd!);
  }

  onQuarterChange(q: Quarter | null): void {
    if (!q || !q.startDate || !q.endDate) return;
    this.scopeStart = q.startDate;
    this.scopeEnd = q.endDate;
  }

  pillLabel(c: Citation): string {
    return c.dateFrom === c.dateTo ? c.dateFrom : `${c.dateFrom} – ${c.dateTo}`;
  }

  pillStyle(c: Citation): string {
    return c.status === 'pending'
      ? 'background:#fef9c3;color:#92400e'
      : 'background:#f1f5f9;color:#64748b';
  }

  resolveTargetCitation(row: CitationRosterRow): Citation | null {
    return row.citations.find(c => c.status === 'pending') ?? row.citations[0] ?? null;
  }

  notifyGuardian(row: CitationRosterRow): void {
    const target = this.resolveTargetCitation(row);
    if (!row.whatsappLink || !target) return;
    if (target.status === 'closed') { window.open(row.whatsappLink, '_blank'); return; }
    const dateLabel = target.time ? `${target.dateFrom} a las ${target.time}` : target.dateFrom;
    const message = this.CITATION_WHATSAPP_TEMPLATE
      .replace(/\{\{nombre\}\}/g, row.studentName)
      .replace(/\{\{fecha\}\}/g, dateLabel);
    window.open(`${row.whatsappLink}?text=${encodeURIComponent(message)}`, '_blank');
  }

  deleteCitation(row: CitationRosterRow): void {
    const target = this.resolveTargetCitation(row);
    if (!target) return;
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar citación',
        message: '¿Eliminar esta citación? Esta acción no se puede deshacer.',
      },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      try {
        await firstValueFrom(this.http.delete(`/api/citations/${target.id}`));
        await this.loadRoster();
      } catch (err: any) {
        this.notify.error(err?.error?.error ?? err?.message ?? 'No se pudo eliminar la citación');
      }
    });
  }

  openHistory(row: CitationRosterRow): void {
    this.dialog.open(CitationHistoryDialogComponent, {
      width: '480px',
      data: { studentName: row.studentName, citations: row.citations },
    });
  }

  onPillClick(row: CitationRosterRow, c: Citation): void {
    this.openCitationEditor(row, c);
  }

  onAddCitation(row: CitationRosterRow): void {
    this.openCitationEditor(row);
  }

  private openCitationEditor(row: CitationRosterRow, citation?: Citation): void {
    // TODO(feature #21 citations_schedule_dialog): open the real create/edit dialog here.
    this.notify.info('El editor de citaciones estará disponible próximamente.');
  }
}
