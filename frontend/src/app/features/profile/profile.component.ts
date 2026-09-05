import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { UnsavedChangesDialogComponent } from './unsaved-changes-dialog.component';

export const DEFAULT_NOTIFICATION_TEMPLATE =
  'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.';

export interface AvatarPreset { id: string; icon: string; color: string; }

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'indigo-school', icon: 'school',         color: '#6366f1' },
  { id: 'purple-star',   icon: 'star',           color: '#8b5cf6' },
  { id: 'green-leaf',    icon: 'eco',             color: '#16a34a' },
  { id: 'amber-sun',    icon: 'wb_sunny',        color: '#f59e0b' },
  { id: 'red-heart',    icon: 'favorite',        color: '#dc2626' },
  { id: 'blue-wave',    icon: 'water',           color: '#0ea5e9' },
  { id: 'pink-flower',  icon: 'local_florist',   color: '#ec4899' },
  { id: 'teal-bolt',    icon: 'bolt',            color: '#0d9488' },
  { id: 'orange-rocket', icon: 'rocket_launch',   color: '#ea580c' },
  { id: 'gray-cat',     icon: 'pets',            color: '#64748b' },
  { id: 'violet-moon',  icon: 'dark_mode',       color: '#7c3aed' },
  { id: 'lime-bug',     icon: 'bug_report',      color: '#65a30d' },
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

