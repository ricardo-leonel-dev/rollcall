import { Component, ChangeDetectionStrategy, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ChapterHeaderComponent } from '../../shared/components/chapter-header/chapter-header.component';
import { WhatsappIconComponent } from '../../shared/components/whatsapp-icon/whatsapp-icon.component';
import { UnsavedChangesDialogComponent } from './unsaved-changes-dialog.component';
import { WhatsappTemplatesTabComponent } from './whatsapp-templates-tab/whatsapp-templates-tab.component';

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
  avatarUrl: string | null;
  title: string | null;
  signatureLabel: string | null;
}

interface MeSnapshot {
  fullName: string;
  email: string;
  title: string;
  signatureLabel: string;
  avatarUrl: string | null;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatTabsModule,
    ChapterHeaderComponent, WhatsappIconComponent,
    WhatsappTemplatesTabComponent,
  ],
  styles: [`
    .section { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid var(--border-soft); }
    .section:last-child { border-bottom: 0; margin-bottom: 0; padding-bottom: 0; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-strong); margin-bottom: 14px; }
    .section-help { font-size: 13px; color: var(--muted-strong); margin: 0 0 12px; line-height: 1.5; }
    .row-2col { display: flex; gap: 12px; }
    .row-2col > * { flex: 1; }
    @media (max-width: 600px) { .row-2col { flex-direction: column; gap: 0; } }
    .row-end { display: flex; justify-content: flex-end; margin-top: 12px; }
    .preset-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .preset-btn { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; cursor: pointer; border: 2px solid transparent; }
    .preset-btn.selected { border-color: var(--ink); }
    .current-avatar { width: 64px; height: 64px; border-radius: 16px; object-fit: cover; display: block; margin-bottom: 14px; }
    .signature-preview { background: var(--paper-deep); border: 1px solid var(--border-soft); border-radius: 12px; padding: 10px 16px; font-size: 12px; color: var(--muted-strong); margin-bottom: 12px; line-height: 1.8; }
    .signature-preview-name { color: var(--ink-soft); font-weight: 600; }
    .tab-label { display: inline-flex; align-items: center; }
    .tab-label mat-icon, .tab-label app-whatsapp-icon { margin-right: 6px; font-size: 18px; width: 18px; height: 18px; }
    .dirty-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); margin-left: 8px; animation: dirty-dot-in 150ms ease-out; }
    @keyframes dirty-dot-in { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .dirty-dot { animation: none; } }
    .tab-body { padding: 24px; }
    @media (max-width: 599px) { .tab-body { padding: 16px; } }
    .account-card { background: var(--paper); border: 1px solid var(--border); border-radius: 16px; padding: 28px; max-width: 720px; }
    .messages { max-width: 960px; }
    .file-pick { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; background: var(--paper-deep); border: 1px solid var(--border); border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .file-pick:hover { background: var(--border-soft); }
  `],
  template: `
    <app-chapter-header
      icon="manage_accounts"
      eyebrowPrefix="Cuenta personal"
      eyebrowSuffix="Preferencias y mensajes" />

    <div class="page-header">
      <h1 class="page-title">Mi perfil</h1>
    </div>

    <mat-tab-group [selectedIndex]="selectedTab()" (selectedIndexChange)="onTabChange($event)" [preserveContent]="true"
                   style="background:var(--paper);border-radius:16px;border:1px solid var(--border);overflow:hidden">

      <mat-tab>
        <ng-template mat-tab-label>
          <span class="tab-label">
            <mat-icon>person</mat-icon>
            Mi cuenta
            @if (accountDirty()) { <span class="dirty-dot" role="img" aria-label="Cambios sin guardar" title="Cambios sin guardar"></span> }
          </span>
        </ng-template>
        <div class="tab-body">
    <div class="account-card">

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

    </div>
        </div>
      </mat-tab>

      <mat-tab>
        <ng-template mat-tab-label>
          <span class="tab-label">
            <app-whatsapp-icon [size]="18" />
            Mensajes de WhatsApp
            @if (templatesDirty()) { <span class="dirty-dot" role="img" aria-label="Cambios sin guardar" title="Cambios sin guardar"></span> }
          </span>
        </ng-template>
        <div class="tab-body messages">
          <app-whatsapp-templates-tab #tplTab/>
        </div>
      </mat-tab>

    </mat-tab-group>
  `,
})
export class ProfileComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Child owns the catalog + cards + state machine; parent reads its public signals. */
  private readonly tplTab = viewChild<WhatsappTemplatesTabComponent>('tplTab');

  readonly presets = AVATAR_PRESETS;

  readonly avatarUrlSig = signal<string | null>(null);
  readonly selectedPreset = signal<string | null>(null);

  readonly selectedTab = toSignal(
    this.route.queryParamMap.pipe(map(p => (p.get('tab') === 'mensajes' ? 1 : 0))),
    { initialValue: this.route.snapshot.queryParamMap.get('tab') === 'mensajes' ? 1 : 0 },
  );

  readonly templatesDirty = computed(() => this.tplTab()?.dirty() ?? false);

  readonly savingProfile = signal(false);
  readonly savingSignature = signal(false);
  readonly savingPassword = signal(false);
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
    fullName: '', email: '', title: '', signatureLabel: '', avatarUrl: null,
  };

  async ngOnInit(): Promise<void> {
    const [me] = await Promise.all([
      firstValueFrom(this.http.get<Me>('/api/auth/me')),
      this.loadTemplates(),
    ]);
    this.fullName = me.fullName ?? '';
    this.email = me.email ?? '';
    this.title = me.title ?? '';
    this.signatureLabel = me.signatureLabel ?? '';
    this.avatarUrlSig.set(me.avatarUrl);
    this.selectedPreset.set(resolveAvatarPreset(me.avatarUrl)?.id ?? null);
    this.initial = {
      fullName: this.fullName,
      email: this.email,
      title: this.title,
      signatureLabel: this.signatureLabel,
      avatarUrl: this.avatarUrlSig(),
    };
  }

  onTabChange(index: number): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index === 1 ? 'mensajes' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Delegates to the child; same never-rejects contract as before. */
  async loadTemplates(): Promise<void> {
    await this.tplTab()?.loadTemplates();
  }

  accountDirty(): boolean {
    const i = this.initial;
    return this.fullName       !== (i.fullName ?? '')
        || this.email          !== (i.email ?? '')
        || this.title          !== (i.title ?? '')
        || this.signatureLabel !== (i.signatureLabel ?? '')
        || this.avatarUrlSig() !== (i.avatarUrl ?? null)
        || this.currentPassword !== ''
        || this.newPassword     !== ''
        || this.confirmPassword !== ''
        || this.selectedPreset() !== (resolveAvatarPreset(i.avatarUrl ?? null)?.id ?? null);
  }

  hasDirty(): boolean {
    return this.accountDirty() || this.templatesDirty();
  }

  async canDeactivate(): Promise<boolean> {
    if (!this.hasDirty()) return true;
    const choice = await firstValueFrom(
      this.dialog.open(UnsavedChangesDialogComponent, { width: '420px' })
        .afterClosed()
    );
    if (choice === 'discard') return true;
    if (choice === 'save') {
      // R43: blank dirty cards are not saved by saveDirtyCards; warn first.
      const child = this.tplTab();
      if (child?.hasBlankDirtyCard()) {
        this.notify.warning('Hay un mensaje de WhatsApp vacío. Escríbelo o restáuralo antes de salir.');
        return false;
      }
      const tasks: Array<Promise<unknown>> = [
        this.fullName !== (this.initial.fullName ?? '')
            || this.email !== (this.initial.email ?? '') ? this.saveProfile() : Promise.resolve(),
        this.title !== (this.initial.title ?? '')
            || this.signatureLabel !== (this.initial.signatureLabel ?? '') ? this.saveSignature() : Promise.resolve(),
        this.currentPassword || this.newPassword || this.confirmPassword ? this.savePassword() : Promise.resolve(),
        ...(await child?.saveDirtyCards() ?? []).map(r => r.ok ? Promise.resolve() : Promise.reject(new Error('template save failed'))),
      ];
      const results = await Promise.allSettled(tasks);
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