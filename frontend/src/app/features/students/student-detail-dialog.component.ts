import { Component, ChangeDetectionStrategy, OnInit, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { Student, Enrollment } from '../../core/models/index';

export interface StudentDetailDialogData {
  student: Student;
}

export type StudentDetailResult = { action: 'edit'; enrollment: Enrollment | null } | { action: 'delete' } | undefined;

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  styles: [`
    :host { display: block; position: relative; }
    .detail-header { padding: 4px 0 16px; }
    .detail-avatar {
      width: 56px; height: 56px; border-radius: 14px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Fraunces', serif;
      font-size: 22px; font-weight: 600; margin-bottom: 12px;
    }
    .detail-name { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; color: var(--ink); }
    .section-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--muted); margin: 16px 0 4px;
    }
    .field-row {
      padding: 12px 0; border-bottom: 1px solid var(--border-soft);
      display: flex; justify-content: space-between; gap: 12px;
    }
    .field-label { font-size: 13px; color: var(--muted); flex-shrink: 0; }
    .field-value { font-size: 13px; font-weight: 500; color: var(--ink-soft); text-align: right; }
    .section-note { font-size: 12px; color: var(--muted); padding: 8px 0; }
  `],
  template: `
    <button mat-icon-button [mat-dialog-close]="undefined" style="position:absolute;top:8px;right:8px;color:var(--muted-strong)"><mat-icon>close</mat-icon></button>
    <mat-dialog-content>
      <div class="detail-header">
        <div class="detail-avatar">{{data.student.name[0]}}</div>
        <div class="detail-name">{{data.student.name}}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">ID: {{data.student.id}}</div>
      </div>

      <div class="section-title">Información</div>
      @for (field of infoFields(); track field.label) {
        <div class="field-row">
          <span class="field-label">{{field.label}}</span>
          <span class="field-value">{{field.value || '—'}}</span>
        </div>
      }

      <div class="section-title">Representante</div>
      @if (loadingEnrollment()) {
        <div class="spinner-center" style="padding:20px 0"><div class="spinner spinner-sm"></div></div>
      } @else if (enrollment()) {
        @for (field of guardianFields(); track field.label) {
          <div class="field-row">
            <span class="field-label">{{field.label}}</span>
            <span class="field-value">{{field.value || '—'}}</span>
          </div>
        }
      } @else {
        <div class="section-note">Sin matrícula activa — no se puede asignar representante todavía.</div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button color="warn" [mat-dialog-close]="{action: 'delete'}"><mat-icon>delete</mat-icon> Eliminar</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="{action: 'edit', enrollment: enrollment()}"><mat-icon>edit</mat-icon> Editar</button>
    </mat-dialog-actions>
  `,
})
export class StudentDetailDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<StudentDetailDialogComponent, StudentDetailResult>);
  readonly data: StudentDetailDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);

  readonly enrollment = signal<Enrollment | null>(null);
  readonly loadingEnrollment = signal(false);

  readonly infoFields = () => {
    const s = this.data.student;
    return [
      { label: 'Cédula', value: s.idNumber },
      { label: 'Sexo', value: s.gender === 'H' ? 'Masculino' : s.gender === 'M' ? 'Femenino' : s.gender },
      { label: 'Nacimiento', value: s.birthDate },
    ];
  };

  readonly guardianFields = () => {
    const e = this.enrollment();
    if (!e) return [];
    return [
      { label: 'Nombre', value: e.guardianName },
      { label: 'Cédula', value: e.guardianIdNumber },
      { label: 'Teléfono', value: e.guardianPhone },
      { label: 'Email', value: e.guardianEmail },
    ];
  };

  async ngOnInit(): Promise<void> {
    this.loadingEnrollment.set(true);
    try {
      const data = await firstValueFrom(this.http.get<Enrollment[]>(`/api/enrollments?student_id=${this.data.student.id}`));
      this.enrollment.set(data[0] ?? null);
    } finally {
      this.loadingEnrollment.set(false);
    }
  }
}
