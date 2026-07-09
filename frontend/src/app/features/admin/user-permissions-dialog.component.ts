import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { User, Course, RolePermission } from '../../core/models/index';
import { MODULE_TREE, ModuleNode } from '../../core/nav-items';
import { NotificationService } from '../../core/services/notification.service';
import { AcademicYearContextService } from '../../core/services/academic-year-context.service';

export interface UserPermissionsDialogData {
  user: User;
  courses: Course[];
}

interface FlatNode {
  node: ModuleNode;
  depth: number;
  parentKey: string | null;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatSelectModule, MatIconModule],
  styles: [`
    .perm-section {
      margin-bottom: 0;
      padding: 16px 0;
      border-bottom: 1px solid var(--border-soft);
    }
    .perm-section:last-child { border-bottom: none; padding-bottom: 0; }
    .section-label {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--muted-strong); margin-bottom: 10px;
    }
    .tree-row {
      display: flex; align-items: center; gap: 8px;
      padding: 3px 0; cursor: pointer; border-radius: 6px;
      user-select: none;
    }
    .tree-row:hover { background: var(--paper-deep); }
    .tree-child { padding-left: 24px; }
    .tree-label { font-size: 13px; line-height: 1.4; }
    .tree-label.parent { font-weight: 600; color: var(--ink-soft); }
    .tree-label.child { color: var(--muted-strong); }
    .access-all {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 20px; font-size: 12px;
      background: var(--accent-soft); color: var(--accent);
      cursor: pointer; border: none; font-weight: 600;
      margin-bottom: 10px;
    }
    .role-table { width: 100%; border-collapse: collapse; }
    .role-table th { font-size: 11px; font-weight: 700; color: var(--muted-strong); text-transform: uppercase; letter-spacing: .06em; padding: 4px 8px; text-align: left; }
    .role-table td { padding: 4px 8px; font-size: 13px; }
    .role-table tr:nth-child(even) td { background: var(--paper-deep); }
    .check-icon { font-size: 16px; width: 16px; height: 16px; }
  `],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">
      Permisos — {{data.user.fullName || data.user.username}}
    </h2>

    <mat-dialog-content style="min-width:520px;max-width:560px">

      <!-- Section 1: Module tree -->
      <div class="perm-section">
        <div class="section-label">Aplicaciones y opciones</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:12px;color:var(--muted)">
            Sin restricciones = acceso completo
          </span>
          <button type="button" class="access-all" (click)="clearAll()">
            <mat-icon style="font-size:14px;width:14px;height:14px">done_all</mat-icon>
            Acceso completo (sin restricciones)
          </button>
        </div>
        @for (item of flatNodes; track item.node.key) {
          <div class="tree-row" [class.tree-child]="item.depth > 0" (click)="toggle(item)">
            <mat-checkbox
              [checked]="isChecked(item.node.key)"
              [indeterminate]="isIndeterminate(item.node.key)"
              (change)="toggle(item)"
              (click)="$event.stopPropagation()">
            </mat-checkbox>
            <span class="tree-label" [class.parent]="item.depth === 0" [class.child]="item.depth > 0">
              {{item.node.label}}
            </span>
          </div>
        }
      </div>

      <!-- Section 2: Courses -->
      @if (yearContext.selected()) {
        <div class="perm-section">
          <div class="section-label">Cursos asignados — {{yearContext.selected()!.name}}</div>
          <mat-form-field appearance="outline" style="width:100%;margin:0" subscriptSizing="dynamic">
            <mat-label>{{selectedCourseIds().length ? selectedCourseIds().length + ' curso(s) asignado(s)' : 'Ve todos los cursos'}}</mat-label>
            <mat-select multiple [(ngModel)]="editableCourseIds">
              @for (c of data.courses; track c.id) {
                <mat-option [value]="c.id">{{c.name}}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
      }

      <!-- Section 3: Role permissions (read-only) -->
      @if (rolePermissions().length) {
        <div class="perm-section">
          <div class="section-label">Permisos del rol "{{data.user.roleName}}"</div>
          <p style="font-size:12px;color:var(--muted);margin-top:0;margin-bottom:8px">
            Solo referencia — editar en la pestaña <strong>Permisos</strong>.
          </p>
          <div style="max-height:160px;overflow-y:auto">
            <table class="role-table">
              <thead><tr>
                <th>Recurso</th>
                <th>Leer</th><th>Crear</th><th>Editar</th><th>Eliminar</th>
              </tr></thead>
              <tbody>
                @for (p of rolePermissions(); track p.resource) {
                  <tr>
                    <td>{{p.resource}}</td>
                    <td><mat-icon class="check-icon" [style.color]="p.canRead ? 'var(--accent)' : 'var(--border)'">{{p.canRead ? 'check' : 'remove'}}</mat-icon></td>
                    <td><mat-icon class="check-icon" [style.color]="p.canCreate ? 'var(--accent)' : 'var(--border)'">{{p.canCreate ? 'check' : 'remove'}}</mat-icon></td>
                    <td><mat-icon class="check-icon" [style.color]="p.canUpdate ? 'var(--accent)' : 'var(--border)'">{{p.canUpdate ? 'check' : 'remove'}}</mat-icon></td>
                    <td><mat-icon class="check-icon" [style.color]="p.canDelete ? 'var(--accent)' : 'var(--border)'">{{p.canDelete ? 'check' : 'remove'}}</mat-icon></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)">Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="saving()">
        Guardar permisos
      </button>
    </mat-dialog-actions>
  `,
})
export class UserPermissionsDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<UserPermissionsDialogComponent, boolean>);
  readonly data: UserPermissionsDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  readonly yearContext = inject(AcademicYearContextService);

  readonly saving = signal(false);
  readonly rolePermissions = signal<RolePermission[]>([]);

  // Set of checked module keys (empty = unrestricted)
  private checkedKeys = new Set<string>();
  readonly selectedCourseIds = signal<number[]>([]);
  editableCourseIds: number[] = [];

  readonly flatNodes: FlatNode[] = this.buildFlatNodes();

  private buildFlatNodes(): FlatNode[] {
    const result: FlatNode[] = [];
    for (const node of MODULE_TREE) {
      result.push({ node, depth: 0, parentKey: null });
      if (node.children) {
        for (const child of node.children) {
          result.push({ node: child, depth: 1, parentKey: node.key });
        }
      }
    }
    return result;
  }

  async ngOnInit(): Promise<void> {
    const keys = this.data.user.moduleKeys ?? [];
    this.checkedKeys = new Set(keys);

    const courseIds = this.data.user.courseIds ?? [];
    this.selectedCourseIds.set(courseIds);
    this.editableCourseIds = [...courseIds];

    if (this.data.user.roleId) {
      try {
        const perms = await firstValueFrom(
          this.http.get<RolePermission[]>(`/api/roles/permissions/${this.data.user.roleId}`)
        );
        this.rolePermissions.set(perms);
      } catch { /* not critical */ }
    }
  }

  isChecked(key: string): boolean {
    if (this.checkedKeys.size === 0) return false;
    return this.checkedKeys.has(key);
  }

  isIndeterminate(key: string): boolean {
    const node = MODULE_TREE.find(n => n.key === key);
    if (!node?.children) return false;
    const total = node.children.length;
    const checked = node.children.filter(c => this.checkedKeys.has(c.key)).length;
    return checked > 0 && checked < total;
  }

  toggle(item: FlatNode): void {
    const { node, depth, parentKey } = item;
    const isParent = depth === 0;

    if (this.checkedKeys.size === 0) {
      // Currently unrestricted: enabling any key means we're adding restrictions
      this.checkedKeys.add(node.key);
      if (isParent && node.children) {
        for (const child of node.children) this.checkedKeys.add(child.key);
      }
      if (!isParent && parentKey) this.ensureParentChecked(parentKey);
      return;
    }

    if (this.checkedKeys.has(node.key)) {
      this.checkedKeys.delete(node.key);
      if (isParent && node.children) {
        for (const child of node.children) this.checkedKeys.delete(child.key);
      }
    } else {
      this.checkedKeys.add(node.key);
      if (isParent && node.children) {
        for (const child of node.children) this.checkedKeys.add(child.key);
      }
      if (!isParent && parentKey) this.ensureParentChecked(parentKey);
    }
    // Force change detection
    this.checkedKeys = new Set(this.checkedKeys);
  }

  private ensureParentChecked(parentKey: string): void {
    this.checkedKeys.add(parentKey);
  }

  clearAll(): void {
    this.checkedKeys = new Set();
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const moduleKeys = [...this.checkedKeys];
      const yearId = this.yearContext.selectedId();

      const requests: Promise<unknown>[] = [
        firstValueFrom(this.http.put(`/api/users/${this.data.user.id}/modules`, { moduleKeys })),
      ];
      if (yearId) {
        requests.push(
          firstValueFrom(this.http.put(`/api/users/${this.data.user.id}/courses`, {
            academicYearId: yearId,
            courseIds: this.editableCourseIds,
          }))
        );
      }
      await Promise.all(requests);
      this.notify.success('Permisos guardados');
      this.dialogRef.close(true);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'Error al guardar permisos');
    } finally {
      this.saving.set(false);
    }
  }
}
