import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { ExportConfigDialogComponent } from './export-config-dialog.component';

const REPORT_CARDS = [
  {
    id: 'F' as const,
    label: 'Exportar Faltas',
    icon: 'event_busy',
    desc: 'Genera el informe de inasistencias por curso y período.',
    accent: '#dc2626',
    accentSoft: '#fef2f2',
    accentBorder: '#fecaca',
    gradientFrom: '#fca5a5',
    gradientTo: '#dc2626',
  },
  {
    id: 'AT' as const,
    label: 'Exportar Atrasos',
    icon: 'schedule',
    desc: 'Genera el informe de atrasos por curso y período.',
    accent: '#d97706',
    accentSoft: '#fffbeb',
    accentBorder: '#fcd34d',
    gradientFrom: '#fde68a',
    gradientTo: '#d97706',
  },
  {
    id: 'J' as const,
    label: 'Exportar Justificaciones',
    icon: 'task_alt',
    desc: 'Genera el informe de justificaciones por curso y período.',
    accent: '#16a34a',
    accentSoft: '#f0fdf4',
    accentBorder: '#86efac',
    gradientFrom: '#86efac',
    gradientTo: '#16a34a',
  },
  {
    id: 'CUSTOM' as const,
    label: 'Exportar Personalizado',
    icon: 'tune',
    desc: 'Elige qué tipos incluir en un informe combinado.',
    accent: '#6366f1',
    accentSoft: '#eef2ff',
    accentBorder: '#a5b4fc',
    gradientFrom: '#a5b4fc',
    gradientTo: '#6366f1',
  },
];

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  styles: [`
    .sr-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
      margin-top: 8px;
    }

    .sr-card {
      background: var(--paper);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 0;
      cursor: pointer;
      text-align: left;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 1px 3px rgba(15,23,42,.05);
      transition: box-shadow .15s ease, transform .15s ease, border-color .15s ease;
      width: 100%;
    }
    .sr-card:hover {
      box-shadow: 0 8px 24px rgba(15,23,42,.11);
      transform: translateY(-3px);
    }

    .sr-card-top {
      height: 5px;
      flex-shrink: 0;
    }

    .sr-card-body {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      flex: 1;
    }

    .sr-icon-box {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .sr-icon-box mat-icon {
      font-size: 26px !important;
      width: 26px !important;
      height: 26px !important;
    }

    .sr-thumb {
      border: 1px solid;
      border-radius: 8px;
      overflow: hidden;
    }
    .sr-thumb-head {
      height: 11px;
    }
    .sr-thumb-row {
      display: flex;
      gap: 4px;
      padding: 5px 6px;
      border-top: 1px solid rgba(0,0,0,.06);
    }
    .sr-thumb-cell {
      height: 6px;
      border-radius: 3px;
      background: var(--border);
    }
    .sr-thumb-num  { width: 12px; flex-shrink: 0; }
    .sr-thumb-name { flex: 1; }
    .sr-thumb-count { width: 22px; flex-shrink: 0; }

    .sr-label {
      font-family: 'Nunito', sans-serif;
      font-size: 17px;
      font-weight: 700;
      color: var(--ink);
      margin: 0;
    }

    .sr-desc {
      font-size: 13px;
      line-height: 1.55;
      color: var(--muted-strong);
      flex: 1;
      margin: 0;
    }

    .sr-arrow {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      font-weight: 600;
      transition: gap .15s ease;
    }
    .sr-card:hover .sr-arrow { gap: 7px; }
    .sr-arrow mat-icon {
      font-size: 18px !important;
      width: 18px !important;
      height: 18px !important;
    }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Informe estudiantil</h1>
    </div>

    <div class="sr-grid">
      @for (card of cards; track card.id) {
        <button class="sr-card" (click)="openConfig(card)"
          [style.border-color]="'color-mix(in srgb, ' + card.accent + ' 20%, var(--border))'">
          <div class="sr-card-top"
            [style.background]="'linear-gradient(90deg, ' + card.gradientFrom + ', ' + card.gradientTo + ')'">
          </div>
          <div class="sr-card-body">
            <div class="sr-icon-box"
              [style.background]="card.accentSoft"
              [style.color]="card.accent">
              <mat-icon>{{card.icon}}</mat-icon>
            </div>

            <!-- Mini table thumbnail -->
            <div class="sr-thumb" [style.border-color]="card.accentBorder">
              <div class="sr-thumb-head" [style.background]="card.accentSoft"></div>
              @for (row of [1,2,3]; track row) {
                <div class="sr-thumb-row">
                  <div class="sr-thumb-cell sr-thumb-num" [style.background]="card.accentSoft"></div>
                  <div class="sr-thumb-cell sr-thumb-name"></div>
                  <div class="sr-thumb-cell sr-thumb-count" [style.background]="card.accentSoft"></div>
                </div>
              }
            </div>

            <p class="sr-label">{{card.label}}</p>
            <p class="sr-desc">{{card.desc}}</p>
            <span class="sr-arrow" [style.color]="card.accent">
              Generar
              <mat-icon>arrow_forward</mat-icon>
            </span>
          </div>
        </button>
      }
    </div>
  `,
})
export class StudentReportComponent {
  private readonly dialog = inject(MatDialog);
  readonly cards = REPORT_CARDS;

  openConfig(card: typeof REPORT_CARDS[number]): void {
    this.dialog.open(ExportConfigDialogComponent, {
      width: '520px',
      data: { mode: card.id, label: card.label, accent: card.accent, icon: card.icon },
    });
  }
}
