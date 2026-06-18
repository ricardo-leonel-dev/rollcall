import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AcademicYear, Course, User, Role, RolePermission, Institution } from '../../core/models/index';
import { AuthService } from '../../core/services/auth.service';
import { InstitutionContextService } from '../../core/services/institution-context.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { InstitutionDialogComponent } from './institution-dialog.component';
import { AcademicYearDialogComponent } from './academic-year-dialog.component';
import { CourseDialogComponent } from './course-dialog.component';
import { UserDialogComponent } from './user-dialog.component';
import { NAV_ITEMS } from '../../core/nav-items';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTabsModule, MatFormFieldModule, MatSelectModule,
            MatInputModule, MatButtonModule, MatIconModule, MatCheckboxModule, MatSnackBarModule],
  styles: [`
    .tab-content { padding: 20px; }
    .list-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; background: var(--paper); border-radius: 12px; border: 1px solid var(--border);
      margin-bottom: 8px;
    }
    .user-avatar {
      width: 36px; height: 36px; border-radius: 9px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white; display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 700; flex-shrink: 0;
    }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Administración</h1>
    </div>

    <mat-tab-group style="background:var(--paper);border-radius:16px;border:1px solid var(--border);overflow:hidden">

      <!-- INSTITUCIONES (solo superadmin) -->
      @if (auth.isSuperAdmin()) {
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">corporate_fare</mat-icon>
            Instituciones
          </ng-template>
          <div class="tab-content">
            <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
              <button mat-flat-button color="primary" (click)="openInstitutionDialog()">
                <mat-icon>add</mat-icon> Agregar institución
              </button>
            </div>
            @for (inst of institutionContext.institutions(); track inst.id) {
              <div class="list-item">
                <div style="display:flex;align-items:center;gap:12px">
                  <div style="width:40px;height:40px;border-radius:10px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                    @if (inst.logoUrl) {
                      <img [src]="inst.logoUrl" alt="" style="width:100%;height:100%;object-fit:cover">
                    } @else {
                      <mat-icon style="color:#4f46e5">corporate_fare</mat-icon>
                    }
                  </div>
                  <div style="font-weight:600">{{inst.name}}</div>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                  <button mat-icon-button style="color:var(--muted-strong)" (click)="openInstitutionDialog(inst)"><mat-icon>edit</mat-icon></button>
                  <input type="color" title="Color primario" [value]="inst.primaryColor || '#6366f1'"
                         (change)="updateInstitutionColor(inst, 'primaryColor', $any($event.target).value)"
                         style="width:28px;height:28px;border:none;border-radius:6px;cursor:pointer;background:none">
                  <input type="color" title="Color secundario" [value]="inst.secondaryColor || '#8b5cf6'"
                         (change)="updateInstitutionColor(inst, 'secondaryColor', $any($event.target).value)"
                         style="width:28px;height:28px;border:none;border-radius:6px;cursor:pointer;background:none">
                  <input #logoInput type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden
                         (change)="uploadInstitutionLogo(inst.id, $event)">
                  <button mat-icon-button title="Subir logo" (click)="logoInput.click()"><mat-icon>image</mat-icon></button>
                  <span [class]="inst.isActive ? 'badge-J' : 'badge-gray'">{{inst.isActive ? 'Activa' : 'Inactiva'}}</span>
                  <button mat-icon-button style="color:#b91c1c" (click)="deactivateInstitution(inst.id)"><mat-icon>delete_outline</mat-icon></button>
                </div>
              </div>
            }
          </div>
        </mat-tab>
      }

      <!-- AÑOS LECTIVOS -->
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">calendar_today</mat-icon>
          Años Lectivos
        </ng-template>
        <div class="tab-content">
          <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
            <button mat-flat-button color="primary" (click)="openYearDialog()">
              <mat-icon>add</mat-icon> Agregar año lectivo
            </button>
          </div>
          @for (y of years(); track y.id) {
            <div class="list-item">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:40px;height:40px;border-radius:10px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center">
                  <mat-icon style="color:#4f46e5">calendar_today</mat-icon>
                </div>
                <div>
                  <div style="font-weight:600">{{y.name}}</div>
                  <div style="font-size:12px;color:var(--muted)">{{y.startDate ?? '—'}} → {{y.endDate ?? '—'}}</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <span [class]="y.isActive ? 'badge-J' : 'badge-gray'">{{y.isActive ? 'Activo' : 'Inactivo'}}</span>
                <button mat-icon-button style="color:var(--muted-strong)" (click)="openYearDialog(y)"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button style="color:#b91c1c" (click)="deleteYear(y.id)"><mat-icon>delete_outline</mat-icon></button>
              </div>
            </div>
          }
        </div>
      </mat-tab>

      <!-- CURSOS -->
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">class</mat-icon>
          Cursos
        </ng-template>
        <div class="tab-content">
          <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
            <button mat-flat-button color="primary" (click)="openCourseDialog()">
              <mat-icon>add</mat-icon> Agregar curso
            </button>
          </div>
          <div class="data-table-wrap">
            <table class="data-table">
              <thead><tr><th>#</th><th>Nombre del curso</th><th>Jornada</th><th></th></tr></thead>
              <tbody>
                @for (c of courses(); track c.id; let i = $index) {
                  <tr>
                    <td style="color:var(--muted);width:36px">{{i+1}}</td>
                    <td style="font-weight:500">{{c.name}}</td>
                    <td><span class="badge-info">{{c.shift}}</span></td>
                    <td>
                      <button mat-icon-button style="color:var(--muted-strong)" (click)="openCourseDialog(c)"><mat-icon>edit</mat-icon></button>
                      <button mat-icon-button style="color:#b91c1c" (click)="deleteCourse(c.id)"><mat-icon>delete_outline</mat-icon></button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </mat-tab>

      <!-- USUARIOS -->
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">manage_accounts</mat-icon>
          Usuarios
        </ng-template>
        <div class="tab-content">
          <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
            <button mat-flat-button color="primary" (click)="openUserDialog()">
              <mat-icon>person_add</mat-icon> Nuevo usuario
            </button>
          </div>
          @for (u of users(); track u.id) {
            <div class="list-item" style="flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:12px">
                <div class="user-avatar">{{(u.fullName || u.username)[0].toUpperCase()}}</div>
                <div>
                  <div style="font-weight:600">{{u.fullName || u.username}}</div>
                  <div style="font-size:12px;color:var(--muted)">@{{u.username}} · <span style="color:#4f46e5">{{u.roleName}}</span></div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                @if (u.roleName !== 'superadmin') {
                  <button mat-icon-button style="color:var(--muted-strong)" (click)="openUserDialog(u)"><mat-icon>edit</mat-icon></button>
                  <mat-form-field appearance="outline" style="width:240px;margin:0">
                    <mat-label>{{u.courseIds?.length ? 'Cursos asignados' : 'Ve todos los cursos'}}</mat-label>
                    <mat-select multiple [(ngModel)]="u.courseIds" (closed)="updateUserCourses(u.id, u.courseIds ?? [])">
                      @for (c of courses(); track c.id) { <mat-option [value]="c.id">{{c.name}}</mat-option> }
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline" style="width:240px;margin:0">
                    <mat-label>{{u.moduleKeys?.length ? 'Acceso limitado' : 'Acceso a todo'}}</mat-label>
                    <mat-select multiple [(ngModel)]="u.moduleKeys" (closed)="updateUserModules(u.id, u.moduleKeys ?? [])">
                      @for (n of navItems; track n.key) { <mat-option [value]="n.key">{{n.label}}</mat-option> }
                    </mat-select>
                  </mat-form-field>
                }
                <button mat-icon-button style="color:#b91c1c" (click)="deleteUser(u.id)"><mat-icon>delete_outline</mat-icon></button>
              </div>
            </div>
          }
        </div>
      </mat-tab>

      <!-- PERMISOS -->
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">security</mat-icon>
          Permisos
        </ng-template>
        <div class="tab-content">
          <mat-form-field appearance="outline" style="width:200px;margin-bottom:16px">
            <mat-label>Rol</mat-label>
            <mat-select [(ngModel)]="selRole" (ngModelChange)="loadPermissions()">
              @for (r of roles(); track r.id) { <mat-option [value]="r.id">{{r.name}}</mat-option> }
            </mat-select>
          </mat-form-field>
          @if (permissions().length) {
            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Recurso</th>
                    <th style="text-align:center">Leer</th>
                    <th style="text-align:center">Crear</th>
                    <th style="text-align:center">Editar</th>
                    <th style="text-align:center">Eliminar</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of permissions(); track p.resource) {
                    <tr>
                      <td style="font-weight:500">{{p.resource}}</td>
                      <td style="text-align:center"><mat-checkbox [(ngModel)]="p.canRead" /></td>
                      <td style="text-align:center"><mat-checkbox [(ngModel)]="p.canCreate" /></td>
                      <td style="text-align:center"><mat-checkbox [(ngModel)]="p.canUpdate" /></td>
                      <td style="text-align:center"><mat-checkbox [(ngModel)]="p.canDelete" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <button mat-flat-button color="primary" style="margin-top:16px" (click)="savePermissions()">
              <mat-icon>save</mat-icon> Guardar permisos
            </button>
          }
        </div>
      </mat-tab>

      <!-- IMPORTAR NÓMINA -->
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon style="margin-right:6px;font-size:18px;width:18px;height:18px">upload_file</mat-icon>
          Importar Nómina
        </ng-template>
        <div class="tab-content">
          <p style="color:var(--muted-strong);font-size:14px;margin-bottom:20px">
            Sube el archivo Excel de nómina. Cada hoja = un curso. Fila 6 = encabezados, fila 7+ = estudiantes.
          </p>
          <div class="upload-zone">
            <label style="cursor:pointer;display:block">
              <input type="file" style="display:none" accept=".xlsx,.xls" (change)="onRosterFile($event)">
              <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--border);margin-bottom:12px;display:block;margin-left:auto;margin-right:auto">cloud_upload</mat-icon>
              <div style="font-weight:600;color:var(--ink-soft);margin-bottom:4px">Haz clic para seleccionar el archivo Excel</div>
              <div style="font-size:13px;color:var(--muted)">Formatos: .xlsx, .xls</div>
            </label>
          </div>

          @if (importLoading()) {
            <div style="display:flex;align-items:center;gap:16px;padding:20px;background:var(--paper-deep);border-radius:12px;margin-top:16px">
              <div class="spinner" style="flex-shrink:0"></div>
              <div style="font-weight:600;color:var(--ink-soft)">Procesando nómina...</div>
            </div>
          }

          @if (importResult()) {
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:20px;margin-top:16px">
              <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#15803d;margin-bottom:12px">
                <mat-icon>check_circle</mat-icon> Importación completada
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div style="background:var(--paper);border-radius:8px;padding:10px 14px">
                  <div style="font-family:'Fraunces',serif;font-size:20px;font-weight:600;color:var(--ink)">{{importResult()!.coursesProcessed}}</div>
                  <div style="font-size:12px;color:var(--muted-strong)">Cursos procesados</div>
                </div>
                <div style="background:var(--paper);border-radius:8px;padding:10px 14px">
                  <div style="font-family:'Fraunces',serif;font-size:20px;font-weight:600;color:var(--ink)">{{importResult()!.studentsCreated}}</div>
                  <div style="font-size:12px;color:var(--muted-strong)">Estudiantes creados</div>
                </div>
                <div style="background:var(--paper);border-radius:8px;padding:10px 14px">
                  <div style="font-family:'Fraunces',serif;font-size:20px;font-weight:600;color:var(--ink)">{{importResult()!.studentsUpdated}}</div>
                  <div style="font-size:12px;color:var(--muted-strong)">Actualizados</div>
                </div>
                <div style="background:var(--paper);border-radius:8px;padding:10px 14px">
                  <div style="font-family:'Fraunces',serif;font-size:20px;font-weight:600;color:var(--ink)">{{importResult()!.enrollmentsCreated}}</div>
                  <div style="font-size:12px;color:var(--muted-strong)">Matrículas creadas</div>
                </div>
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
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);
  readonly institutionContext = inject(InstitutionContextService);

  readonly years = signal<AcademicYear[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly users = signal<User[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly permissions = signal<RolePermission[]>([]);
  readonly importLoading = signal(false);
  readonly importResult = signal<any>(null);

  selRole: number | null = null;

  async ngOnInit(): Promise<void> {
    // For a superadmin, an institution must be selected before any
    // institution-scoped endpoint below will succeed — load/auto-select
    // first. A brand-new superadmin with zero institutions yet simply gets
    // empty lists below until they create one in the Instituciones tab.
    if (this.auth.isSuperAdmin()) await this.institutionContext.loadInstitutions();
    await this.loadAll();
  }

  async loadAll(): Promise<void> {
    const noInstitutionYet = this.auth.isSuperAdmin() && this.institutionContext.selectedId() === null;
    const [years, courses, users, roles] = await Promise.all([
      noInstitutionYet ? Promise.resolve([]) : firstValueFrom(this.http.get<AcademicYear[]>('/api/academic-years')).catch(() => []),
      noInstitutionYet ? Promise.resolve([]) : firstValueFrom(this.http.get<Course[]>('/api/courses')).catch(() => []),
      noInstitutionYet ? Promise.resolve([]) : firstValueFrom(this.http.get<User[]>('/api/users')).catch(() => []),
      firstValueFrom(this.http.get<Role[]>('/api/roles')),
    ]);
    this.years.set(years); this.courses.set(courses);
    this.users.set(users); this.roles.set(roles);
  }

  openYearDialog(year?: AcademicYear): void {
    this.dialog.open(AcademicYearDialogComponent, {
      width: '420px',
      data: { mode: year ? 'edit' : 'create', year },
    }).afterClosed().subscribe(async ok => {
      if (ok) await this.loadAll();
    });
  }

  deleteYear(id: number): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar año lectivo', message: '¿Eliminar este año lectivo? Esta acción no se puede deshacer.' },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await firstValueFrom(this.http.delete(`/api/academic-years/${id}`));
      await this.loadAll();
    });
  }

  openCourseDialog(course?: Course): void {
    this.dialog.open(CourseDialogComponent, {
      width: '420px',
      data: { mode: course ? 'edit' : 'create', course },
    }).afterClosed().subscribe(async ok => {
      if (ok) await this.loadAll();
    });
  }

  deleteCourse(id: number): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar curso', message: '¿Eliminar este curso? Esta acción no se puede deshacer.' },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await firstValueFrom(this.http.delete(`/api/courses/${id}`));
      await this.loadAll();
    });
  }

  openUserDialog(user?: User): void {
    this.dialog.open(UserDialogComponent, {
      width: '460px',
      data: { mode: user ? 'edit' : 'create', user, roles: this.roles(), institutions: this.institutionContext.institutions() },
    }).afterClosed().subscribe(async ok => {
      if (ok) await this.loadAll();
    });
  }

  openInstitutionDialog(institution?: Institution): void {
    this.dialog.open(InstitutionDialogComponent, {
      width: '420px',
      data: { mode: institution ? 'edit' : 'create', institution },
    }).afterClosed().subscribe(async ok => {
      if (ok) await this.institutionContext.loadInstitutions();
    });
  }

  deactivateInstitution(id: number): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Desactivar institución', message: '¿Desactivar esta institución? Dejará de aparecer como opción seleccionable.', confirmLabel: 'Desactivar', icon: 'corporate_fare' },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await firstValueFrom(this.http.delete(`/api/institutions/${id}`));
      await this.institutionContext.loadInstitutions();
    });
  }

  async updateInstitutionColor(inst: Institution, field: 'primaryColor' | 'secondaryColor', value: string): Promise<void> {
    await firstValueFrom(this.http.put(`/api/institutions/${inst.id}`, { [field]: value }));
    await this.institutionContext.loadInstitutions();
  }

  async uploadInstitutionLogo(id: number, event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('logo', file);
    await firstValueFrom(this.http.post(`/api/institutions/${id}/logo/upload`, formData));
    await this.institutionContext.loadInstitutions();
    this.snack.open('Logo actualizado', '', { duration: 2000 });
  }

  deleteUser(id: number): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar usuario', message: '¿Eliminar este usuario? Esta acción no se puede deshacer.' },
    }).afterClosed().subscribe(async ok => {
      if (!ok) return;
      await firstValueFrom(this.http.delete(`/api/users/${id}`));
      await this.loadAll();
    });
  }

  async updateUserCourses(userId: number, courseIds: number[]): Promise<void> {
    await firstValueFrom(this.http.put(`/api/users/${userId}/courses`, { courseIds }));
    this.snack.open('Cursos actualizados', '', { duration: 2000 });
    await this.loadAll();
  }

  readonly navItems = NAV_ITEMS;

  async updateUserModules(userId: number, moduleKeys: string[]): Promise<void> {
    await firstValueFrom(this.http.put(`/api/users/${userId}/modules`, { moduleKeys }));
    this.snack.open('Módulos actualizados', '', { duration: 2000 });
    await this.loadAll();
  }

  async loadPermissions(): Promise<void> {
    if (!this.selRole) return;
    const data = await firstValueFrom(this.http.get<RolePermission[]>(`/api/roles/permissions/${this.selRole}`));
    this.permissions.set(data);
  }

  async savePermissions(): Promise<void> {
    if (!this.selRole) return;
    await firstValueFrom(this.http.put(`/api/roles/permissions/${this.selRole}`, this.permissions()));
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
    } finally { this.importLoading.set(false); }
  }
}
