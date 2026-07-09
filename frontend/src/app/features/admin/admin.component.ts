import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import { AcademicYear, Course, User, Role, RolePermission, Institution } from '../../core/models/index';
import { AuthService } from '../../core/services/auth.service';
import { InstitutionContextService } from '../../core/services/institution-context.service';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { InstitutionDialogComponent } from './institution-dialog.component';
import { AcademicYearDialogComponent } from './academic-year-dialog.component';
import { CourseDialogComponent } from './course-dialog.component';
import { UserDialogComponent } from './user-dialog.component';
import { UserPermissionsDialogComponent } from './user-permissions-dialog.component';
import { RoleDialogComponent } from './role-dialog.component';
import { MODULE_KEYS } from '../../core/nav-items';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatSelectModule,
            MatInputModule, MatButtonModule, MatIconModule, MatCheckboxModule],
  styles: [`
    .tab-content { padding: 20px; }
    .admin-row {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 12px 16px; background: var(--paper); border-radius: 12px; border: 1px solid var(--border);
      margin-bottom: 8px;
    }
    .admin-row-actions { display: flex; align-items: center; gap: 8px; }
    @media (max-width: 1280px) {
      .admin-row { flex-direction: column; align-items: flex-start; }
      .admin-row-actions { flex-wrap: wrap; width: 100%; }
    }
    .user-avatar {
      width: 36px; height: 36px; border-radius: 9px;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: white; display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 700; flex-shrink: 0;
    }
    .hidden-mobile { display: block; }
    .hidden-desktop { display: none; }
    @media (max-width: 768px) {
      .hidden-mobile { display: none; }
      .hidden-desktop { display: block; }
    }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Administración</h1>
      @if (auth.isSuperAdmin()) {
        <button mat-stroked-button (click)="openQueueMonitor()"
          style="display:flex;align-items:center;gap:6px;font-size:13px">
          <mat-icon style="font-size:16px;width:16px;height:16px">monitor_heart</mat-icon>
          Monitor de colas
        </button>
      }
    </div>

    <div style="background:var(--paper);border-radius:16px;border:1px solid var(--border);overflow:hidden;min-height:400px">

      <!-- INSTITUCIONES (solo superadmin) -->
      @if (activeTab() === 'institutions' && auth.isSuperAdmin()) {
        <div class="tab-content">
          <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
            <button mat-flat-button color="primary" (click)="openInstitutionDialog()">
              <mat-icon>add</mat-icon> Agregar institución
            </button>
          </div>
          @for (inst of institutionContext.institutions(); track inst.id) {
            <div class="admin-row">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:40px;height:40px;border-radius:10px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                  @if (inst.logoUrl) {
                    <img [src]="inst.logoUrl" alt="" style="width:100%;height:100%;object-fit:cover">
                  } @else {
                    <mat-icon style="color:var(--accent)">corporate_fare</mat-icon>
                  }
                </div>
                <div style="font-weight:600">{{inst.name}}</div>
              </div>
              <div class="admin-row-actions">
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
      }

      <!-- AÑOS LECTIVOS -->
      @if (activeTab() === 'years') {
        <div class="tab-content">
          <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
            <button mat-flat-button color="primary" (click)="openYearDialog()">
              <mat-icon>add</mat-icon> Agregar año lectivo
            </button>
          </div>
          @for (y of years(); track y.id) {
            <div class="admin-row">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:40px;height:40px;border-radius:10px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center">
                  <mat-icon style="color:var(--accent)">calendar_today</mat-icon>
                </div>
                <div>
                  <div style="font-weight:600">{{y.name}}</div>
                  <div style="font-size:12px;color:var(--muted)">{{y.startDate ?? '—'}} → {{y.endDate ?? '—'}}</div>
                </div>
              </div>
              <div class="admin-row-actions">
                <span [class]="y.isActive ? 'badge-J' : 'badge-gray'">{{y.isActive ? 'Activo' : 'Inactivo'}}</span>
                @if (!y.isActive) {
                  <button mat-icon-button style="color:var(--accent)" title="Marcar como año activo" (click)="activateYear(y.id)"><mat-icon>check_circle</mat-icon></button>
                }
                <button mat-icon-button style="color:var(--muted-strong)" (click)="openYearDialog(y)"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button style="color:#b91c1c" (click)="deleteYear(y.id)"><mat-icon>delete_outline</mat-icon></button>
              </div>
            </div>
          }
        </div>
      }

      <!-- CURSOS -->
      @if (activeTab() === 'courses') {
        <div class="tab-content">
          <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
            <button mat-flat-button color="primary" (click)="openCourseDialog()">
              <mat-icon>add</mat-icon> Agregar curso
            </button>
          </div>
          <div class="data-table-wrap hidden md:block">
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
          <div class="md:hidden">
            @for (c of courses(); track c.id) {
              <div class="admin-row">
                <div>
                  <div style="font-weight:600">{{c.name}}</div>
                  <span class="badge-info" style="margin-top:4px;display:inline-block">{{c.shift}}</span>
                </div>
                <div class="admin-row-actions">
                  <button mat-icon-button style="color:var(--muted-strong)" (click)="openCourseDialog(c)"><mat-icon>edit</mat-icon></button>
                  <button mat-icon-button style="color:#b91c1c" (click)="deleteCourse(c.id)"><mat-icon>delete_outline</mat-icon></button>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- USUARIOS -->
      @if (activeTab() === 'users') {
        <div class="tab-content">
          <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
            <button mat-flat-button color="primary" (click)="openUserDialog()">
              <mat-icon>person_add</mat-icon> Nuevo usuario
            </button>
          </div>

          <!-- Desktop table -->
          <div class="data-table-wrap hidden-mobile">
            <table class="data-table">
              <thead><tr>
                <th>#</th>
                <th>Usuario</th>
                <th>Cuenta</th>
                <th>Firma</th>
                <th></th>
              </tr></thead>
              <tbody>
                @for (u of users(); track u.id; let i = $index) {
                  <tr>
                    <td style="color:var(--muted);width:36px">{{i+1}}</td>
                    <td>
                      <div style="display:flex;align-items:center;gap:10px">
                        <div class="user-avatar">{{(u.fullName || u.username)[0].toUpperCase()}}</div>
                        <div>
                          <div style="font-weight:600">{{u.fullName || u.username}}</div>
                          <div style="font-size:12px;color:var(--muted)">
                            @if (u.moduleKeys?.length) { <span class="badge-gray" style="margin-right:4px">Acceso limitado</span> }
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style="font-size:13px;color:var(--muted)">@{{u.username}}</div>
                      <span style="font-size:12px;color:var(--accent);font-weight:600">{{u.roleName}}</span>
                    </td>
                    <td style="font-size:12px;color:var(--muted-strong)">
                      @if (u.title || u.signatureLabel) {
                        <div style="line-height:1.5">
                          @if (u.title || u.fullName) {
                            <div>{{[u.title, u.fullName].filter(Boolean).join(' ')}}</div>
                          }
                          @if (u.signatureLabel) {
                            <div style="color:var(--muted)">{{u.signatureLabel}}</div>
                          }
                        </div>
                      } @else {
                        <span style="color:var(--border)">—</span>
                      }
                    </td>
                    <td>
                      <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end">
                        @if (u.roleName !== 'superadmin') {
                          <button mat-icon-button style="color:var(--muted-strong)" title="Editar usuario" (click)="openUserDialog(u)"><mat-icon>edit</mat-icon></button>
                          <button mat-icon-button style="color:var(--accent)" title="Configurar permisos" (click)="openPermissionsDialog(u)"><mat-icon>manage_accounts</mat-icon></button>
                        }
                        <button mat-icon-button style="color:#b91c1c" title="Eliminar" (click)="deleteUser(u.id)"><mat-icon>delete_outline</mat-icon></button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Mobile cards -->
          <div class="hidden-desktop">
            @for (u of users(); track u.id) {
              <div class="admin-row">
                <div style="display:flex;align-items:center;gap:12px">
                  <div class="user-avatar">{{(u.fullName || u.username)[0].toUpperCase()}}</div>
                  <div>
                    <div style="font-weight:600">{{u.fullName || u.username}}</div>
                    <div style="font-size:12px;color:var(--muted)">@{{u.username}} · <span style="color:var(--accent)">{{u.roleName}}</span></div>
                    @if (u.signatureLabel) {
                      <div style="font-size:11px;color:var(--muted)">{{u.signatureLabel}}</div>
                    }
                  </div>
                </div>
                <div class="admin-row-actions">
                  @if (u.roleName !== 'superadmin') {
                    <button mat-icon-button style="color:var(--muted-strong)" (click)="openUserDialog(u)"><mat-icon>edit</mat-icon></button>
                    <button mat-icon-button style="color:var(--accent)" (click)="openPermissionsDialog(u)"><mat-icon>manage_accounts</mat-icon></button>
                  }
                  <button mat-icon-button style="color:#b91c1c" (click)="deleteUser(u.id)"><mat-icon>delete_outline</mat-icon></button>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- PERMISOS -->
      @if (activeTab() === 'permissions') {
        <div class="tab-content">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:200px;margin:0">
              <mat-label>Rol</mat-label>
              <mat-select [(ngModel)]="selRole" (ngModelChange)="loadPermissions()">
                @for (r of roles(); track r.id) { <mat-option [value]="r.id">{{r.name}}</mat-option> }
              </mat-select>
            </mat-form-field>
            @if (selectedRole()) {
              <button mat-icon-button style="color:var(--muted-strong)" (click)="openRoleDialog(selectedRole()!)"><mat-icon>edit</mat-icon></button>
            }
            <button mat-stroked-button color="primary" (click)="openRoleDialog()">
              <mat-icon>add</mat-icon> Agregar rol
            </button>
          </div>
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
      }

      <!-- IMPORTAR NÓMINA -->
      @if (activeTab() === 'roster') {
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
                  <div style="font-family:'Nunito',sans-serif;font-size:20px;font-weight:600;color:var(--ink)">{{importResult()!.coursesProcessed}}</div>
                  <div style="font-size:12px;color:var(--muted-strong)">Cursos procesados</div>
                </div>
                <div style="background:var(--paper);border-radius:8px;padding:10px 14px">
                  <div style="font-family:'Nunito',sans-serif;font-size:20px;font-weight:600;color:var(--ink)">{{importResult()!.studentsCreated}}</div>
                  <div style="font-size:12px;color:var(--muted-strong)">Estudiantes creados</div>
                </div>
                <div style="background:var(--paper);border-radius:8px;padding:10px 14px">
                  <div style="font-family:'Nunito',sans-serif;font-size:20px;font-weight:600;color:var(--ink)">{{importResult()!.studentsUpdated}}</div>
                  <div style="font-size:12px;color:var(--muted-strong)">Actualizados</div>
                </div>
                <div style="background:var(--paper);border-radius:8px;padding:10px 14px">
                  <div style="font-family:'Nunito',sans-serif;font-size:20px;font-weight:600;color:var(--ink)">{{importResult()!.enrollmentsCreated}}</div>
                  <div style="font-size:12px;color:var(--muted-strong)">Matrículas creadas</div>
                </div>
                <div style="background:var(--paper);border-radius:8px;padding:10px 14px">
                  <div style="font-family:'Nunito',sans-serif;font-size:20px;font-weight:600;color:var(--ink)">{{importResult()!.enrollmentsUpdated}}</div>
                  <div style="font-size:12px;color:var(--muted-strong)">Matrículas actualizadas</div>
                </div>
                <div style="background:var(--paper);border-radius:8px;padding:10px 14px">
                  <div style="font-family:'Nunito',sans-serif;font-size:20px;font-weight:600;color:var(--ink)">{{importResult()!.guardiansUpdated}}</div>
                  <div style="font-size:12px;color:var(--muted-strong)">Representantes actualizados</div>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class AdminComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly institutionContext = inject(InstitutionContextService);
  readonly academicYearContext = inject(AcademicYearContextService);

  readonly years = this.academicYearContext.years;
  readonly courses = signal<Course[]>([]);
  readonly users = signal<User[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly permissions = signal<RolePermission[]>([]);
  readonly importLoading = signal(false);
  readonly importResult = signal<any>(null);

  selRole: number | null = null;

  readonly activeTab = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('tab') ?? 'users')),
    { initialValue: this.route.snapshot.queryParamMap.get('tab') ?? 'users' }
  );

  readonly moduleKeys = MODULE_KEYS;

  async openQueueMonitor(): Promise<void> {
    await firstValueFrom(this.http.post('/api/admin/queues-session', {}));
    window.open('/api/admin/queues', '_blank');
  }

  async ngOnInit(): Promise<void> {
    // Default to users tab if no tab param in URL
    if (!this.route.snapshot.queryParamMap.get('tab')) {
      await this.router.navigate([], { queryParams: { tab: 'users' }, replaceUrl: true });
    }
    // For a superadmin, an institution must be selected before any
    // institution-scoped endpoint below will succeed — load/auto-select
    // first. A brand-new superadmin with zero institutions yet simply gets
    // empty lists below until they create one in the Instituciones tab.
    if (this.auth.isSuperAdmin()) await this.institutionContext.loadInstitutions();
    await this.loadAll();
  }

  async loadAll(): Promise<void> {
    const noInstitutionYet = this.auth.isSuperAdmin() && this.institutionContext.selectedId() === null;
    // Re-fetched here (not just relying on layout's initial load) because
    // this is the screen that creates/activates/edits academic years —
    // other tabs only ever read this context, this one mutates it.
    if (!noInstitutionYet) await this.academicYearContext.load();
    const yearId = this.academicYearContext.selectedId();
    const usersUrl = yearId ? `/api/users?academic_year_id=${yearId}` : '/api/users';
    const [courses, users, roles] = await Promise.all([
      noInstitutionYet ? Promise.resolve([]) : firstValueFrom(this.http.get<Course[]>('/api/courses')).catch(() => []),
      noInstitutionYet ? Promise.resolve([]) : firstValueFrom(this.http.get<User[]>(usersUrl)).catch(() => []),
      firstValueFrom(this.http.get<Role[]>('/api/roles')),
    ]);
    this.courses.set(courses);
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

  async activateYear(id: number): Promise<void> {
    await firstValueFrom(this.http.put(`/api/academic-years/${id}`, { isActive: true }));
    this.notify.success('Año lectivo activado');
    await this.loadAll();
  }

  deleteYear(id: number): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Eliminar año lectivo', message: '¿Eliminar este año lectivo? También se eliminarán las matrículas, faltas y justificaciones asociadas a él. Esta acción no se puede deshacer.' },
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
      data: { title: 'Eliminar curso', message: '¿Eliminar este curso? También se eliminarán las matrículas, faltas y justificaciones asociadas a él. Esta acción no se puede deshacer.' },
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

  openPermissionsDialog(user: User): void {
    this.dialog.open(UserPermissionsDialogComponent, {
      width: '580px',
      maxHeight: '90vh',
      data: { user, courses: this.courses() },
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
    this.notify.success('Logo actualizado');
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
    const academicYearId = this.academicYearContext.selectedId();
    if (!academicYearId) return;
    await firstValueFrom(this.http.put(`/api/users/${userId}/courses`, { academicYearId, courseIds }));
    this.notify.success('Cursos actualizados');
    await this.loadAll();
  }

  async updateUserModules(userId: number, moduleKeys: string[]): Promise<void> {
    await firstValueFrom(this.http.put(`/api/users/${userId}/modules`, { moduleKeys }));
    this.notify.success('Módulos actualizados');
    await this.loadAll();
  }

  readonly selectedRole = () => this.roles().find(r => r.id === this.selRole) ?? null;

  openRoleDialog(role?: Role): void {
    this.dialog.open(RoleDialogComponent, {
      width: '420px',
      data: { mode: role ? 'edit' : 'create', role },
    }).afterClosed().subscribe(async result => {
      if (!result) return;
      await this.loadAll();
      this.selRole = result.id;
      await this.loadPermissions();
    });
  }

  async loadPermissions(): Promise<void> {
    if (!this.selRole) return;
    const data = await firstValueFrom(this.http.get<RolePermission[]>(`/api/roles/permissions/${this.selRole}`));
    this.permissions.set(data);
  }

  async savePermissions(): Promise<void> {
    if (!this.selRole) return;
    await firstValueFrom(this.http.put(`/api/roles/permissions/${this.selRole}`, this.permissions()));
    this.notify.success('Permisos guardados');
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
      this.notify.success('Nómina importada correctamente', { duration: 3000 });
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'Error al importar', { duration: 5000 });
    } finally { this.importLoading.set(false); }
  }
}
