import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Institution } from '../models/index';

// Only meaningful for a superadmin (no institution of their own) — lets them
// pick which institution's data to view/operate on. Sent as X-Institution-Id
// by the auth interceptor; institution-bound users ignore this entirely,
// their institution always comes from the JWT.
@Injectable({ providedIn: 'root' })
export class InstitutionContextService {
  private readonly http = inject(HttpClient);

  private readonly _institutions = signal<Institution[]>([]);
  private readonly _selectedId = signal<number | null>(
    (() => { const v = localStorage.getItem('selectedInstitutionId'); return v ? +v : null; })()
  );

  readonly institutions = this._institutions.asReadonly();
  readonly selectedId = this._selectedId.asReadonly();
  readonly selectedName = computed(
    () => this._institutions().find(i => i.id === this._selectedId())?.name ?? null
  );

  async loadInstitutions(): Promise<void> {
    const list = await firstValueFrom(this.http.get<Institution[]>('/api/institutions'));
    this._institutions.set(list);
    if (this._selectedId() === null && list.length) {
      this.select(list[0].id);
    }
  }

  select(id: number): void {
    localStorage.setItem('selectedInstitutionId', String(id));
    this._selectedId.set(id);
  }

  clear(): void {
    localStorage.removeItem('selectedInstitutionId');
    this._selectedId.set(null);
    this._institutions.set([]);
  }
}
