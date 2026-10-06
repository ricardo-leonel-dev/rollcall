import { dateStringToDate } from './date.util';

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatLongDateEsFromDate(d: Date): string {
  return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} del ${d.getFullYear()}`;
}

function formatLongDateEs(dateStr: string): string {
  return formatLongDateEsFromDate(dateStringToDate(dateStr)!);
}

function to12h(h: number): { h12: number; period: 'AM' | 'PM' } {
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, period };
}

function formatTime12hFromParts(h: number, m: number): string {
  const { h12, period } = to12h(h);
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  return formatTime12hFromParts(Number(hStr), Number(mStr));
}

export function formatCitationDateLabelShort(date: string, time: string): string {
  return `${formatLongDateEs(date)} a las ${formatTime12h(time)}`;
}

export function formatCitationTargetLabel(date: string, time: string): string {
  return `Cita: ${formatCitationDateLabelShort(date, time)}`;
}

export function formatCitationCreatedAtLabel(createdAt: string): string {
  const d = new Date(createdAt);
  return `Registrada el ${formatLongDateEsFromDate(d)} a las ${formatTime12hFromParts(d.getHours(), d.getMinutes())}`;
}
