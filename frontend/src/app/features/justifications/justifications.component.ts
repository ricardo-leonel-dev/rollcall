import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { Justification, AcademicYear, Course } from '../../core/models/index';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatSelectModule,
    MatInputModule, MatButtonModule, MatIconModule, MatSnackBarModule, LoadingSpinnerComponent,
  ],
  template: `
    <div class="page-title">Justificaciones</div>

    <div class="flex flex-wrap gap-3 mb-4">
      <mat-form-field appearance="outline" class="w-44">
        <mat-label>Año lectivo</mat-label>
        <mat-select [(ngModel)]="selYear" (ngModelChange)="load()">
          @for (y of years(); track y.id) { <mat-option [value]="y.id">{{y.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="w-56">
        <mat-label>Curso</mat-label>
        <mat-select [(ngModel)]="selCourse" (ngModelChange)="load()">
          <mat-option [value]="null">-- Todos --</mat-option>
          @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <div class="space-y-3">
        @for (j of justifications(); track j.id) {
          <mat-card>
            <mat-card-content class="pt-4">
              @if (editingId() === j.id) {
                <div class="space-y-2">
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Motivo</mat-label>
                    <textarea matInput [(ngModel)]="editReason" rows="2"></textarea>
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Quién notificó</mat-label>
                    <input matInput [(ngModel)]="editNotifiedBy">
                  </mat-form-field>
                  <div class="flex gap-2">
                    <button mat-flat-button color="primary" (click)="saveEdit(j.id)">Guardar</button>
                    <button mat-stroked-button (click)="editingId.set(null)">Cancelar</button>
                  </div>
                </div>
              } @else {
                <div class="flex justify-between items-start">
                  <div>
                    <div class="font-medium">{{j.reason}}</div>
                    @if (j.notifiedBy) { <div class="text-sm text-gray-500">Notificó: {{j.notifiedBy}}</div> }
                    <div class="text-xs text-gray-400 mt-1">
                      {{j.absenceIds?.length ?? 0}} falta(s) cubiertas · {{j.createdAt?.substring(0, 10)}}
                    </div>
                  </div>
                  <div class="flex gap-1">
                    <button mat-icon-button (click)="startEdit(j)"><mat-icon>edit</mat-icon></button>
                    <button mat-icon-button color="warn" (click)="remove(j.id)"><mat-icon>delete</mat-icon></button>
                  </div>
                </div>
              }
            </mat-card-content>
          </mat-card>
        }
        @if (justifications().length === 0) {
          <p class="text-gray-500 text-center py-8">No hay justificaciones con los filtros seleccionados</p>
        }
      </div>
    }
  `,
})
export class JustificationsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly years = signal<AcademicYear[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly justifications = signal<Justification[]>([]);
  readonly loading = signal(false);
  readonly editingId = signal<number | null>(null);

  selYear: number | null = null;
  selCourse: number | null = null;
  editReason = '';
  editNotifiedBy = '';

  async ngOnInit(): Promise<void> {
    const [years, courses] = await Promise.all([
      firstValueFrom(this.http.get<AcademicYear[]>('/api/academic-years')),
      firstValueFrom(this.http.get<Course[]>('/api/courses')),
    ]);
    this.years.set(years);
    this.courses.set(courses);
    const active = years.find(y => y.isActive);
    if (active) { this.selYear = active.id; await this.load(); }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.http.get<Justification[]>('/api/justifications'));
      this.justifications.set(data);
    } finally {
      this.loading.set(false);
    }
  }

  startEdit(j: Justification): void {
    this.editingId.set(j.id);
    this.editReason = j.reason;
    this.editNotifiedBy = j.notifiedBy ?? '';
  }

  async saveEdit(id: number): Promise<void> {
    await firstValueFrom(this.http.put(`/api/justifications/${id}`, {
      reason: this.editReason, notifiedBy: this.editNotifiedBy,
    }));
    this.editingId.set(null);
    this.snack.open('Guardado', '', { duration: 2000 });
    await this.load();
  }

  async remove(id: number): Promise<void> {
    if (!confirm('¿Eliminar esta justificación?')) return;
    await firstValueFrom(this.http.delete(`/api/justifications/${id}`));
    this.snack.open('Eliminado', '', { duration: 2000 });
    await this.load();
  }
}
