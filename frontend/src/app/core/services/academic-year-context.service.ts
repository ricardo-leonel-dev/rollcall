import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AcademicYear } from '../models/index';

// Fuente única del "año lectivo actual" — antes cada componente (dashboard,
// absences, enrollments, justifications, calendar) repetía su propio fetch +
// years.find(y => y.isActive), con resultados ambiguos si llegaba a haber
// más de un año activo. Sin persistencia en localStorage a propósito (a
// diferencia de InstitutionContextService): el año activo es un hecho de la
// institución, no una preferencia personal — cada carga vuelve a tomar el
// real. select() solo cambia qué año se está viendo en pantalla, no cuál es
// el activo de verdad.
@Injectable({ providedIn: 'root' })
export class AcademicYearContextService {
  private readonly http = inject(HttpClient);

  private readonly _years = signal<AcademicYear[]>([]);
  private readonly _selectedId = signal<number | null>(null);

  readonly years = this._years.asReadonly();
  readonly selectedId = this._selectedId.asReadonly();
  readonly selected = computed(
    () => this._years().find(y => y.id === this._selectedId()) ?? null
  );

  async load(): Promise<void> {
    const list = await firstValueFrom(this.http.get<AcademicYear[]>('/api/academic-years'));
    this._years.set(list);
    this._selectedId.set(list.find(y => y.isActive)?.id ?? null);
  }

  select(id: number): void {
    this._selectedId.set(id);
  }
}
