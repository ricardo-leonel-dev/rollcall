import { Component, ChangeDetectionStrategy, OnInit, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import {
  Enrollment, StudentHistorySummary, StudentHistorySummaryItem,
  StudentJustificationSummaryItem, TimelineEvent,
} from '../../core/models/index';
import { TimelineComponent } from '../../shared/components/timeline/timeline.component';
import { ComingSoonComponent } from '../../shared/components/coming-soon/coming-soon.component';

export interface StudentHistoryDialogData {
  enrollment: Enrollment;
  dateFrom: string | null;
  dateTo: string | null;
}

const HISTORY_TAB_INDEX = 5;

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatTabsModule, MatButtonModule, MatIconModule, TimelineComponent, ComingSoonComponent],
  styles: [`
    :host { display: block; position: relative; }
    .dlg-header { display: flex; align-items: center; gap: 14px; padding: 4px 36px 16px 0; }
    .dlg-avatar {
      width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: white; display: flex; align-items: center; justify-content: center;
      font-family: 'Nunito', sans-serif; font-size: 20px; font-weight: 600;
    }
    .dlg-name { font-family: 'Nunito', sans-serif; font-size: 17px; font-weight: 600; color: var(--ink); }
    .dlg-meta { font-size: 12px; color: var(--muted-strong); margin-top: 2px; }
    .tab-content { padding: 20px 4px; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 640px) { .summary-grid { grid-template-columns: 1fr; } }
    .summary-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .summary-icon {
      width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .summary-total { font-family: 'Nunito', sans-serif; font-size: 20px; font-weight: 700; color: var(--ink); }
    .summary-label { font-size: 12px; color: var(--muted-strong); font-weight: 600; }
    .summary-item {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 8px 6px; border-radius: 8px; cursor: pointer; transition: background .12s ease;
    }
    .summary-item:hover { background: var(--paper-deep); }
    .summary-item-text { font-size: 13px; color: var(--ink-soft); }
    .summary-item-sub { font-size: 11px; color: var(--muted); }
    .summary-empty { font-size: 13px; color: var(--muted); padding: 6px; }
  `],
  template: `
    <button mat-icon-button [mat-dialog-close]="undefined" style="position:absolute;top:8px;right:8px;color:var(--muted-strong);z-index:1"><mat-icon>close</mat-icon></button>
    <mat-dialog-content style="max-height:80vh">
      <div class="dlg-header">
        <div class="dlg-avatar">{{data.enrollment.fullName?.[0] ?? '?'}}</div>
        <div>
          <div class="dlg-name">{{data.enrollment.fullName}}</div>
          <div class="dlg-meta">{{data.enrollment.course}} · {{data.enrollment.academicYear}} @if (data.enrollment.idNumber) { · {{data.enrollment.idNumber}} }</div>
        </div>
      </div>

      <mat-tab-group [(selectedIndex)]="selectedTabIndex" (selectedTabChange)="onTabChange($event.index)"
                     style="background:var(--paper);border-radius:16px;border:1px solid var(--border);overflow:hidden">

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">manage_search</mat-icon>
            Inspectoría
          </ng-template>
          <div class="tab-content">
            @if (loadingSummary()) {
              <div class="spinner-center" style="padding:40px 0"><div class="spinner"></div></div>
            } @else if (summary(); as s) {
              <div class="summary-grid">
                <div class="card">
                  <div class="summary-card-head">
                    <div class="summary-icon" style="background:#fee2e2"><mat-icon style="color:#b91c1c">event_busy</mat-icon></div>
                    <div>
                      <div class="summary-total">{{s.absences.total}}</div>
                      <div class="summary-label">Resumen de faltas</div>
                    </div>
                  </div>
                  @if (!s.absences.items.length) {
                    <div class="summary-empty">Sin faltas registradas</div>
                  } @else {
                    @for (item of s.absences.items; track item.id) {
                      <div class="summary-item" (click)="goToAbsence(item)">
                        <div>
                          <div class="summary-item-text">Falta del {{formatDate(item.date)}}</div>
                          <div class="summary-item-sub">{{item.isJustified ? 'Justificada' : 'Sin justificar'}}</div>
                        </div>
                        <mat-icon style="color:var(--muted);font-size:18px;width:18px;height:18px">chevron_right</mat-icon>
                      </div>
                    }
                  }
                </div>

                <div class="card">
                  <div class="summary-card-head">
                    <div class="summary-icon" style="background:#fef3c7"><mat-icon style="color:#92400e">schedule</mat-icon></div>
                    <div>
                      <div class="summary-total">{{s.tardies.total}}</div>
                      <div class="summary-label">Resumen de atrasos</div>
                    </div>
                  </div>
                  @if (!s.tardies.items.length) {
                    <div class="summary-empty">Sin atrasos registrados</div>
                  } @else {
                    @for (item of s.tardies.items; track item.id) {
                      <div class="summary-item" (click)="goToAbsence(item)">
                        <div>
                          <div class="summary-item-text">Atraso del {{formatDate(item.date)}}</div>
                          <div class="summary-item-sub">{{item.isJustified ? 'Justificado' : 'Sin justificar'}}</div>
                        </div>
                        <mat-icon style="color:var(--muted);font-size:18px;width:18px;height:18px">chevron_right</mat-icon>
                      </div>
                    }
                  }
                </div>

                <div class="card">
                  <div class="summary-card-head">
                    <div class="summary-icon" style="background:#d1fae5"><mat-icon style="color:#15803d">fact_check</mat-icon></div>
                    <div>
                      <div class="summary-total">{{s.justifications.total}}</div>
                      <div class="summary-label">Resumen de justificaciones</div>
                    </div>
                  </div>
                  @if (!s.justifications.items.length) {
                    <div class="summary-empty">Sin justificaciones registradas</div>
                  } @else {
                    @for (item of s.justifications.items; track item.id) {
                      <div class="summary-item" (click)="goToJustification()">
                        <div>
                          <div class="summary-item-text">{{item.reason}}</div>
                          <div class="summary-item-sub">Cubre: {{item.absenceDates.map(formatDate).join(', ')}}</div>
                        </div>
                        <mat-icon style="color:var(--muted);font-size:18px;width:18px;height:18px">chevron_right</mat-icon>
                      </div>
                    }
                  }
                </div>

                <div class="card">
                  <app-coming-soon [compact]="true" title="Resumen de citaciones" />
                </div>
              </div>
            }
          </div>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">school</mat-icon>
            Maestro
          </ng-template>
          <app-coming-soon title="Información de maestro" />
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">supervisor_account</mat-icon>
            Tutor(a)
          </ng-template>
          <app-coming-soon title="Información de tutor(a)" />
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">medical_services</mat-icon>
            Enfermería
          </ng-template>
          <app-coming-soon title="Información de enfermería" />
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">psychology</mat-icon>
            DECE
          </ng-template>
          <app-coming-soon title="Información de DECE" />
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">history</mat-icon>
            Histórica
          </ng-template>
          <div class="tab-content">
            <app-timeline [events]="timelineEvents()" [loading]="loadingTimeline()" />
          </div>
        </mat-tab>
      </mat-tab-group>
    </mat-dialog-content>
  `,
})
export class StudentHistoryDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<StudentHistoryDialogComponent>);
  readonly data: StudentHistoryDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  selectedTabIndex = 0;
  private timelineLoaded = false;

  readonly summary = signal<StudentHistorySummary | null>(null);
  readonly loadingSummary = signal(false);
  readonly timelineEvents = signal<TimelineEvent[]>([]);
  readonly loadingTimeline = signal(false);

  formatDate = (dateStr: string): string =>
    new Date(dateStr + 'T00:00:00').toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });

  private get rangeQuery(): string {
    const params: string[] = [];
    if (this.data.dateFrom) params.push(`date_from=${this.data.dateFrom}`);
    if (this.data.dateTo)   params.push(`date_to=${this.data.dateTo}`);
    return params.length ? '?' + params.join('&') : '';
  }

  async ngOnInit(): Promise<void> {
    this.loadingSummary.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<StudentHistorySummary>(`/api/student-history/${this.data.enrollment.enrollmentId}/summary${this.rangeQuery}`)
      );
      this.summary.set(data);
    } finally {
      this.loadingSummary.set(false);
    }
  }

  async onTabChange(index: number): Promise<void> {
    if (index !== HISTORY_TAB_INDEX || this.timelineLoaded) return;
    this.timelineLoaded = true;
    this.loadingTimeline.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<TimelineEvent[]>(`/api/student-history/${this.data.enrollment.enrollmentId}/timeline${this.rangeQuery}`)
      );
      this.timelineEvents.set(data);
    } finally {
      this.loadingTimeline.set(false);
    }
  }

  goToAbsence(item: StudentHistorySummaryItem): void {
    this.dialogRef.close();
    this.router.navigate(['/absences'], {
      queryParams: {
        course: this.data.enrollment.courseId,
        student: this.data.enrollment.fullName,
        dateFrom: item.date,
        dateTo: item.date,
      },
    });
  }

  goToJustification(): void {
    this.dialogRef.close();
    this.router.navigate(['/justifications'], {
      queryParams: {
        course: this.data.enrollment.courseId,
        enrollmentId: this.data.enrollment.enrollmentId,
      },
    });
  }
}
