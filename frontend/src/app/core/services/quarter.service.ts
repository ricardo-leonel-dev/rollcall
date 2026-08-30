import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Quarter } from '../models/index';

export type QuarterPayload = {
  name: string;
  sequenceNumber?: number;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
};

export type QuarterPatch = {
  name?: string;
  sequenceNumber?: number;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
};

@Injectable({ providedIn: 'root' })
export class QuarterService {
  private readonly http = inject(HttpClient);

  // Optional `academicYearId` is forwarded as `?academic_year_id=` to scope the
  // response to a specific year (R1). Calling with zero args keeps the legacy
  // `GET /api/quarters` (no query string) byte-for-byte unchanged so existing
  // AdminComponent callers (`loadAll()`, `openQuartersDialog()`,
  // `saveAcademicYear()`) continue to work without modification.
  getAll(academicYearId?: number): Promise<Quarter[]> {
    const params = academicYearId !== undefined
      ? new HttpParams().set('academic_year_id', String(academicYearId))
      : undefined;
    return firstValueFrom(this.http.get<Quarter[]>('/api/quarters', params ? { params } : {}));
  }

  create(data: QuarterPayload): Promise<Quarter> {
    return firstValueFrom(this.http.post<Quarter>('/api/quarters', data));
  }

  update(id: number, data: QuarterPatch): Promise<Quarter> {
    return firstValueFrom(this.http.put<Quarter>(`/api/quarters/${id}`, data));
  }

  remove(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/quarters/${id}`));
  }
}
