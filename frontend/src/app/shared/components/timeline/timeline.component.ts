import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TimelineEvent } from '../../../core/models/index';

interface TypeMeta {
  icon: string;
  classes: string;
  rotate: string;
}

const TYPE_META: Record<TimelineEvent['type'], TypeMeta> = {
  enrollment:    { icon: 'school',     classes: 'bg-indigo-50 text-indigo-600 border-indigo-200',   rotate: '1deg' },
  absence:       { icon: 'event_busy', classes: 'bg-red-50 text-red-600 border-red-200',             rotate: '-2deg' },
  tardy:         { icon: 'schedule',   classes: 'bg-amber-50 text-amber-600 border-amber-200',       rotate: '2deg' },
  justification: { icon: 'fact_check', classes: 'bg-emerald-50 text-emerald-600 border-emerald-200', rotate: '-1deg' },
};

@Component({
  selector: 'app-timeline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    @if (loading) {
      <div class="spinner-center"><div class="spinner"></div></div>
    } @else if (!events.length) {
      <div class="empty-state">
        <mat-icon class="material-icons-round">history_toggle_off</mat-icon>
        <div>Sin eventos registrados en este rango</div>
      </div>
    } @else {
      <div class="timeline">
        @for (e of events; track $index; let last = $last, idx = $index) {
          <div class="timeline-row" [style.animation-delay.ms]="idx * 40">
            <div class="timeline-rail">
              <div class="timeline-node" [class]="meta(e.type).classes" [style.transform]="'rotate(' + meta(e.type).rotate + ')'">
                <mat-icon>{{ meta(e.type).icon }}</mat-icon>
              </div>
              @if (!last) { <div class="timeline-line"></div> }
            </div>
            <div class="timeline-body">
              <div class="timeline-date">{{ formatDate(e.occurredAt ?? e.recordedAt) }}</div>
              <div class="timeline-title">{{ e.title }}</div>
              <div class="timeline-desc">{{ e.description }}</div>
              <div class="timeline-audit">
                <mat-icon>person</mat-icon>
                <span>Registrado el {{ formatDateTime(e.recordedAt) }}</span>
                @if (e.createdByName) {
                  <span>por</span>
                  <span class="badge-gray">{{ e.createdByName }}</span>
                }
                @if (e.origin) { <span class="badge-info">{{ e.origin }}</span> }
              </div>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .timeline { display: flex; flex-direction: column; }
    .timeline-row {
      display: flex; gap: 16px;
      animation: timelineIn .35s ease both;
    }
    @keyframes timelineIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .timeline-row { animation: none; }
    }
    .timeline-rail { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
    .timeline-node {
      width: 34px; height: 34px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: 1.5px dashed currentColor;
      flex-shrink: 0;
    }
    .timeline-node mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .timeline-line { flex: 1; width: 2px; min-height: 20px; background: var(--border); margin: 4px 0; }
    .timeline-body { padding-bottom: 22px; padding-top: 4px; }
    .timeline-date {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
      color: var(--muted-strong); margin-bottom: 2px;
    }
    .timeline-title { font-size: 14px; font-weight: 700; color: var(--ink-soft); }
    .timeline-desc { font-size: 13px; color: var(--muted-strong); line-height: 1.5; margin-top: 2px; }
    .timeline-audit {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      font-size: 11.5px; color: var(--muted); margin-top: 8px;
    }
    .timeline-audit mat-icon { font-size: 14px; width: 14px; height: 14px; flex-shrink: 0; }
    .empty-state { color: var(--muted); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 16px; }
    .empty-state .material-icons-round { color: var(--border); font-size: 40px; margin-bottom: 10px; }
  `],
})
export class TimelineComponent {
  @Input() events: TimelineEvent[] = [];
  @Input() loading = false;

  meta(type: TimelineEvent['type']): TypeMeta {
    return TYPE_META[type];
  }

  formatDate(dateStr: string): string {
    const d = dateStr.length === 10 ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    return d.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('es-EC', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}
