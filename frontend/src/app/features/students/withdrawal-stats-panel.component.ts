import { Component, ChangeDetectionStrategy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { WithdrawalReasonCount, WithdrawalStats } from '../../core/models/index';
import {
  WithdrawalStatsFilters,
  withdrawalReasonShare,
  withdrawalStatsErrorMessage,
  withdrawalStatsInitiallyExpanded,
  withdrawalStatsTotalLabel,
  withdrawalStatsUrl,
} from '../../shared/utils/withdrawal.util';

let nextId = 0;

@Component({
  selector: 'app-withdrawal-stats-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <section class="card stats-panel" [attr.aria-labelledby]="headingId">
      <div class="stats-head">
        <h2 class="stats-heading" [id]="headingId">
          <button type="button" class="stats-toggle" [attr.aria-expanded]="expanded()" [attr.aria-controls]="bodyId" (click)="toggle()">
            <span>Retiros vigentes por motivo</span>
            <mat-icon class="stats-chevron" [class.is-open]="expanded()" aria-hidden="true">expand_more</mat-icon>
          </button>
        </h2>

        <div class="stats-summary mt-0.5">
          @if (summary() === 'loading') {
            <span class="stats-summary-note">Cargando estadísticas...</span>
          } @else if (summary() === 'error') {
            <span class="stats-summary-note stats-summary-error">No se pudieron cargar las estadísticas</span>
          } @else {
            <span class="stats-total">{{totalLabel()}}</span>
          }
        </div>
      </div>

      @if (expanded()) {
        <div class="stats-body" [id]="bodyId">
          @if (caption(); as text) {
            <div class="stats-caption">{{text}}</div>
          }

          @if (loading()) {
            <div class="stats-state">
              <span class="spinner stats-spinner w-4 h-4 border-2"></span>
              <span>Cargando estadísticas...</span>
            </div>
          } @else if (loadError(); as error) {
            <div class="stats-state stats-state--error">
              <mat-icon class="stats-error-icon">error_outline</mat-icon>
              <span class="stats-error-text">{{error}}</span>
              <button mat-stroked-button class="stats-retry shrink-0" (click)="load()">
                <mat-icon>refresh</mat-icon> Reintentar
              </button>
            </div>
          } @else if (stats(); as data) {
            @if (data.total === 0) {
              <div class="stats-state">Sin retiros vigentes con estos filtros</div>
            } @else {
              <div class="stats-rows" [class.stats-rows--wide]="data.byReason.length > 4">
                @for (row of data.byReason; track row.reasonId) {
                  <div class="stats-row" [class.stats-row--zero]="row.count === 0">
                    <div class="stats-row-line">
                      <span class="stats-name truncate">{{row.reasonName}}</span>
                      <span class="stats-count">{{row.count}}</span>
                      <span class="stats-share">{{share(row)}} %</span>
                    </div>
                    <div class="stats-bar" role="img" [attr.aria-label]="row.reasonName + ': ' + row.count + ' (' + share(row) + ' %)'">
                      <div class="stats-bar-fill" [style.width.%]="share(row)"></div>
                    </div>
                  </div>
                }
              </div>
            }
          }
        </div>
      }
    </section>
  `,
  styles: `
    /* Muted 13px text is the base; each piece only states how it differs. */
    .stats-panel { padding: 14px 16px; margin-bottom: 20px; font-size: 13px; color: var(--muted); }
    .stats-heading { margin: 0; font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 16px; color: var(--ink); }

    .stats-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: none;
      border: none;
      padding: 4px 6px;
      margin: -4px -6px;
      border-radius: 6px;
      font: inherit;
      color: inherit;
      cursor: pointer;
      min-height: 44px;
    }

    .stats-toggle:hover { background: var(--border-soft); }
    .stats-toggle:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
    .stats-chevron, .stats-error-icon { font-size: 20px; width: 20px; height: 20px; color: var(--muted-strong); }
    .stats-chevron.is-open { transform: rotate(180deg); }
    .stats-total { font-size: 14px; font-weight: 600; color: var(--ink-soft); }
    .stats-summary-error, .stats-error-icon { color: #b91c1c; }
    .stats-body { margin-top: 12px; }
    .stats-caption { font-size: 12px; margin-bottom: 10px; }
    .stats-state { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .stats-rows { display: flex; flex-direction: column; gap: 10px; }
    .stats-row { min-width: 0; }

    .stats-row-line {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      column-gap: 10px;
      align-items: baseline;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    .stats-state--error, .stats-name { color: var(--ink-soft); }
    .stats-name { text-align: left; }
    .stats-count { color: var(--ink); font-weight: 600; min-width: 28px; }
    .stats-share { color: var(--muted-strong); font-size: 12px; min-width: 44px; }
    .stats-row--zero * { color: var(--muted); }
    .stats-bar { height: 6px; border-radius: 3px; background: var(--border-soft); margin-top: 4px; overflow: hidden; }
    .stats-bar-fill { height: 100%; border-radius: inherit; background: var(--ink-soft); opacity: .6; }

    @media (min-width: 768px) {
      /* The caption sits on the right of the heading row; the body only groups. */
      .stats-panel { padding: 16px 20px; display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 32px; align-items: start; }
      .stats-body { display: contents; }
      .stats-caption { grid-area: 1 / 2; max-width: 320px; margin: 0; }
      .stats-state, .stats-rows { grid-column: 1 / -1; grid-row: 2; margin-top: 12px; }
      .stats-rows--wide { display: grid; grid-template-columns: 1fr 1fr; column-gap: 32px; }
    }

  `,
})
export class WithdrawalStatsPanelComponent {
  private readonly http = inject(HttpClient);
  private readonly uid = nextId++;

  readonly filters = input.required<WithdrawalStatsFilters>();
  readonly refreshToken = input(0);
  readonly caption = input<string | null>(null);

  readonly headingId = `withdrawal-stats-heading-${this.uid}`;
  readonly bodyId = `withdrawal-stats-body-${this.uid}`;

  // The address is a text, so a filter the statistics do not use (the state of
  // the withdrawal) never reaches the request.
  readonly url = computed(() => withdrawalStatsUrl(this.filters()));

  readonly stats = signal<WithdrawalStats | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly totalLabel = computed(() => withdrawalStatsTotalLabel(this.stats()?.total ?? 0));

  // The summary of the panel, which is the only line a closed panel shows.
  // Before the first answer there is nothing to count yet, so the panel reads
  // as loading instead of as zero withdrawals.
  readonly summary = computed<'loading' | 'error' | 'total'>(() => {
    if (this.loading()) return 'loading';
    if (this.loadError()) return 'error';
    if (!this.stats()) return 'loading';
    return 'total';
  });

  // The width of the window decides how the panel opens, once. Later resizes
  // leave it as the user left it.
  readonly expanded = signal(withdrawalStatsInitiallyExpanded(window.innerWidth));

  private loadSeq = 0;

  constructor() {
    effect(() => {
      const url = this.url();
      this.refreshToken();
      untracked(() => this.load(url));
    });
  }

  async load(url: string = this.url()): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const data = await firstValueFrom(this.http.get<WithdrawalStats>(url));
      if (seq !== this.loadSeq) return;
      this.stats.set(data);
    } catch (err: unknown) {
      if (seq !== this.loadSeq) return;
      this.loadError.set(withdrawalStatsErrorMessage(err));
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  share(row: WithdrawalReasonCount): number {
    return withdrawalReasonShare(row.count, this.stats()?.total ?? 0);
  }

  toggle(): void {
    this.expanded.update(v => !v);
  }
}
