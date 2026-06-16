import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { AcademicYear, Course, User, Role, RolePermission } from '../../core/models/index';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatTabsModule, MatCardModule, MatFormFieldModule, MatSelectModule,
    MatInputModule, MatButtonModule, MatIconModule, MatTableModule, MatCheckboxModule,
    MatSnackBarModule, MatProgressBarModule, LoadingSpinnerComponent,
  ],
  template: `
    <div class="page-title">Administración</div>

    <mat-tab-group>

      <!-- AÑO LECTIVOS -->
      <mat-tab label="Años Lectivos">
        <div class="pt-4 space-y-4">
          <div class="flex gap-3">
            <mat-form-field appearance="outline"><mat-label>Nombre</mat-label><input matInput [(ngModel)]="newYear.name"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Inicio</mat-label><input matInput type="date" [(ngModel)]="newYear.startDate"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Fin</mat-label><input matInput type="date" [(ngModel)]="newYear.endDate"></mat-form-field>
            <button mat-flat-button color="primary" (click)="createYear()">Agregar</button>
          </div>
          @for (y of years(); track y.id) {
            <div class="card flex justify-between items-center">
              <span class="font-medium">{{y.name}}</span>
              <div class="flex gap-2 items-center">
                <span class="text-xs text-gray-500">{{y.startDate}} — {{y.endDate}}</span>
                <span class="badge-J" [class]="y.isActive ? 'badge-J' : 'bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded'">
                  {{y.isActive ? 'Activo' : 'Inactivo'}}
                </span>
                <button mat-icon-button color="warn" (click)="deleteYear(y.id)"><mat-icon>delete</mat-icon></button>
              </div>
            </div>
          }
        </div>
      </mat-tab>

      <!-- CURSOS -->
      <mat-tab label="Cursos">
        <div class="pt-4 space-y-4">
          <div class="flex gap-3">
            <mat-form-field appearance="outline" class="flex-1"><mat-label>Nombre del curso</mat-label><input matInput [(ngModel)]="newCourse.name"></mat-form-field>
            <button mat-flat-button color="primary" (click)="createCourse()">Agregar</button>
          </div>
          <div class="overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr><th class="p-2 text-left">Curso</th><th class="p-2 text-left">Jornada</th><th class="p-2"></th></tr>
              </thead>
              <tbody>
                @for (c of courses(); track c.id) {
                  <tr class="border-b border-gray-100">
                    <td class="p-2">{{c.name}}</td>
                    <td class="p-2 text-gray-500">{{c.shift}}</td>
                    <td class="p-2">
                      <button mat-icon-button color="warn" (click)="deleteCourse(c.id)"><mat-icon>delete</mat-icon></button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </mat-tab>

      <!-- USUARIOS -->
      <mat-tab label="Usuarios">
        <div class="pt-4 space-y-4">
          <div class="flex flex-wrap gap-3">
            <mat-form-field appearance="outline"><mat-label>Usuario</mat-label><input matInput [(ngModel)]="newUser.username"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Contraseña</mat-label><input matInput type="password" [(ngModel)]="newUser.password"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Nombre</mat-label><input matInput [(ngModel)]="newUser.fullName"></mat-form-field>
            <mat-form-field appearance="outline" class="w-36">
              <mat-label>Rol</mat-label>
              <mat-select [(ngModel)]="newUser.roleId">
                @for (r of roles(); track r.id) { <mat-option [value]="r.id">{{r.name}}</mat-option> }
              </mat-select>
            </mat-form-field>
            <button mat-flat-button color="primary" (click)="createUser()">Crear</button>
          </div>
          @for (u of users(); track u.id) {
            <div class="card flex justify-between items-center">
              <div>
                <div class="font-medium">{{u.username}} <span class="text-xs text-blue-600 ml-2">{{u.roleName}}</span></div>
                <div class="text-sm text-gray-500">{{u.fullName}}</div>
              </div>
              <button mat-icon-button color="warn" (click)="deleteUser(u.id)"><mat-icon>delete</mat-icon></button>
            </div>
          }
        </div>
      </mat-tab>

      <!-- ROLES Y PERMISOS -->
      <mat-tab label="Roles y Permisos">
        <div class="pt-4">
          <mat-form-field appearance="outline" class="w-48 mb-4">
            <mat-label>Rol</mat-label>
            <mat-select [(ngModel)]="selRole" (ngModelChange)="loadPermissions()">
              @for (r of roles(); track r.id) { <mat-option [value]="r.id">{{r.name}}</mat-option> }
            </mat-select>
          </mat-form-field>
          @if (permissions().length > 0) {
            <div class="overflow-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="p-2 text-left">Recurso</th>
                    <th class="p-2 text-center">Leer</th>
                    <th class="p-2 text-center">Crear</th>
                    <th class="p-2 text-center">Actualizar</th>
                    <th class="p-2 text-center">Eliminar</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of permissions(); track p.resource) {
                    <tr class="border-b border-gray-100">
                      <td class="p-2 font-medium">{{p.resource}}</td>
                      <td class="p-2 text-center"><mat-checkbox [(ngModel)]="p.canRead" /></td>
                      <td class="p-2 text-center"><mat-checkbox [(ngModel)]="p.canCreate" /></td>
                      <td class="p-2 text-center"><mat-checkbox [(ngModel)]="p.canUpdate" /></td>
                      <td class="p-2 text-center"><mat-checkbox [(ngModel)]="p.canDelete" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <button mat-flat-button color="primary" class="mt-4" (click)="savePermissions()">Guardar permisos</button>
          }
        </div>
      </mat-tab>

      <!-- IMPORTAR NÓMINA -->
      <mat-tab label="Importar Nómina">
        <div class="pt-4">
          <p class="text-gray-600 mb-4">Sube el archivo Excel de nómina. Cada hoja = un curso. Fila 6 = encabezados, fila 7+ = estudiantes.</p>
          <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4">
            <label class="cursor-pointer">
              <input type="file" class="hidden" accept=".xlsx,.xls" (change)="onRosterFile($event)">
              <mat-icon class="text-gray-400 text-4xl" style="font-size:40px">upload_file</mat-icon>
              <p class="text-gray-500 mt-2">Haz clic para seleccionar el archivo Excel</p>
            </label>
          </div>
          @if (importLoading()) {
            <app-loading-spinner message="Procesando nómina..." />
          }
          @if (importResult()) {
            <div class="card bg-green-50 border border-green-200">
              <div class="text-green-800 font-medium mb-2">Importación completada</div>
              <div class="text-sm space-y-1">
                <div>Cursos: {{importResult()!.coursesProcessed}}</div>
                <div>Estudiantes creados: {{importResult()!.studentsCreated}}</div>
                <div>Estudiantes actualizados: {{importResult()!.studentsUpdated}}</div>
                <div>Matrículas creadas: {{importResult()!.enrollmentsCreated}}</div>
                @if (importResult()!.errors.length > 0) {
                  <div class="text-orange-600">Errores: {{importResult()!.errors.length}}</div>
                }
              </div>
            </div>
          }
        </div>
      </mat-tab>

    </mat-tab-group>
  `,
})
export class AdminComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly years = signal<AcademicYear[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly users = signal<User[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly permissions = signal<RolePermission[]>([]);
  readonly importLoading = signal(false);
  readonly importResult = signal<any>(null);

  selRole: number | null = null;
  newYear = { name: '', startDate: '', endDate: '' };
  newCourse = { name: '' };
  newUser = { username: '', password: '', fullName: '', roleId: null as number | null };

  async ngOnInit(): Promise<void> {
    await this.loadAll();
  }

  async loadAll(): Promise<void> {
    const [years, courses, users, roles] = await Promise.all([
      firstValueFrom(this.http.get<AcademicYear[]>('/api/academic-years')),
      firstValueFrom(this.http.get<Course[]>('/api/courses')),
      firstValueFrom(this.http.get<User[]>('/api/users')),
      firstValueFrom(this.http.get<Role[]>('/api/roles')),
    ]);
    this.years.set(years); this.courses.set(courses);
    this.users.set(users); this.roles.set(roles);
  }

  async createYear(): Promise<void> {
    if (!this.newYear.name) return;
    await firstValueFrom(this.http.post('/api/academic-years', this.newYear));
    this.newYear = { name: '', startDate: '', endDate: '' };
    this.snack.open('Año lectivo creado', '', { duration: 2000 });
    await this.loadAll();
  }

  async deleteYear(id: number): Promise<void> {
    if (!confirm('¿Eliminar este año lectivo?')) return;
    await firstValueFrom(this.http.delete(`/api/academic-years/${id}`));
    await this.loadAll();
  }

  async createCourse(): Promise<void> {
    if (!this.newCourse.name) return;
    await firstValueFrom(this.http.post('/api/courses', this.newCourse));
    this.newCourse = { name: '' };
    this.snack.open('Curso creado', '', { duration: 2000 });
    await this.loadAll();
  }

  async deleteCourse(id: number): Promise<void> {
    if (!confirm('¿Eliminar este curso?')) return;
    await firstValueFrom(this.http.delete(`/api/courses/${id}`));
    await this.loadAll();
  }

  async createUser(): Promise<void> {
    if (!this.newUser.username || !this.newUser.password) return;
    await firstValueFrom(this.http.post('/api/users', this.newUser));
    this.newUser = { username: '', password: '', fullName: '', roleId: null };
    this.snack.open('Usuario creado', '', { duration: 2000 });
    await this.loadAll();
  }

  async deleteUser(id: number): Promise<void> {
    if (!confirm('¿Eliminar este usuario?')) return;
    await firstValueFrom(this.http.delete(`/api/users/${id}`));
    await this.loadAll();
  }

  async loadPermissions(): Promise<void> {
    if (!this.selRole) return;
    const data = await firstValueFrom(this.http.get<RolePermission[]>(`/api/role-permissions/${this.selRole}`));
    this.permissions.set(data);
  }

  async savePermissions(): Promise<void> {
    if (!this.selRole) return;
    await firstValueFrom(this.http.put(`/api/role-permissions/${this.selRole}`, this.permissions()));
    this.snack.open('Permisos guardados', '', { duration: 2000 });
  }

  async onRosterFile(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.importLoading.set(true);
    this.importResult.set(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await firstValueFrom(this.http.post<any>('/api/import/roster', fd));
      this.importResult.set(result);
      this.snack.open('Nómina importada correctamente', '', { duration: 3000 });
    } catch (err: any) {
      this.snack.open('Error: ' + (err?.error?.error ?? 'Error al importar'), '', { duration: 5000 });
    } finally {
      this.importLoading.set(false);
    }
  }
}