interface MeSnapshot {
  fullName: string;
  email: string;
  title: string;
  signatureLabel: string;
  notificationTemplate: string;
  avatarUrl: string | null;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  styles: [`
    .section { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid var(--border-soft); }
    .section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-strong); margin-bottom: 14px; }
    .section-help { font-size: 13px; color: var(--muted-strong); margin: 0 0 12px; line-height: 1.5; }
    .row-2col { display: flex; gap: 12px; }
    .row-2col > * { flex: 1; }
    @media (max-width: 600px) { .row-2col { flex-direction: column; gap: 0; } }
    .row-end { display: flex; justify-content: flex-end; margin-top: 12px; }
    .placeholders { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 16px; }
    .ph-chip {
      font-family: monospace; font-size: 11px; padding: 4px 10px; border-radius: 6px;
      background: var(--accent-soft); color: #4f46e5; cursor: pointer; border: none;
    }
    .ph-chip:hover { background: #c7d2fe; }
    textarea { width: 100%; }
    .preset-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .preset-btn {
      width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
      color: white; cursor: pointer; border: 2px solid transparent;
    }
    .preset-btn.selected { border-color: var(--ink); }
    .current-avatar { width: 64px; height: 64px; border-radius: 16px; object-fit: cover; display: block; margin-bottom: 14px; }
    .signature-preview {
      background: var(--paper-deep); border: 1px solid var(--border-soft); border-radius: 12px;
      padding: 10px 16px; font-size: 12px; color: var(--muted-strong); margin-bottom: 12px; line-height: 1.8;
    }
    .signature-preview-name { color: var(--ink-soft); font-weight: 600; }
    .preview-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 6px; }
    .preview-block {
      background: var(--paper-deep); border: 1px solid var(--border-soft); border-radius: 12px;
      padding: 14px; font-size: 13px; color: var(--ink-soft); white-space: pre-wrap; line-height: 1.5;
    }
    .file-pick {
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px;
      background: var(--paper-deep); border: 1px solid var(--border); border-radius: 10px;
      font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .file-pick:hover { background: var(--border-soft); }
  `],
  template: `
    <div class="page-header">
      <h1 class="page-title">Mi perfil</h1>
    </div>

    <div style="background:var(--paper);border:1px solid var(--border);border-radius:16px;padding:28px;max-width:720px">

      <div class="section">
        <div class="section-title">Datos personales</div>
        <mat-form-field appearance="outline" style="width:100%;margin-bottom:12px">
          <mat-label>Nombre completo</mat-label>
          <input matInput [(ngModel)]="fullName">
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Email</mat-label>
          <input matInput type="email" [(ngModel)]="email">
        </mat-form-field>
        <div class="row-end">
          <button mat-flat-button color="primary" (click)="saveProfile()" [disabled]="savingProfile()">Guardar</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Firma en reportes</div>
        <p class="section-help">Esta información aparece en los reportes de asistencia exportados a Excel.</p>
        <div class="row-2col">
          <mat-form-field appearance="outline">
            <mat-label>Título</mat-label>
            <input matInput [(ngModel)]="title" placeholder="Ing., Lcda., Dr.">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Cargo para firma</mat-label>
            <input matInput [(ngModel)]="signatureLabel" placeholder="INSPECTOR PISO 1, INSPECTOR GENERAL…">
          </mat-form-field>
        </div>
        @if (title || signatureLabel || fullName) {
          <div class="signature-preview">
            <div class="signature-preview-name">{{title ? title + ' ' + fullName : fullName}}</div>
            @if (signatureLabel) { <div>{{signatureLabel}}</div> }
          </div>
        }
        <div class="row-end">
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
          <span class="file-pick">
            <mat-icon style="font-size:16px;width:16px;height:16px">upload_file</mat-icon> Subir foto
          </span>
        </label>
      </div>

      <div class="section">
        <div class="section-title">Contraseña</div>
        <mat-form-field appearance="outline" style="width:100%;margin-bottom:12px">
          <mat-label>Contraseña actual</mat-label>
          <input matInput type="password" [(ngModel)]="currentPassword">
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:100%;margin-bottom:12px">
          <mat-label>Nueva contraseña</mat-label>
          <input matInput type="password" [(ngModel)]="newPassword">
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Confirmar nueva contraseña</mat-label>
          <input matInput type="password" [(ngModel)]="confirmPassword">
        </mat-form-field>
        <div class="row-end">
          <button mat-flat-button color="primary" (click)="savePassword()" [disabled]="savingPassword()">Cambiar contraseña</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Mensaje de notificación</div>
        <p class="section-help">
          Se usa al notificar por WhatsApp a un representante sobre una falta o atraso. Es personal — solo aplica a tu cuenta.
        </p>
        <div class="placeholders">
          <button type="button" class="ph-chip" (click)="insert('{{nombre}}')">{{'{{nombre}}'}}</button>
          <button type="button" class="ph-chip" (click)="insert('{{fecha}}')">{{'{{fecha}}'}}</button>
          <button type="button" class="ph-chip" (click)="insert('{{tipo}}')">{{'{{tipo}}'}}</button>
          <button type="button" class="ph-chip" (click)="insert('{{curso}}')">{{'{{curso}}'}}</button>
        </div>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Plantilla</mat-label>
          <textarea matInput rows="5"
                    [ngModel]="template()"
                    (ngModelChange)="template.set($event)"></textarea>
        </mat-form-field>
        @if (template().trim()) {
          <div style="margin-top:14px">
            <div class="preview-label">Vista previa</div>
            <div class="preview-block">{{preview()}}</div>
          </div>
        }
        <div class="row-end" style="margin-top:14px">
          <button mat-flat-button color="primary" (click)="saveTemplate()" [disabled]="savingTemplate()">Guardar mensaje</button>
        </div>
      </div>

    </div>
  `,
})
export class ProfileComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  readonly presets = AVATAR_PRESETS;

  readonly avatarUrlSig = signal<string | null>(null);
  readonly selectedPreset = signal<string | null>(null);
  readonly template = signal<string>('');

  readonly savingProfile = signal(false);
  readonly savingSignature = signal(false);
  readonly savingPassword = signal(false);
  readonly savingTemplate = signal(false);
  readonly savingAvatar = signal(false);

  // Public alias so the template binds to `avatarUrl()` while we keep the
  // private name on `avatarUrlSig` for the dirty-tracking compare. Mirrors the
  // existing dialog's `avatarUrl: signal<string | null>` public shape.
  readonly avatarUrl = this.avatarUrlSig.asReadonly();

  fullName = '';
  email = '';
  title = '';
  signatureLabel = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  private initial: MeSnapshot = {
    fullName: '', email: '', title: '', signatureLabel: '',
    notificationTemplate: '', avatarUrl: null,
  };

  async ngOnInit(): Promise<void> {
    const [me, templates] = await Promise.all([
      firstValueFrom(this.http.get<Me>('/api/auth/me')),
      // Match the original dialog's behavior: the WhatsApp template lives in
      // /api/notification-templates (actionKey 'absences'), NOT on /api/auth/me
      // — the backend's updateMe ignores unknown keys and /api/auth/me doesn't
      // return a `notificationTemplate` field, so the spec's R5/"Me interface"
        // note is honored by reading from this endpoint instead. The
        // DEFAULT_NOTIFICATION_TEMPLATE fallback applies when the user has
        // never saved a custom one.
      firstValueFrom(this.http.get<{ actionKey: string; template: string }[]>('/api/notification-templates'))
        .catch(() => [] as { actionKey: string; template: string }[]),
    ]);
    this.fullName = me.fullName ?? '';
    this.email = me.email ?? '';
    this.title = me.title ?? '';
    this.signatureLabel = me.signatureLabel ?? '';
    this.avatarUrlSig.set(me.avatarUrl);
    this.selectedPreset.set(resolveAvatarPreset(me.avatarUrl)?.id ?? null);
    const saved = templates.find(t => t.actionKey === 'absences');
    this.template.set(saved?.template || DEFAULT_NOTIFICATION_TEMPLATE);
    this.initial = {
      fullName: this.fullName,
      email: this.email,
      title: this.title,
      signatureLabel: this.signatureLabel,
      notificationTemplate: this.template(),
      avatarUrl: this.avatarUrlSig(),
    };
  }

  preview(): string {
    let out = this.template();
    const sample: Record<string, string> = {
      nombre: 'JUAN PÉREZ', fecha: '2026-06-17', tipo: 'una falta', curso: 'OCTAVO "A"',
    };
    for (const [k, v] of Object.entries(sample)) out = out.replaceAll(`{{${k}}}`, v);
    return out;
  }

  insert(placeholder: string): void {
    const current = this.template();
    this.template.set(current + (current.endsWith(' ') || !current ? '' : ' ') + placeholder);
  }

  hasDirty(): boolean {
    const i = this.initial;
    return this.fullName       !== (i.fullName ?? '')
        || this.email          !== (i.email ?? '')
        || this.title          !== (i.title ?? '')
        || this.signatureLabel !== (i.signatureLabel ?? '')
        || this.template()    !== (i.notificationTemplate ?? '')
        || this.avatarUrlSig() !== (i.avatarUrl ?? null)
        || this.currentPassword !== ''
        || this.newPassword     !== ''
        || this.confirmPassword !== ''
        || this.selectedPreset() !== resolveAvatarPreset(i.avatarUrl ?? null)?.id;
  }

  async canDeactivate(): Promise<boolean> {
    if (!this.hasDirty()) return true;
    const choice = await firstValueFrom(
      this.dialog.open(UnsavedChangesDialogComponent, { width: '420px' })
        .afterClosed()
    );
    if (choice === 'discard') return true;
    if (choice === 'save') {
      const tasks: Array<Promise<void> | null> = [
        this.fullName !== (this.initial.fullName ?? '')
            || this.email !== (this.initial.email ?? '') ? this.saveProfile() : null,
        this.title !== (this.initial.title ?? '')
            || this.signatureLabel !== (this.initial.signatureLabel ?? '') ? this.saveSignature() : null,
        this.template() !== (this.initial.notificationTemplate ?? '') ? this.saveTemplate() : null,
        this.currentPassword || this.newPassword || this.confirmPassword ? this.savePassword() : null,
      ];
      const results = await Promise.allSettled(tasks.filter(Boolean) as Promise<void>[]);
      return results.every(r => r.status === 'fulfilled');
    }
    return false;
  }

  async saveProfile(): Promise<void> {
    this.savingProfile.set(true);
    try {
      await firstValueFrom(this.http.put('/api/auth/me', { fullName: this.fullName, email: this.email }));
      this.auth.updateLocalUser({ fullName: this.fullName, email: this.email });
      this.initial = { ...this.initial, fullName: this.fullName, email: this.email };
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
      this.auth.updateLocalUser({ title: this.title || null, signatureLabel: this.signatureLabel || null });
      this.initial = { ...this.initial, title: this.title, signatureLabel: this.signatureLabel };
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
      this.initial = { ...this.initial };
      this.notify.success('Contraseña actualizada');
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo cambiar la contraseña');
    } finally { this.savingPassword.set(false); }
  }

  async saveTemplate(): Promise<void> {
    const value = this.template();
    if (!value.trim()) {
      this.notify.warning('Escribe un mensaje antes de guardar');
      return;
    }
    this.savingTemplate.set(true);
    try {
      // Persist via /api/notification-templates (actionKey 'absences') —
      // matches the original dialog's NotificationTemplateService.saveTemplate
      // call. PUT /api/auth/me does NOT accept a notificationTemplate field
      // (backend's updateMe ignores unknown keys), so this is the only working
      // endpoint. The auth/me fetch in ngOnInit therefore also reads from
      // /api/notification-templates instead of `me.notificationTemplate`.
      await firstValueFrom(this.http.put('/api/notification-templates', { actionKey: 'absences', template: value }));
      this.initial = { ...this.initial, notificationTemplate: value };
      this.notify.success('Mensaje guardado');
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo guardar el mensaje');
    } finally { this.savingTemplate.set(false); }
  }

  async choosePreset(id: string): Promise<void> {
    this.savingAvatar.set(true);
    try {
      const me = await firstValueFrom(this.http.put<Me>('/api/auth/me/avatar', { preset: id }));
      this.avatarUrlSig.set(me.avatarUrl);
      this.selectedPreset.set(id);
      this.auth.updateLocalUser({ avatarUrl: me.avatarUrl });
      this.initial = { ...this.initial, avatarUrl: me.avatarUrl };
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
      this.avatarUrlSig.set(me.avatarUrl);
      this.selectedPreset.set(null);
      this.auth.updateLocalUser({ avatarUrl: me.avatarUrl });
      this.initial = { ...this.initial, avatarUrl: me.avatarUrl };
      this.notify.success('Foto actualizada');
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo subir la foto');
    } finally { this.savingAvatar.set(false); }
  }
}