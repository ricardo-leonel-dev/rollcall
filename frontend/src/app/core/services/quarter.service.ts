import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Quarter } from '../models/index';

export type QuarterPayload = {
  name: 'Primer Trimestre' | 'Segundo Trimestre' | 'Tercer Trimestre';
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
};

export type QuarterPatch = {
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
};

@Injectable({ providedIn: 'root' })
export class QuarterService {
  private readonly http = inject(HttpClient);

  getAll(): Promise<Quarter[]> {
    return firstValueFrom(this.http.get<Quarter[]>('/api/quarters'));
  }

  create(data: QuarterPayload): Promise<Quarter> {
    return firstValueFrom(this.http.post<Quarter>('/api/quarters', data));
  }

  update(id: number, data: QuarterPatch): Promise<Quarter> {
    return firstValueFrom(this.http.put<Quarter>(`/api/quarters/${id}`, data));
  }
}
