import { Component, ChangeDetectionStrategy, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Quarter } from '../../../core/models/index';
import { QuarterContextService } from '../../../core/services/quarter-context.service';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSelectModule, MatFormFieldModule, FormsModule],
  selector: 'app-quarter-selector',
  styles: [`
    .quarter-selector-placeholder,
    .quarter-selector-note {
      color: var(--muted-strong);
      font-family: 'Nunito', sans-serif;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
    }
    /* Notas adyacentes al dropdown (T9 — partial-date, fallback) llevan un
       pequeño margen para no pegarse al outline. Las notas de los estados de
       guardia (T8 — loading, sin períodos) ocupan el ancho del field, así
       que no llevan margin-left para no desalinear el envelope. */
    .quarter-selector-note.beside {
      margin-left: 8px;
    }
    .quarter-selector-host {
      display: inline-flex;
      align-items: center;
      min-height: 40px;
    }
  `],
  template: `
    <div class="quarter-selector-host">
      @if (!context.loaded()) {
        <div class="quarter-selector-placeholder">Cargando períodos…</div>
      } @else if (context.quarters().length === 0) {
        <div class="quarter-selector-note">No hay períodos configurados para este año lectivo.</div>
      } @else {
        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:200px">
          <mat-label>Período</mat-label>
          <mat-select [ngModel]="context.selectedId()" (ngModelChange)="onSelect($event)">
            @for (q of context.quarters(); track q.id) {
              <mat-option [value]="q.id">{{ q.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (!hasAnyDatedQuarter()) {
          <span class="quarter-selector-note beside">Los períodos no tienen fechas configuradas.</span>
        } @else if (context.defaultWasFallback() && context.selectedId() === context.defaultQuarterId()) {
          <span class="quarter-selector-note beside">
            Hoy está fuera de los períodos definidos — mostrando
            {{ context.fallbackDirection() === 'past' ? 'el período más reciente' : 'el próximo período' }}.
          </span>
        }
      }
    </div>
  `,
})
export class QuarterSelectorComponent {
  readonly context = inject(QuarterContextService);
  readonly quarterChange = output<Quarter | null>();

  hasAnyDatedQuarter(): boolean {
    return this.context.quarters().some(q => q.startDate && q.endDate);
  }

  onSelect(id: number): void {
    this.context.select(id);
    this.quarterChange.emit(this.context.quarters().find(q => q.id === id) ?? null);
  }
}