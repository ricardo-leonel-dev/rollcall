import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom, debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { Student } from '../../core/models/index';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatSidenavModule, MatDividerModule,
    MatSnackBarModule, LoadingSpinnerComponent,
  ],
  template: `
    <div class="page-title">Estudiantes</div>

    <mat-sidenav-container class="min-h-screen">
      <mat-sidenav-content>
        <div class="flex gap-3 mb-4">
          <mat-form-field appearance="outline" class="flex-1 max-w-sm">
            <mat-label>Buscar estudiante</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [(ngModel)]="searchTerm" (ngModelChange)="search$.next($event)">
          </mat-form-field>
          <button mat-flat-button color="primary" (click)="openNew()">
            <mat-icon>add</mat-icon> Nuevo
          </button>
        </div>

        @if (loading()) {
          <app-loading-spinner />
        } @else {
          <!-- Desktop table -->
          <div class="hidden md:block overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="p-2 text-left">Nombre</th>
                  <th class="p-2 text-left">Cédula</th>
                  <th class="p-2 text-left">Sexo</th>
                  <th class="p-2 text-left">F. Nac.</th>
                  <th class="p-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (s of students(); track s.id) {
                  <tr class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" (click)="selectStudent(s)">
                    <td class="p-2 font-medium">{{s.name}}</td>
                    <td class="p-2 text-gray-500">{{s.idNumber ?? '—'}}</td>
                    <td class="p-2">{{s.gender ?? '—'}}</td>
                    <td class="p-2 text-gray-500">{{s.birthDate ?? '—'}}</td>
                    <td class="p-2">
                      <button mat-icon-button (click)="selectStudent(s); $event.stopPropagation()">
                        <mat-icon>open_in_new</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <!-- Mobile cards -->
          <div class="md:hidden space-y-2">
            @for (s of students(); track s.id) {
              <div class="card cursor-pointer" (click)="selectStudent(s)">
                <div class="font-medium">{{s.name}}</div>
                <div class="text-xs text-gray-500">{{s.idNumber ?? ''}} · {{s.gender ?? ''}} · {{s.birthDate ?? ''}}</div>
              </div>
            }
          </div>
        }
      </mat-sidenav-content>

      <mat-sidenav position="end" [opened]="!!selectedStudent()" mode="over" class="w-full md:w-96">
        @if (selectedStudent()) {
          <div class="p-4">
            <div class="flex justify-between items-center mb-4">
              <h3 class="font-bold text-lg">Detalle del Estudiante</h3>
              <button mat-icon-button (click)="selectedStudent.set(null)"><mat-icon>close</mat-icon></button>
            </div>

            @if (editMode()) {
              <div class="space-y-3">
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Nombre completo</mat-label>
                  <input matInput [(ngModel)]="editForm.name">
                </mat-form-field>
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Cédula</mat-label>
                  <input matInput [(ngModel)]="editForm.idNumber">
                </mat-form-field>
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Sexo</mat-label>
                  <input matInput [(ngModel)]="editForm.gender" maxlength="1">
                </mat-form-field>
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Fecha de nacimiento</mat-label>
                  <input matInput type="date" [(ngModel)]="editForm.birthDate">
                </mat-form-field>
                <div class="flex gap-2">
                  <button mat-flat-button color="primary" (click)="saveStudent()">Guardar</button>
                  <button mat-stroked-button (click)="editMode.set(false)">Cancelar</button>
                </div>
              </div>
            } @else {
              <div class="space-y-2 text-sm">
                <div><span class="text-gray-500">Nombre:</span> {{selectedStudent()!.name}}</div>
                <div><span class="text-gray-500">Cédula:</span> {{selectedStudent()!.idNumber ?? '—'}}</div>
                <div><span class="text-gray-500">Sexo:</span> {{selectedStudent()!.gender ?? '—'}}</div>
                <div><span class="text-gray-500">F. Nac.:</span> {{selectedStudent()!.birthDate ?? '—'}}</div>
                <div class="flex gap-2 mt-4">
                  <button mat-flat-button color="primary" (click)="startEdit()">
                    <mat-icon>edit</mat-icon> Editar
                  </button>
                  <button mat-flat-button color="warn" (click)="deleteStudent()">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </mat-sidenav>
    </mat-sidenav-container>

    <!-- New student form -->
    @if (showNewForm()) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <mat-card class="w-full max-w-md">
          <mat-card-header><mat-card-title>Nuevo Estudiante</mat-card-title></mat-card-header>
          <mat-card-content class="pt-4 space-y-3">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Nombre completo *</mat-label>
              <input matInput [(ngModel)]="newForm.name">
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Cédula</mat-label>
              <input matInput [(ngModel)]="newForm.idNumber">
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Sexo (M/F)</mat-label>
              <input matInput [(ngModel)]="newForm.gender" maxlength="1">
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Fecha de nacimiento</mat-label>
              <input matInput type="date" [(ngModel)]="newForm.birthDate">
            </mat-form-field>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button (click)="showNewForm.set(false)">Cancelar</button>
            <button mat-flat-button color="primary" (click)="createStudent()" [disabled]="!newForm.name">Crear</button>
          </mat-card-actions>
        </mat-card>
      </div>
    }
  `,
})
export class StudentsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly students = signal<Student[]>([]);
  readonly loading = signal(false);
  readonly selectedStudent = signal<Student | null>(null);
  readonly editMode = signal(false);
  readonly showNewForm = signal(false);

  searchTerm = '';
  editForm = { name: '', idNumber: '', gender: '', birthDate: '' };
  newForm = { name: '', idNumber: '', gender: '', birthDate: '' };

  readonly search$ = new Subject<string>();

  constructor() {
    this.search$.pipe(
      debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()
    ).subscribe(term => this.loadStudents(term));
  }

  async ngOnInit(): Promise<void> { await this.loadStudents(); }

  async loadStudents(search = ''): Promise<void> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.http.get<Student[]>(`/api/students${search ? `?search=${search}` : ''}`));
      this.students.set(data);
    } finally { this.loading.set(false); }
  }

  selectStudent(s: Student): void {
    this.selectedStudent.set(s);
    this.editMode.set(false);
  }

  startEdit(): void {
    const s = this.selectedStudent()!;
    this.editForm = { name: s.name, idNumber: s.idNumber ?? '', gender: s.gender ?? '', birthDate: s.birthDate ?? '' };
    this.editMode.set(true);
  }

  async saveStudent(): Promise<void> {
    const id = this.selectedStudent()!.id;
    await firstValueFrom(this.http.put<Student>(`/api/students/${id}`, this.editForm));
    this.snack.open('Guardado', '', { duration: 2000 });
    this.editMode.set(false);
    await this.loadStudents(this.searchTerm);
    const updated = this.students().find(s => s.id === id) ?? null;
    this.selectedStudent.set(updated);
  }

  async deleteStudent(): Promise<void> {
    if (!confirm('¿Eliminar este estudiante?')) return;
    await firstValueFrom(this.http.delete(`/api/students/${this.selectedStudent()!.id}`));
    this.selectedStudent.set(null);
    await this.loadStudents(this.searchTerm);
  }

  openNew(): void {
    this.newForm = { name: '', idNumber: '', gender: '', birthDate: '' };
    this.showNewForm.set(true);
  }

  async createStudent(): Promise<void> {
    await firstValueFrom(this.http.post('/api/students', this.newForm));
    this.showNewForm.set(false);
    this.snack.open('Estudiante creado', '', { duration: 2000 });
    await this.loadStudents(this.searchTerm);
  }
}
