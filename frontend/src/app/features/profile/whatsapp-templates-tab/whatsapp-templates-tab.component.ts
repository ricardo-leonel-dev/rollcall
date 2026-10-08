import { Component, ChangeDetectionStrategy, Signal, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { NotificationTemplateItem } from '../../../core/models/index';
import { previewTemplate } from '../../../shared/utils/template.util';
import { NotificationService } from '../../../core/services/notification.service';
import { NotificationTemplateService } from '../../../core/services/notification-template.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface TemplateCardState {
  item:     NotificationTemplateItem;
  text:     string;
  caret:    number;
  caretEnd: number;
  busy:     boolean;
}

export interface DirtySaveResult { key: string; ok: boolean; }

@Component({
  standalone: true,
  selector: 'app-whatsapp-templates-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, TextFieldModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    LoadingSpinnerComponent,
  ],
  styles: [`
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
    .preview-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 6px; }

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
      .tpl-card { padding: 16px; }
      .tpl-actions { flex-direction: column-reverse; }
      .tpl-actions button { width: 100%; }
    }

    .state { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 48px 24px; gap: 6px; }
    .state mat-icon { font-size: 32px; width: 32px; height: 32px; color: var(--muted); margin-bottom: 6px; }
    .state-title { font-family: 'Nunito', sans-serif; font-size: 15px; font-weight: 700; color: var(--ink); margin: 0; }
    .state-body { font-size: 13px; color: var(--muted-strong); margin: 0; }
  `],
  template: `
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
  `,
})
export class WhatsappTemplatesTabComponent {
  private readonly notify = inject(NotificationService);
  private readonly templateService = inject(NotificationTemplateService);
  private readonly dialog = inject(MatDialog);

  readonly templatesStatus = signal<'loading' | 'ready' | 'error'>('loading');
  readonly cards = signal<TemplateCardState[]>([]);

  /** Public: parent reads this for the Mensajes tab-label dirty dot (R21). */
  readonly dirty: Signal<boolean> = computed(() => this.cards().some(c => this.isDirty(c)));

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

  /**
   * Public: parent calls this from its canDeactivate save branch. Returns one
   * entry per dirty card so the parent can navigate only if every save fulfills.
   * Blank dirty cards are NOT saved here — the parent surfaces the warning
   * toast (R43) before reaching this method.
   */
  async saveDirtyCards(): Promise<DirtySaveResult[]> {
    const dirtyCards = this.cards().filter(c => this.isDirty(c) && !this.isBlank(c));
    const results = await Promise.allSettled(dirtyCards.map(c => this.saveCard(c)));
    return dirtyCards.map((c, i) => ({ key: c.item.actionKey, ok: results[i].status === 'fulfilled' }));
  }

  /** Public: parent uses this to gate the R43 warning before any save. */
  hasBlankDirtyCard(): boolean {
    return this.cards().some(c => this.isDirty(c) && this.isBlank(c));
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
}