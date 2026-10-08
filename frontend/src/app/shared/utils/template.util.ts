import { NotificationTemplatePlaceholder } from '../../core/models/index';

// EMERGENCY COPY — used ONLY by NotificationTemplateService.renderTemplate when the
// backend catalog (GET /api/notification-templates) has no item for the action,
// i.e. the catalog failed to load even after a retry. It is NOT the default shown or
// edited in /profile (that always comes from the catalog's `defaultTemplate`).
// Copied verbatim from ../backend postgres/{24,25}_message_template_actions.sql
// (24 = absences; 25 = citations with the split {{fecha}} + {{hora}} contract); it
// MAY DRIFT if the catalog defaults are later changed — the catalog wins whenever it
// loads. Keep each value a single-line literal (the verification grep depends on it).
export const FALLBACK_TEMPLATES: Readonly<Record<string, string>> = {
  absences: 'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.',
  citations: 'Estimado representante, se le cita a la institución el {{fecha}} a las {{hora}} para tratar un asunto relacionado con {{nombre}}. Por favor confirmar asistencia.',
};

// String pattern + replacer function: both the token and the value are matched/inserted
// literally (a plain string value would interpret `$&` / `$1` sequences).
export function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{{${key}}}`, () => value);
  return out;
}

export const PLACEHOLDER_SAMPLES: Record<string, string> = {
  nombre: 'JUAN PÉREZ',
  fecha:  'miércoles 17 de junio de 2026',
  hora:   '10:30 AM',
  tipo:   'una falta',
  curso:  'OCTAVO "A"',
};

export function previewTemplate(template: string, placeholders: NotificationTemplatePlaceholder[]): string {
  const vars: Record<string, string> = {};
  for (const p of placeholders) vars[p.key] = PLACEHOLDER_SAMPLES[p.key] ?? `[${p.label}]`;
  return fillTemplate(template, vars);
}
