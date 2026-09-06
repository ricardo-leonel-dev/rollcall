import { dateStringToDate } from './date.util';

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatLongDateEs(dateStr: string): string {
  const d = dateStringToDate(dateStr)!;
  return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} del ${d.getFullYear()}`;
}

function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${mStr} ${period}`;
}

function withTimeSuffix(base: string, time: string | null): string {
  return time ? `${base} a las ${formatTime12h(time)}` : base;
}

export function formatCitationDateLabel(dateFrom: string, dateTo: string, time: string | null): string {
  const base = dateFrom === dateTo
    ? `Agendado el ${formatLongDateEs(dateFrom)}`
    : `Agendado entre ${formatLongDateEs(dateFrom)} y el ${formatLongDateEs(dateTo)}`;
  return withTimeSuffix(base, time);
}

export function formatCitationDateLabelShort(dateFrom: string, dateTo: string, time: string | null): string {
  const base = dateFrom === dateTo
    ? formatLongDateEs(dateFrom)
    : `${formatLongDateEs(dateFrom)} – ${formatLongDateEs(dateTo)}`;
  return withTimeSuffix(base, time);
}
