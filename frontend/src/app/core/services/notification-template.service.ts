import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NotificationTemplate } from '../models/index';

export const DEFAULT_TEMPLATES: Record<string, string> = {
  absences:
    'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.',
  citations:
    'Estimado apoderado, se ha registrado una citación para {{nombre}} el {{fecha}}. ' +
    'Por favor confirmar asistencia.',
};

@Injectable({ providedIn: 'root' })
export class NotificationTemplateService {
  private readonly http = inject(HttpClient);

  private readonly _templates = signal<Record<string, string>>({});
  private loadPromise: Promise<void> | null = null;

  readonly templates = this._templates.asReadonly();

  load(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = firstValueFrom(this.http.get<NotificationTemplate[]>('/api/notification-templates'))
        .then(list => {
          const map: Record<string, string> = {};
          for (const t of list) map[t.actionKey] = t.template;
          this._templates.set(map);
        })
        .catch(err => {
          this.loadPromise = null;
          throw err;
        });
    }
    return this.loadPromise;
  }

  getTemplate(actionKey: string): string {
    return this._templates()[actionKey] ?? DEFAULT_TEMPLATES[actionKey] ?? '';
  }

  async saveTemplate(actionKey: string, template: string): Promise<void> {
    const saved = await firstValueFrom(
      this.http.put<NotificationTemplate>('/api/notification-templates', { actionKey, template }),
    );
    this._templates.update(m => ({ ...m, [saved.actionKey]: saved.template }));
  }
}
