import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Quarter } from '../models/index';
import { QuarterService } from './quarter.service';
import { AcademicYearContextService } from './academic-year-context.service';
import { dateToDateString } from '../../shared/utils/date.util';

// Fuente única del "período/trimestre actualmente seleccionado" para todos
// los consumidores del dropdown reutilizable (Dashboard hoy, próximas vistas
// de lista en feature 6). Carga los períodos del año lectivo seleccionado en
// AcademicYearContextService y reacciona a cambios de año (R5) recargando
// automáticamente — sin persistencia en localStorage, igual que el patrón del
// año lectivo: el "período actual" lo define la fecha real al momento del load,
// no una preferencia personal.
@Injectable({ providedIn: 'root' })
export class QuarterContextService {
  private readonly quarterService = inject(QuarterService);
  private readonly academicYearContext = inject(AcademicYearContextService);

  private readonly _quarters = signal<Quarter[]>([]);
  private readonly _selectedId = signal<number | null>(null);
  private readonly _defaultQuarterId = signal<number | null>(null);
  private readonly _defaultWasFallback = signal(false);
  private readonly _fallbackDirection = signal<'past' | 'future' | null>(null);
  private readonly _loaded = signal(false);

  readonly quarters = this._quarters.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly selectedId = this._selectedId.asReadonly();
  readonly defaultQuarterId = this._defaultQuarterId.asReadonly();
  readonly defaultWasFallback = this._defaultWasFallback.asReadonly();
  readonly fallbackDirection = this._fallbackDirection.asReadonly();

  readonly selected = computed(
    () => this._quarters().find(q => q.id === this._selectedId()) ?? null
  );

  readonly isViewingActiveYear = computed(
    () => this.academicYearContext.selected()?.isActive === true
  );

  constructor() {
    // R5: cuando cambia el año lectivo después del primer load, recargar
    // automáticamente. La condición `this._loaded()` evita disparar un fetch
    // durante el bootstrap inicial (donde AcademicYearContextService.load()
    // corre en paralelo y setea selectedId() por primera vez); el effect se
    // re-ejecuta cuando cambia academicYearContext.selectedId() y la guarda
    // evita el primer set.
    effect(() => {
      const ayId = this.academicYearContext.selectedId();
      if (this._loaded() && ayId !== null) {
        this.load();
      }
    });
  }

  async load(): Promise<void> {
    const academicYearId = this.academicYearContext.selectedId();
    const list = await this.quarterService.getAll(academicYearId ?? undefined);
    const sorted = [...list].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    this._quarters.set(sorted);
    const { id, isFallback, direction } = computeDefaultQuarter(sorted, dateToDateString(new Date()));
    this._defaultQuarterId.set(id);
    this._defaultWasFallback.set(isFallback);
    this._fallbackDirection.set(direction);
    this._selectedId.set(id);
    this._loaded.set(true);
  }

  select(id: number | null): void {
    this._selectedId.set(id);
  }
}

// Función pura (testable sin Angular) — recibe una lista de Quarter y la fecha
// de "hoy" en formato ISO `YYYY-MM-DD` (lexicográficamente comparable), y
// devuelve el id del período por defecto junto con metadatos para que el
// componente muestre la nota correcta (R6–R11). Sólo se consideran períodos con
// ambas fechas completas; los parciales quedan en `quarters` pero nunca ganan
// el default automático (R11).
export function computeDefaultQuarter(
  quarters: Quarter[],
  today: string
): { id: number | null; isFallback: boolean; direction: 'past' | 'future' | null } {
  const dated = quarters.filter(q => q.startDate && q.endDate) as (Quarter & { startDate: string; endDate: string })[];

  const containing = dated.filter(q => q.startDate <= today && today <= q.endDate);
  if (containing.length > 0) {
    const winner = containing.reduce((a, b) => (a.sequenceNumber <= b.sequenceNumber ? a : b));
    return { id: winner.id, isFallback: false, direction: null };
  }

  const past = dated.filter(q => q.endDate < today);
  if (past.length > 0) {
    const winner = past.reduce((a, b) =>
      a.endDate !== b.endDate ? (a.endDate > b.endDate ? a : b) : (a.sequenceNumber <= b.sequenceNumber ? a : b)
    );
    return { id: winner.id, isFallback: true, direction: 'past' };
  }

  const future = dated.filter(q => q.startDate > today);
  if (future.length > 0) {
    const winner = future.reduce((a, b) =>
      a.startDate !== b.startDate ? (a.startDate < b.startDate ? a : b) : (a.sequenceNumber <= b.sequenceNumber ? a : b)
    );
    return { id: winner.id, isFallback: true, direction: 'future' };
  }

  return { id: null, isFallback: false, direction: null };
}