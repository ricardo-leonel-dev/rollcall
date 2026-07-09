import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';

export const DEFAULT_NOTIFICATION_TEMPLATE =
  'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.';

export interface AvatarPreset { id: string; icon: string; color: string; }

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'indigo-school', icon: 'school',         color: '#6366f1' },
  { id: 'purple-star',   icon: 'star',           color: '#8b5cf6' },
  { id: 'green-leaf',    icon: 'eco',             color: '#16a34a' },
  { id: 'amber-sun',     icon: 'wb_sunny',        color: '#f59e0b' },
  { id: 'red-heart',     icon: 'favorite',        color: '#dc2626' },
  { id: 'blue-wave',     icon: 'water',           color: '#0ea5e9' },
  { id: 'pink-flower',   icon: 'local_florist',   color: '#ec4899' },
  { id: 'teal-bolt',     icon: 'bolt',            color: '#0d9488' },
  { id: 'orange-rocket', icon: 'rocket_launch',   color: '#ea580c' },
  { id: 'gray-cat',      icon: 'pets',            color: '#64748b' },
  { id: 'violet-moon',   icon: 'dark_mode',       color: '#7c3aed' },
  { id: 'lime-bug',      icon: 'bug_report',      color: '#65a30d' },
];

export function resolveAvatarPreset(avatarUrl: string | null | undefined): AvatarPreset | null {
  if (!avatarUrl?.startsWith('preset:')) return null;
  const id = avatarUrl.slice('preset:'.length);
  return AVATAR_PRESETS.find(p => p.id === id) ?? null;
}

