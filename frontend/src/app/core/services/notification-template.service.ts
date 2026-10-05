import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NotificationTemplateItem } from '../models/index';
import { FALLBACK_TEMPLATES, fillTemplate } from '../../shared/utils/template.util';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class NotificationTemplateService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _items = signal<NotificationTemplateItem[]>([]);
  readonly items = this._items.asReadonly();

  private loadPromise: Promise<void> | null = null;
  private loadedForUserId: number | null = null;

  load(): Promise<void> {
    const userId = this.auth.currentUser()?.id ?? null;
    // Keyed by user: on a shared computer, logout() only navigates, so without this
    // user B would keep user A's custom messages cached.
    if (this.loadPromise && this.loadedForUserId !== userId) {
      this.loadPromise = null;
      this._items.set([]);
    }
    if (!this.loadPromise) {
      this.loadedForUserId = userId;
      const promise: Promise<void> = firstValueFrom(
        this.http.get<NotificationTemplateItem[]>('/api/notification-templates'),
      )
        .then(list => {
          if (this.loadPromise === promise) this._items.set(list);
        })
        .catch(err => {
          if (this.loadPromise === promise) this.loadPromise = null;
          throw err;
        });
      this.loadPromise = promise;
    }
    return this.loadPromise;
  }

  /** Never rejects: used by the WhatsApp consumers to prefetch and to retry. */
  async ensureLoaded(): Promise<void> {
    try {
      await this.load();
    } catch {
      // consumers fall back through renderTemplate
    }
  }

  getTemplate(actionKey: string): string {
    return this.findItem(actionKey)?.template ?? '';
  }

  hasTemplate(actionKey: string): boolean {
    return !!this.findItem(actionKey);
  }

  renderTemplate(actionKey: string, vars: Record<string, string>): string {
    const item = this.findItem(actionKey);
    if (item) return fillTemplate(item.template, vars);
    console.warn(`[NotificationTemplateService] catalog unavailable for "${actionKey}"; using emergency fallback text`);
    return fillTemplate(FALLBACK_TEMPLATES[actionKey] ?? '', vars);
  }

  async saveTemplate(actionKey: string, template: string): Promise<NotificationTemplateItem> {
    const saved = await firstValueFrom(
      this.http.put<NotificationTemplateItem>('/api/notification-templates', { actionKey, template }),
    );
    this.replace(saved);
    return saved;
  }

  async restoreDefault(actionKey: string): Promise<NotificationTemplateItem> {
    const restored = await firstValueFrom(
      this.http.delete<NotificationTemplateItem>(`/api/notification-templates/${encodeURIComponent(actionKey)}`),
    );
    this.replace(restored);
    return restored;
  }

  private findItem(actionKey: string): NotificationTemplateItem | undefined {
    return this._items().find(i => i.actionKey === actionKey);
  }

  private replace(item: NotificationTemplateItem): void {
    this._items.update(list => list.map(i => (i.actionKey === item.actionKey ? item : i)));
  }
}
