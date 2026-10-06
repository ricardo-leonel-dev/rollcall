import { Component, ChangeDetectionStrategy, computed, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { firstValueFrom, map } from 'rxjs';
import { NotificationTemplateItem } from '../../core/models/index';
import { previewTemplate } from '../../shared/utils/template.util';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationTemplateService } from '../../core/services/notification-template.service';
import { ChapterHeaderComponent } from '../../shared/components/chapter-header/chapter-header.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { WhatsappIconComponent } from '../../shared/components/whatsapp-icon/whatsapp-icon.component';
import { UnsavedChangesDialogComponent } from './unsaved-changes-dialog.component';

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

interface TemplateCardState {
  item:     NotificationTemplateItem;
  text:     string;
  caret:    number;
  caretEnd: number;
  busy:     boolean;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, TextFieldModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatTabsModule,
    ChapterHeaderComponent, LoadingSpinnerComponent, WhatsappIconComponent,
  ],
  styles: [`
    .section { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid var(--border-soft); }
    .section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-strong); margin-bottom: 14px; }
    .section-help { font-size: 13px; color: var(--muted-strong); margin: 0 0 12px; line-height: 1.5; }
    .row-2col { display: flex; gap: 12px; }
    .row-2col > * { flex: 1; }
    @media (max-width: 600px) { .row-2col { flex-direction: column; gap: 0; } }
    .row-end { display: flex; justify-content: flex-end; margin-top: 12px; }
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
    .tab-label { display: inline-flex; align-items: center; }
    .tab-label mat-icon { margin-right: 6px; font-size: 18px; width: 18px; height: 18px; }
    .tab-label app-whatsapp-icon { display: inline-flex; margin-right: 6px; }
    .dirty-dot {
      display: inline-block; width: 7px; height: 7px; border-radius: 50%;
      background: var(--accent); margin-left: 8px; animation: dirty-dot-in 150ms ease-out;
    }
    @keyframes dirty-dot-in { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .dirty-dot { animation: none; } }

    .tab-body { padding: 24px; }
    .account-card { background: var(--paper); border: 1px solid var(--border); border-radius: 16px; padding: 28px; max-width: 720px; }
    .messages { max-width: 960px; }
    .messages-intro { font-size: 13px; color: var(--muted-strong); margin: 0 0 20px; line-height: 1.5; }
    .tpl-stack { display: flex; flex-direction: column; gap: 16px; }

    .tpl-card { background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px; }
    .tpl-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 8px 12px; }
    .tpl-head > div { flex: 1 1 240px; min-width: 0; }
    .tpl-title { font-family: 'Nunito', sans-serif; font-size: 16px; font-weight: 700; color: var(--ink); margin: 0; }
    .tpl-desc { font-size: 13px; font-weight: 400; line-height: 1.5; color: var(--muted-strong); margin: 4px 0 0; }
    .pill {
      flex-shrink: 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
      padding: 3px 9px; border-radius: 999px; white-space: nowrap;
    }
    .pill.custom  { background: var(--accent-soft); color: var(--accent); }
    .pill.default { background: var(--border-soft); color: var(--muted-strong); }

    .tpl-body {
      display: grid; grid-template-columns: 1fr; gap: 20px;
      border-top: 1px solid var(--border-soft); border-bottom: 1px solid var(--border-soft);
      margin-top: 16px; padding: 16px 0;
    }
    @media (min-width: 1024px) { .tpl-body { grid-template-columns: 1fr 1fr; } }
    .tpl-body > * { min-width: 0; }
    .chips-hint { font-size: 12px; color: var(--muted); margin: 0 0 6px; }
    .placeholders { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .ph-chip {
      font-family: ui-monospace, monospace; font-size: 11.5px; padding: 4px 10px; border-radius: var(--radius-sm);
      background: var(--accent-soft); color: var(--accent); border: 1px solid transparent; cursor: pointer;
    }
    .ph-chip:hover { border-color: var(--accent); }
    .ph-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .preview-block {
      position: relative; background: var(--paper-deep); border: 1px solid var(--border-soft); border-radius: var(--radius-md);
      padding: 14px 14px 14px 28px; font-size: 13.5px; line-height: 1.6; color: var(--ink-soft); white-space: pre-wrap;
    }
    .preview-block::before {
      content: ''; position: absolute; top: 0; bottom: 0; left: 14px; width: 2px; background: var(--stripe);
    }
    .blank-hint { display: flex; align-items: flex-start; gap: 6px; font-size: 13px; line-height: 1.5; color: var(--stripe); }
    .blank-hint mat-icon { font-size: 16px; width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px; }
    .tpl-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
    .tpl-actions button:disabled { opacity: .5; }
    @media (max-width: 599px) {
      .tab-body { padding: 16px; }
      .tpl-card { padding: 16px; }
      .tpl-actions { flex-direction: column-reverse; }
      .tpl-actions button { width: 100%; }
    }

    .state { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 48px 24px; gap: 6px; }
    .state mat-icon { font-size: 32px; width: 32px; height: 32px; color: var(--muted); margin-bottom: 6px; }
    .state-title { font-family: 'Nunito', sans-serif; font-size: 15px; font-weight: 700; color: var(--ink); margin: 0; }
    .state-body { font-size: 13px; color: var(--muted-strong); margin: 0; }
    .file-pick {
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px;
      background: var(--paper-deep); border: 1px solid var(--border); border-radius: 10px;
      font-size: 13px; font-weight: 600; cursor: pointer;
    }
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
          <p class="messages-intro">Estos son los mensajes que se precargan al notificar a un representante por WhatsApp. Son personales: los cambios solo aplican a tu cuenta.</p>

          @switch (templatesStatus()) {
            @case ('loading') {
              <app-loading-spinner message="Cargando mensajes…" />
            }
            @case ('error') {
              <div class="state">
                <mat-icon>cloud_off</mat-icon>
                <p class="state-title">No se pudieron cargar los mensajes</p>
                <p class="state-body">Revisa tu conexión e inténtalo de nuevo.</p>
                <button mat-stroked-button style="margin-top:14px" (click)="loadTemplates()">
                  <mat-icon>refresh</mat-icon> Reintentar
                </button>
              </div>
            }
            @default {
              @if (cards().length === 0) {
                <div class="state">
                  <mat-icon>chat_bubble_outline</mat-icon>
                  <p class="state-title">No hay mensajes para configurar</p>
                  <p class="state-body">Cuando la institución habilite notificaciones por WhatsApp, aparecerán aquí.</p>
                </div>
              } @else {
                <div class="tpl-stack">
                  @for (card of cards(); track card.item.actionKey) {
                    <section class="tpl-card" [attr.aria-label]="card.item.label">
                      <div class="tpl-head">
                        <div>
                          <h2 class="tpl-title">{{card.item.label}}</h2>
                          @if (card.item.description) { <p class="tpl-desc">{{card.item.description}}</p> }
                        </div>
                        @if (card.item.isCustom) {
                          <span class="pill custom">Personalizado</span>
                        } @else {
                          <span class="pill default">Predeterminado</span>
                        }
                      </div>

                      <div class="tpl-body">
                        <div>
                          <div class="preview-label">Plantilla</div>
                          @if (card.item.placeholders.length) {
                            <p class="chips-hint">Toca un marcador para insertarlo donde está el cursor.</p>
                            <div class="placeholders">
                              @for (p of card.item.placeholders; track p.key) {
                                <button type="button" class="ph-chip" [title]="p.label" [attr.aria-label]="p.label"
                                        (click)="insertPlaceholder(card, p.key, ta)">{{token(p.key)}}</button>
                              }
                            </div>
                          }
                          <mat-form-field appearance="outline" style="width:100%" subscriptSizing="dynamic">
                            <mat-label>Plantilla</mat-label>
                            <textarea matInput #ta
                                      cdkTextareaAutosize cdkAutosizeMinRows="5" cdkAutosizeMaxRows="14"
                                      [ngModel]="card.text"
                                      (ngModelChange)="onTextChange(card, $event)"
                                      (select)="recordCaret(card, ta)"
                                      (click)="recordCaret(card, ta)"
                                      (keyup)="recordCaret(card, ta)"
                                      (blur)="recordCaret(card, ta)"></textarea>
                          </mat-form-field>
                        </div>
                        <div>
                          @if (isBlank(card)) {
                            <p class="blank-hint">
                              <mat-icon>error_outline</mat-icon>
                              <span>El mensaje no puede quedar vacío. Usa «Restaurar predeterminado» para recuperar el texto original.</span>
                            </p>
                          } @else {
                            <div class="preview-label">Vista previa</div>
                            <div class="preview-block">{{preview(card)}}</div>
                          }
                        </div>
                      </div>

                      <div class="tpl-actions">
                        <button mat-stroked-button (click)="onRestore(card)" [disabled]="!canRestore(card)">
                          <mat-icon>restart_alt</mat-icon> Restaurar predeterminado
                        </button>
                        <button mat-flat-button color="primary" (click)="onSave(card)" [disabled]="!canSave(card)">Guardar mensaje</button>
                      </div>
                    </section>
                  }
                </div>
              }
            }
          }
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
  private readonly templateService = inject(NotificationTemplateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly presets = AVATAR_PRESETS;

  readonly avatarUrlSig = signal<string | null>(null);
  readonly selectedPreset = signal<string | null>(null);

  readonly selectedTab = toSignal(
    this.route.queryParamMap.pipe(map(p => (p.get('tab') === 'mensajes' ? 1 : 0))),
    { initialValue: this.route.snapshot.queryParamMap.get('tab') === 'mensajes' ? 1 : 0 },
  );

  readonly templatesStatus = signal<'loading' | 'ready' | 'error'>('loading');
  readonly cards = signal<TemplateCardState[]>([]);
  readonly templatesDirty = computed(() => this.cards().some(c => this.isDirty(c)));

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

  /** Never rejects: a catalog failure must not block the Mi cuenta tab. */
  async loadTemplates(): Promise<void> {
    this.templatesStatus.set('loading');
    try {
      await this.templateService.load();
      this.cards.set(this.templateService.items().map(item => ({
        item,
        text: item.template,
        caret: item.template.length,
        caretEnd: item.template.length,
        busy: false,
      })));
      this.templatesStatus.set('ready');
    } catch {
      this.templatesStatus.set('error');
    }
  }

  token(key: string): string {
    return `{{${key}}}`;
  }

  isDirty(c: TemplateCardState): boolean { return c.text !== c.item.template; }
  isBlank(c: TemplateCardState): boolean { return !c.text.trim(); }
  canSave(c: TemplateCardState): boolean { return this.isDirty(c) && !this.isBlank(c) && !c.busy; }
  canRestore(c: TemplateCardState): boolean {
    return !c.busy && (c.item.isCustom || c.text !== c.item.defaultTemplate);
  }
  preview(c: TemplateCardState): string { return previewTemplate(c.text, c.item.placeholders); }

  onTextChange(card: TemplateCardState, text: string): void {
    this.patchCard(card.item.actionKey, { text });
  }

  recordCaret(card: TemplateCardState, ta: HTMLTextAreaElement): void {
    const current = this.findCard(card.item.actionKey);
    if (current && current.caret === ta.selectionStart && current.caretEnd === ta.selectionEnd) return;
    this.patchCard(card.item.actionKey, { caret: ta.selectionStart, caretEnd: ta.selectionEnd });
  }

  insertPlaceholder(card: TemplateCardState, key: string, ta: HTMLTextAreaElement): void {
    const c = this.findCard(card.item.actionKey) ?? card;
    const token = this.token(key);
    const start = Math.min(c.caret, c.text.length);
    const end = Math.min(Math.max(c.caretEnd, start), c.text.length);
    const text = c.text.slice(0, start) + token + c.text.slice(end);
    const caret = start + token.length;
    // Write the DOM value ourselves so the caret can be placed now: ngModel only syncs
    // the view on a later microtask, and re-writing the same value keeps the selection.
    ta.value = text;
    ta.focus();
    ta.setSelectionRange(caret, caret);
    this.patchCard(c.item.actionKey, { text, caret, caretEnd: caret });
  }

  onSave(card: TemplateCardState): void {
    this.saveCard(card).catch(() => {});
  }

  async saveCard(card: TemplateCardState): Promise<void> {
    const key = card.item.actionKey;
    const text = this.findCard(key)?.text ?? card.text;
    this.patchCard(key, { busy: true });
    try {
      const saved = await this.templateService.saveTemplate(key, text);
      this.patchCard(key, { item: saved, text: saved.template, caret: saved.template.length, caretEnd: saved.template.length });
      this.notify.success('Mensaje guardado');
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo guardar el mensaje');
      throw err;
    } finally {
      this.patchCard(key, { busy: false });
    }
  }

  onRestore(card: TemplateCardState): void {
    this.restoreCard(card).catch(() => {});
  }

  async restoreCard(card: TemplateCardState): Promise<void> {
    const c = this.findCard(card.item.actionKey) ?? card;
    const key = c.item.actionKey;
    if (!c.item.isCustom) {
      const text = c.item.defaultTemplate;
      this.patchCard(key, { text, caret: text.length, caretEnd: text.length });
      return;
    }
    const data: ConfirmDialogData = {
      title: 'Restaurar mensaje predeterminado',
      message: `Se reemplazará tu mensaje personalizado de «${c.item.label}» por el texto predeterminado. Esta acción no se puede deshacer.`,
      confirmLabel: 'Restaurar',
      icon: 'restart_alt',
      severity: 'primary',
    };
    const ok = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { width: '420px', data }).afterClosed());
    if (ok !== true) return;
    this.patchCard(key, { busy: true });
    try {
      const restored = await this.templateService.restoreDefault(key);
      this.patchCard(key, {
        item: restored, text: restored.template, caret: restored.template.length, caretEnd: restored.template.length,
      });
      this.notify.success('Mensaje restaurado');
    } catch (err: any) {
      this.notify.error(err?.error?.error ?? 'No se pudo restaurar el mensaje');
    } finally {
      this.patchCard(key, { busy: false });
    }
  }

  private findCard(actionKey: string): TemplateCardState | undefined {
    return this.cards().find(c => c.item.actionKey === actionKey);
  }

  private patchCard(actionKey: string, patch: Partial<TemplateCardState>): void {
    this.cards.update(list => list.map(c => (c.item.actionKey === actionKey ? { ...c, ...patch } : c)));
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
      const dirtyCards = this.cards().filter(c => this.isDirty(c));
      if (dirtyCards.some(c => this.isBlank(c))) {
        this.notify.warning('Hay un mensaje de WhatsApp vacío. Escríbelo o restáuralo antes de salir.');
        return false;
      }
      const tasks: Array<Promise<void> | null> = [
        this.fullName !== (this.initial.fullName ?? '')
            || this.email !== (this.initial.email ?? '') ? this.saveProfile() : null,
        this.title !== (this.initial.title ?? '')
            || this.signatureLabel !== (this.initial.signatureLabel ?? '') ? this.saveSignature() : null,
        this.currentPassword || this.newPassword || this.confirmPassword ? this.savePassword() : null,
        ...dirtyCards.map(c => this.saveCard(c)),
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