interface Me {
  fullName: string | null;
  email: string | null;
  notificationTemplate: string | null;
  avatarUrl: string | null;
  title: string | null;
  signatureLabel: string | null;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule],
  styles: [`
    .section { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border-soft); }
    .section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-strong); margin-bottom: 12px; }
    .placeholders { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 16px; }
    .ph-chip {
      font-family: monospace; font-size: 11px; padding: 3px 8px; border-radius: 6px;
      background: var(--accent-soft); color: #4f46e5; cursor: pointer; border: none;
    }
    .ph-chip:hover { background: #c7d2fe; }
    textarea { width: 100%; }
    .preset-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .preset-btn {
      width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
      color: white; cursor: pointer; border: 2px solid transparent;
    }
    .preset-btn.selected { border-color: var(--ink); }
    .current-avatar { width: 56px; height: 56px; border-radius: 14px; object-fit: cover; display: block; margin-bottom: 12px; }
  `],
  template: `
    <h2 mat-dialog-title style="font-family:'Nunito',sans-serif">Mi perfil</h2>
    <mat-dialog-content>

      <div class="section">
        <div class="section-title">Datos personales</div>
        <mat-form-field appearance="outline" style="width:100%;margin-bottom:8px">
          <mat-label>Nombre completo</mat-label>
          <input matInput [(ngModel)]="fullName">
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Email</mat-label>
          <input matInput type="email" [(ngModel)]="email">
        </mat-form-field>
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button mat-flat-button color="primary" (click)="saveProfile()" [disabled]="savingProfile()">Guardar</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Firma en reportes</div>
        <p style="font-size:13px;color:var(--muted-strong);margin-top:0">
          Esta información aparece en los reportes de asistencia exportados a Excel.
        </p>
        <div style="display:flex;gap:8px">
          <mat-form-field appearance="outline" style="width:30%">
            <mat-label>Título</mat-label>
            <input matInput [(ngModel)]="title" placeholder="Ing., Lcda., Dr.">
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:70%">
            <mat-label>Cargo para firma</mat-label>
            <input matInput [(ngModel)]="signatureLabel" placeholder="INSPECTOR PISO 1, INSPECTOR GENERAL…">
          </mat-form-field>
        </div>
        @if (title || signatureLabel || fullName) {
          <div style="background:var(--paper-deep);border:1px solid var(--border-soft);border-radius:10px;padding:8px 14px;font-size:12px;color:var(--muted-strong);margin-bottom:8px;line-height:1.8">
            <div style="color:var(--ink-soft);font-weight:600">{{[title, fullName].filter(Boolean).join(' ')}}</div>
            @if (signatureLabel) { <div>{{signatureLabel}}</div> }
          </div>
        }
        <div style="display:flex;justify-content:flex-end">
          <button mat-flat-button color="primary" (click)="saveSignature()" [disabled]="savingSignature()">Guardar firma</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Avatar</div>
        @if (avatarUrl()?.startsWith('/api/uploads/')) {
          <img class="current-avatar" [src]="avatarUrl()">
        }
        <div class="preset-grid">
          @for (p of presets; track p.id) {
            <button type="button" class="preset-btn" [class.selected]="selectedPreset() === p.id"
                    [style.background]="p.color" (click)="choosePreset(p.id)">
              <mat-icon>{{p.icon}}</mat-icon>
            </button>
          }
        </div>
        <label>
          <input type="file" style="display:none" accept="image/png,image/jpeg,image/webp" (change)="onAvatarFile($event)">
          <span style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--paper-deep);border:1px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">
            <mat-icon style="font-size:16px;width:16px;height:16px">upload_file</mat-icon> Subir foto
          </span>
        </label>
      </div>

      <div class="section">
        <div class="section-title">Contraseña</div>
        <mat-form-field appearance="outline" style="width:100%;margin-bottom:8px">
          <mat-label>Contraseña actual</mat-label>
          <input matInput type="password" [(ngModel)]="currentPassword">
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:100%;margin-bottom:8px">
          <mat-label>Nueva contraseña</mat-label>
          <input matInput type="password" [(ngModel)]="newPassword">
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Confirmar nueva contraseña</mat-label>
          <input matInput type="password" [(ngModel)]="confirmPassword">
        </mat-form-field>
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button mat-flat-button color="primary" (click)="savePassword()" [disabled]="savingPassword()">Cambiar contraseña</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Mensaje de notificación</div>
        <p style="font-size:13px;color:var(--muted-strong);margin-top:0">
          Se usa al notificar por WhatsApp a un representante sobre una falta o atraso. Es personal — solo aplica a tu cuenta.
        </p>
        <div class="placeholders">
          @for (ph of placeholders; track ph) {
            <button type="button" class="ph-chip" (click)="insert(ph)">{{ph}}</button>
          }
        </div>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Plantilla</mat-label>
          <textarea matInput rows="4" [(ngModel)]="template"></textarea>
        </mat-form-field>
        @if (template().trim()) {
          <div style="margin-top:12px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Vista previa</div>
            <div style="background:var(--paper-deep);border:1px solid var(--border-soft);border-radius:10px;padding:12px;font-size:13px;color:var(--ink-soft)">
              {{preview()}}
            </div>
          </div>
        }
        <div style="display:flex;justify-content:flex-end;margin-top:12px">
          <button mat-flat-button color="primary" (click)="saveTemplate()" [disabled]="savingTemplate()">Guardar mensaje</button>
        </div>
      </div>

    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cerrar</button>
    </mat-dialog-actions>
  `,
})
export class ProfileDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<ProfileDialogComponent>);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);

  readonly presets = AVATAR_PRESETS;
  readonly placeholders = ['{{nombre}}', '{{fecha}}', '{{tipo}}', '{{curso}}'];

  readonly template = signal('');
  readonly avatarUrl = signal<string | null>(null);
  readonly selectedPreset = signal<string | null>(null);
  readonly savingProfile = signal(false);
  readonly savingPassword = signal(false);
  readonly savingTemplate = signal(false);
  readonly savingAvatar = signal(false);
  readonly savingSignature = signal(false);

  fullName = '';
  email = '';
  title = '';
  signatureLabel = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  readonly preview = () => this.template()
    .replace(/\{\{nombre\}\}/g, 'JUAN PÉREZ')
    .replace(/\{\{fecha\}\}/g, '2026-06-17')
    .replace(/\{\{tipo\}\}/g, 'una falta')
    .replace(/\{\{curso\}\}/g, 'OCTAVO "A"');

  async ngOnInit(): Promise<void> {
    const me = await firstValueFrom(this.http.get<Me>('/api/auth/me'));
    this.fullName = me.fullName ?? '';
    this.email = me.email ?? '';
    this.title = me.title ?? '';
    this.signatureLabel = me.signatureLabel ?? '';
    this.template.set(me.notificationTemplate || DEFAULT_NOTIFICATION_TEMPLATE);
    this.avatarUrl.set(me.avatarUrl);
    this.selectedPreset.set(resolveAvatarPreset(me.avatarUrl)?.id ?? null);
  }

  insert(placeholder: string): void {
    this.template.update(t => t + (t.endsWith(' ') || !t ? '' : ' ') + placeholder);
  }

  async saveProfile(): Promise<void> {
    this.savingProfile.set(true);
    try {
      await firstValueFrom(this.http.put('/api/auth/me', { fullName: this.fullName, email: this.email }));
      this.auth.updateLocalUser({ fullName: this.fullName, email: this.email });
      this.notify.success('Perfil actualizado');
    } finally { this.savingProfile.set(false); }
  }

  async saveSignature(): Promise<void> {
    this.savingSignature.set(true);
    try {
      await firstValueFrom(this.http.put('/api/auth/me', {
        title: this.title || null,
        signatureLabel: this.signatureLabel || null,
      }));
      this.notify.success('Firma actualizada');
    } finally { this.savingSignature.set(false); }
  }

  async savePassword(): Promise<void> {
    if (!this.currentPassword || !this.newPassword) {
      this.notify.warning('Completa la contraseña actual y la nueva');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.notify.warning('Las contraseñas nuevas no coinciden');
      return;
    }
    this.savingPassword.set(true);
    try {
      await firstValueFrom(this.http.put('/api/auth/me/password', {
        currentPassword: this.currentPassword, newPassword: this.newPassword,
      }));
      this.currentPassword = ''; this.newPassword = ''; this.confirmPassword = '';
      this.notify.success('Contraseña actualizada');
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo cambiar la contraseña');
    } finally { this.savingPassword.set(false); }
  }

  async choosePreset(id: string): Promise<void> {
    this.savingAvatar.set(true);
    try {
      const me = await firstValueFrom(this.http.put<Me>('/api/auth/me/avatar', { preset: id }));
      this.avatarUrl.set(me.avatarUrl);
      this.selectedPreset.set(id);
      this.auth.updateLocalUser({ avatarUrl: me.avatarUrl });
      this.notify.success('Avatar actualizado');
    } finally { this.savingAvatar.set(false); }
  }

  async onAvatarFile(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.savingAvatar.set(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const me = await firstValueFrom(this.http.post<Me>('/api/auth/me/avatar/upload', fd));
      this.avatarUrl.set(me.avatarUrl);
      this.selectedPreset.set(null);
      this.auth.updateLocalUser({ avatarUrl: me.avatarUrl });
      this.notify.success('Foto actualizada');
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo subir la foto');
    } finally { this.savingAvatar.set(false); }
  }

  async saveTemplate(): Promise<void> {
    this.savingTemplate.set(true);
    try {
      await firstValueFrom(this.http.put('/api/auth/me', { notificationTemplate: this.template() }));
      this.notify.success('Mensaje guardado');
    } finally { this.savingTemplate.set(false); }
  }
}
