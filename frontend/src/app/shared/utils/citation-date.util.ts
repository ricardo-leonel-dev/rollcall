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

function to12h(h: number): { h12: number; period: 'AM' | 'PM' } {
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, period };
}

function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  const { h12, period } = to12h(Number(hStr));
  return `${String(h12).padStart(2, '0')}:${mStr} ${period}`;
}

function formatCreatedAtShort(createdAt: string): string {
  const d = new Date(createdAt);
  const { h12, period } = to12h(d.getHours());
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()} ${String(h12).padStart(2, '0')}:${minutes} ${period}`;
}

export function formatCitationDateLabel(date: string, time: string, createdAt: string): string {
  return `Agendado el ${formatCreatedAtShort(createdAt)} para el ${formatLongDateEs(date)} a las ${formatTime12h(time)}`;
}

export function formatCitationDateLabelShort(date: string, time: string): string {
  return `${formatLongDateEs(date)} a las ${formatTime12h(time)}`;
}
