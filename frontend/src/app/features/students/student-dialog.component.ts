import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { firstValueFrom } from 'rxjs';
import { Student, AcademicYear, Course, Enrollment, Guardian } from '../../core/models/index';
import { dateStringToDate, dateToDateString } from '../../shared/utils/date.util';
import { NotificationService } from '../../core/services/notification.service';

export interface StudentDialogData {
  mode: 'create' | 'edit';
  student?: Student;
  enrollment?: Enrollment | null;
  years: AcademicYear[];
  courses: Course[];
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatDatepickerModule],
  styles: [`
    .section-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--muted); margin: 16px 0 8px;
    }
    .section-title:first-child { margin-top: 4px; }
    mat-form-field { width: 100%; }
  `],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">{{data.mode === 'edit' ? 'Editar estudiante' : 'Nuevo estudiante'}}</h2>
    <mat-dialog-content>
      <div class="section-title">Datos personales</div>
      <mat-form-field appearance="outline"><mat-label>Nombre completo *</mat-label><input matInput [(ngModel)]="name"></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Cédula</mat-label><input matInput [(ngModel)]="idNumber"></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Sexo (H/M)</mat-label><input matInput [(ngModel)]="gender"></mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>F. Nacimiento</mat-label>
        <input matInput [matDatepicker]="pickerBirth" [(ngModel)]="birthDate">
        <mat-datepicker-toggle matIconSuffix [for]="pickerBirth"></mat-datepicker-toggle>
        <mat-datepicker #pickerBirth></mat-datepicker>
      </mat-form-field>

      @if (data.mode === 'create') {
        <div class="section-title">Matrícula (opcional)</div>
        <mat-form-field appearance="outline">
          <mat-label>Año lectivo</mat-label>
          <mat-select [(ngModel)]="selYear">
            <mat-option [value]="null">— Sin matricular por ahora —</mat-option>
            @for (y of data.years; track y.id) { <mat-option [value]="y.id">{{y.name}}</mat-option> }
          </mat-select>
        </mat-form-field>
        @if (selYear) {
          <mat-form-field appearance="outline">
            <mat-label>Curso</mat-label>
            <mat-select [(ngModel)]="selCourse">
              <mat-option [value]="null">— Seleccionar —</mat-option>
              @for (c of data.courses; track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
      }

      @if (showGuardianFields()) {
        <div class="section-title">Representante (opcional)</div>
        <mat-form-field appearance="outline"><mat-label>Nombre completo</mat-label><input matInput [(ngModel)]="guardianName"></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Cédula</mat-label><input matInput [(ngModel)]="guardianIdNumber"></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Teléfono</mat-label><input matInput [(ngModel)]="guardianPhone"></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Email</mat-label><input matInput [(ngModel)]="guardianEmail"></mat-form-field>
      } @else if (data.mode === 'edit') {
        <div style="font-size:12px;color:var(--muted);margin-top:12px">Sin matrícula activa — no se puede asignar representante todavía.</div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)">Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!name || saving()">
        {{data.mode === 'edit' ? 'Guardar' : 'Crear'}}
      </button>
    </mat-dialog-actions>
  `,
})
export class StudentDialogComponent {
  readonly dialogRef = inject(MatDialogRef<StudentDialogComponent, boolean>);
  readonly data: StudentDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);

  name = this.data.student?.name ?? '';
  idNumber = this.data.student?.idNumber ?? '';
  gender = this.data.student?.gender ?? '';
  birthDate: Date | null = this.data.student?.birthDate ? dateStringToDate(this.data.student.birthDate) : null;

  selYear: number | null = null;
  selCourse: number | null = null;

  guardianName = this.data.enrollment?.guardianName ?? '';
  guardianIdNumber = this.data.enrollment?.guardianIdNumber ?? '';
  guardianPhone = this.data.enrollment?.guardianPhone ?? '';
  guardianEmail = this.data.enrollment?.guardianEmail ?? '';

  readonly saving = signal(false);

  showGuardianFields(): boolean {
    if (this.data.mode === 'create') return !!(this.selYear && this.selCourse);
    return !!this.data.enrollment;
  }

  async save(): Promise<void> {
    if (!this.name) { this.notify.warning('El nombre es requerido'); return; }
    this.saving.set(true);
    const studentBody = { name: this.name, idNumber: this.idNumber || null, gender: this.gender || null, birthDate: this.birthDate ? dateToDateString(this.birthDate) : null };
    const guardianBody = { name: this.guardianName, idNumber: this.guardianIdNumber, phone: this.guardianPhone, email: this.guardianEmail };
    try {
      if (this.data.mode === 'edit') {
        await firstValueFrom(this.http.put(`/api/students/${this.data.student!.id}`, studentBody));
        const e = this.data.enrollment;
        if (e && this.guardianName) {
          if (e.guardianId) {
            await firstValueFrom(this.http.put(`/api/guardians/${e.guardianId}`, guardianBody));
          } else {
            const guardian = await firstValueFrom(this.http.post<Guardian>('/api/guardians', guardianBody));
            await firstValueFrom(this.http.put(`/api/enrollments/${e.enrollmentId}`, { guardianId: guardian.id }));
          }
        }
        this.notify.success('Guardado');
      } else {
        const student = await firstValueFrom(this.http.post<Student>('/api/students', studentBody));
        if (this.selYear && this.selCourse) {
          let guardianId: number | undefined;
          if (this.guardianName) {
            const guardian = await firstValueFrom(this.http.post<Guardian>('/api/guardians', guardianBody));
            guardianId = guardian.id;
          }
          await firstValueFrom(this.http.post('/api/enrollments', {
            studentId: student.id, courseId: this.selCourse, academicYearId: this.selYear, guardianId,
          }));
        }
        this.notify.success('Estudiante creado');
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }
}
