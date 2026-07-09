import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';
import { User, Role, Institution } from '../../core/models/index';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

export interface UserDialogData {
  mode: 'create' | 'edit';
  user?: User;
  roles: Role[];
  institutions: Institution[];
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  styles: [`
    .sig-preview {
      display: inline-flex; flex-direction: column; gap: 2px;
      background: var(--paper-deep); border: 1px solid var(--border-soft);
      border-radius: 10px; padding: 8px 14px; font-size: 12px;
      color: var(--muted-strong); margin-top: 4px; margin-bottom: 8px; line-height: 1.6;
    }
    .sig-preview strong { color: var(--ink-soft); }
  `],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">{{data.mode === 'edit' ? 'Editar usuario' : 'Nuevo usuario'}}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" style="width:100%;margin-top:4px">
        <mat-label>Usuario</mat-label>
        <input matInput [(ngModel)]="username" [disabled]="data.mode === 'edit'">
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>{{data.mode === 'edit' ? 'Nueva contraseña (dejar en blanco para no cambiar)' : 'Contraseña'}}</mat-label>
        <input matInput type="password" [(ngModel)]="password">
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Nombre completo</mat-label>
        <input matInput [(ngModel)]="fullName">
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Email</mat-label>
        <input matInput type="email" [(ngModel)]="email">
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Rol</mat-label>
        <mat-select [(ngModel)]="roleId">
          @for (r of data.roles; track r.id) { <mat-option [value]="r.id">{{r.name}}</mat-option> }
        </mat-select>
      </mat-form-field>
      @if (auth.isSuperAdmin() && data.mode === 'create') {
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Institución</mat-label>
          <mat-select [(ngModel)]="institutionId">
            @for (inst of data.institutions; track inst.id) { <mat-option [value]="inst.id">{{inst.name}}</mat-option> }
          </mat-select>
        </mat-form-field>
      }

      <div style="display:flex;gap:8px;margin-top:8px">
        <mat-form-field appearance="outline" style="width:30%">
          <mat-label>Título</mat-label>
          <input matInput [(ngModel)]="title" placeholder="Ing., Lcda., Dr.">
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:70%">
          <mat-label>Cargo para firmas en reportes</mat-label>
          <input matInput [(ngModel)]="signatureLabel" placeholder="INSPECTOR PISO 1, INSPECTOR GENERAL…">
        </mat-form-field>
      </div>
      @if (title || signatureLabel || fullName) {
        <div class="sig-preview">
          <strong>{{[title, fullName || username].filter(Boolean).join(' ')}}</strong>
          @if (signatureLabel) { <span>{{signatureLabel}}</span> }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)">Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!canSave() || saving()">
        {{data.mode === 'edit' ? 'Guardar' : 'Crear'}}
      </button>
    </mat-dialog-actions>
  `,
})
export class UserDialogComponent {
  readonly dialogRef = inject(MatDialogRef<UserDialogComponent, boolean>);
  readonly data: UserDialogData = inject(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  readonly auth = inject(AuthService);

  username = this.data.user?.username ?? '';
  password = '';
  fullName = this.data.user?.fullName ?? '';
  email = this.data.user?.email ?? '';
  roleId: number | null = this.data.user?.roleId ?? null;
  institutionId: number | null = null;
  title = this.data.user?.title ?? '';
  signatureLabel = this.data.user?.signatureLabel ?? '';
  readonly saving = signal(false);

  canSave(): boolean {
    if (this.data.mode === 'create') return !!this.username && !!this.password;
    return true;
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    try {
      if (this.data.mode === 'edit') {
        const body: Record<string, unknown> = {
          fullName: this.fullName, email: this.email, roleId: this.roleId,
          title: this.title || null, signatureLabel: this.signatureLabel || null,
        };
        if (this.password) body['password'] = this.password;
        await firstValueFrom(this.http.put(`/api/users/${this.data.user!.id}`, body));
        this.notify.success('Usuario actualizado');
      } else {
        await firstValueFrom(this.http.post('/api/users', {
          username: this.username, password: this.password, fullName: this.fullName,
          email: this.email, roleId: this.roleId, institutionId: this.institutionId,
          title: this.title || null, signatureLabel: this.signatureLabel || null,
        }));
        this.notify.success('Usuario creado');
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }
}
