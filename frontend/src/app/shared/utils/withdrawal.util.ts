import type {
  AcademicYear,
  CreateStudentWithdrawalPayload,
  StatsVisibility,
  WithdrawalItem,
} from '../../core/models/index';
import type { ResourceFlags } from './permission.util';

export const NOTES_MAX_LENGTH = 1000;

export interface StatsVisibilityOption {
  value: StatsVisibility;
  label: string;
  help: string;
}

export const STATS_VISIBILITY_OPTIONS: readonly StatsVisibilityOption[] = [
  {
    value: 'until_withdrawal',
    label: 'Hasta la fecha de retiro',
    help: 'Sus faltas y registros hasta la fecha de retiro siguen contando en reportes y estadísticas.',
  },
  {
    value: 'until_quarter_start',
    label: 'Hasta el inicio del trimestre',
    help: 'Solo cuentan sus registros anteriores al trimestre en que se retira.',
  },
  {
    value: 'whole_year',
    label: 'Ocultar todo el año',
    help: 'Ningún registro suyo de este año lectivo aparece en reportes ni estadísticas.',
  },
];

export interface WithdrawalDateBounds {
  min: string | null;
  max: string;
  defaultDate: string | null;
}

export interface WithdrawalForm {
  date: string | null;
  reasonId: number | null;
  notes: string;
  statsVisibility: StatsVisibility;
}

export type WithdrawalFormError =
  | 'year_not_started'
  | 'date_required'
  | 'date_future'
  | 'date_after_year'
  | 'date_before_year'
  | 'reason_required'
  | 'notes_too_long';

export const WITHDRAWAL_FORM_ERROR_MESSAGES: Record<Exclude<WithdrawalFormError, 'reason_required'>, string> = {
  year_not_started: 'El año lectivo aún no ha comenzado.',
  date_required: 'La fecha de retiro es obligatoria.',
  date_future: 'La fecha de retiro no puede ser futura.',
  date_after_year: 'La fecha debe estar dentro del año lectivo.',
  date_before_year: 'La fecha debe estar dentro del año lectivo.',
  notes_too_long: 'Las observaciones no pueden superar 1000 caracteres.',
};

export type WithdrawalReasonsState = 'loading' | 'ready' | 'error';

// The reason select shows while the reasons load and when there is at least
// one active reason; otherwise the dialog shows a notice in its place.
export function showsReasonSelect(state: WithdrawalReasonsState, activeCount: number): boolean {
  return state === 'loading' || (state === 'ready' && activeCount > 0);
}

export interface WithdrawalErrorOutcome {
  message: string;
  closeAndReload: boolean;
}

// An academic year that has not started yet has no valid day to pick.
export function withdrawalYearNotStarted(min: string | null, max: string): boolean {
  return !!min && min > max;
}

// The date of a withdrawal is always required, except when the academic year
// has not started yet: there is no day to pick in that case, and the dialog
// says so with a notice instead of an error.
export function withdrawalDateRequired(bounds: WithdrawalDateBounds): boolean {
  return !withdrawalYearNotStarted(bounds.min, bounds.max);
}

// The date of a withdrawal can never be in the future and always stays
// inside the academic year of the enrollment. A missing bound on either side
// means "no bound" — the same rule the backend applies.
export function withdrawalDateBounds(
  today: string,
  year: Pick<AcademicYear, 'startDate' | 'endDate'> | null,
): WithdrawalDateBounds {
  const min = year?.startDate ?? null;
  const end = year?.endDate ?? null;
  const max = end && end < today ? end : today;
  const yearNotStarted = withdrawalYearNotStarted(min, max);
  return { min, max, defaultDate: yearNotStarted ? null : max };
}

// The first problem of the form, in the order the fields are read.
export function validateWithdrawalForm(
  form: WithdrawalForm,
  bounds: WithdrawalDateBounds,
  today: string,
): WithdrawalFormError | null {
  if (withdrawalYearNotStarted(bounds.min, bounds.max)) return 'year_not_started';

  const date = form.date?.trim() ?? '';
  if (!date) return 'date_required';
  if (date > today) return 'date_future';
  if (date > bounds.max) return 'date_after_year';
  if (bounds.min && date < bounds.min) return 'date_before_year';

  if (!form.reasonId) return 'reason_required';
  if (form.notes.trim().length > NOTES_MAX_LENGTH) return 'notes_too_long';
  return null;
}

// Assumes the form already passed the validation.
export function buildWithdrawalPayload(
  enrollmentId: number,
  form: WithdrawalForm,
): CreateStudentWithdrawalPayload {
  const notes = form.notes.trim();
  return {
    enrollmentId,
    withdrawalDate: form.date!,
    reasonId: form.reasonId!,
    notes: notes.length ? notes : null,
    statsVisibility: form.statsVisibility,
  };
}

export function formatWithdrawalDate(date: string): string {
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}

export function withdrawalErrorOutcome(err: unknown): WithdrawalErrorOutcome {
  const status = (err as { status?: number } | null)?.status;
  const message = (err as { error?: { error?: string } } | null)?.error?.error;

  if (status === 404) {
    return { message: 'La matrícula ya no existe o no pertenece a tus cursos.', closeAndReload: true };
  }
  if (status === 409) {
    return { message: message ?? 'La matrícula ya está retirada', closeAndReload: true };
  }
  if ((status === 400 || status === 403) && message) {
    return { message, closeAndReload: false };
  }
  return { message: 'No se pudo retirar al estudiante. Intenta nuevamente.', closeAndReload: false };
}

// ----- The screen of the withdrawn students -----

export type WithdrawalStatusFilter = 'active' | 'reverted' | 'all';

export const WITHDRAWAL_STATUS_OPTIONS: readonly { value: WithdrawalStatusFilter; label: string }[] = [
  { value: 'active', label: 'Retirados' },
  { value: 'reverted', label: 'Reincorporados' },
  { value: 'all', label: 'Todos' },
];

export interface WithdrawalListFilters {
  status: WithdrawalStatusFilter;
  academicYearId: number | null;
  courseId: number | null;
  reasonId: number | null;
  dateFrom: string | null;
  dateTo: string | null;
}

// The backend reads the filters from the query string and ignores the empty
// ones, so only the filters that are actually set travel with the request.
export function buildWithdrawalListQuery(filters: WithdrawalListFilters): string {
  const params = new URLSearchParams();
  params.set('status', filters.status);
  if (filters.academicYearId !== null && filters.academicYearId !== undefined) {
    params.set('academic_year_id', String(filters.academicYearId));
  }
  if (filters.courseId !== null && filters.courseId !== undefined) {
    params.set('course_id', String(filters.courseId));
  }
  if (filters.reasonId !== null && filters.reasonId !== undefined) {
    params.set('reason_id', String(filters.reasonId));
  }
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  return params.toString();
}

export function statsVisibilityLabel(value: StatsVisibility): string {
  return STATS_VISIBILITY_OPTIONS.find(o => o.value === value)?.label ?? value;
}

// The server sends the moment of the reinstatement in UTC; the day the user
// saw it happen is the one of their own clock.
export function formatRevertedDate(iso: string): string {
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return iso;
  const day = String(moment.getDate()).padStart(2, '0');
  const month = String(moment.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${moment.getFullYear()}`;
}

export function withdrawnByName(item: Pick<WithdrawalItem, 'withdrawnBy'>): string {
  return item.withdrawnBy?.fullName || '—';
}

export interface WithdrawalRowActions {
  canReinstate: boolean;
  canChangeVisibility: boolean;
}

// A reincorporated student has nothing left to change: both actions belong
// to the active withdrawals only, and each one to its own permission.
export function withdrawalRowActions(
  flags: ResourceFlags,
  item: Pick<WithdrawalItem, 'revertedAt'>,
): WithdrawalRowActions {
  const active = item.revertedAt === null;
  return {
    canReinstate: active && flags.canDelete,
    canChangeVisibility: active && flags.canUpdate,
  };
}

export function filterWithdrawals<T extends Pick<WithdrawalItem, 'studentName' | 'idNumber'>>(
  items: readonly T[],
  term: string,
): T[] {
  const query = term.trim().toLowerCase();
  if (!query) return [...items];
  return items.filter(item =>
    item.studentName.toLowerCase().includes(query)
    || (item.idNumber ?? '').toLowerCase().includes(query),
  );
}

export function withdrawalListErrorMessage(err: unknown): string {
  const status = (err as { status?: number } | null)?.status;
  const message = (err as { error?: { error?: string } } | null)?.error?.error;

  if ((status === 400 || status === 403) && message) return message;
  return 'No se pudieron cargar los retiros.';
}

// A withdrawal that is gone or already reincorporated leaves the list, so the
// list is read again. A rejected request keeps the dialog open with what the
// user chose.
export function withdrawalMutationErrorOutcome(err: unknown, fallback: string): WithdrawalErrorOutcome {
  const status = (err as { status?: number } | null)?.status;
  const message = (err as { error?: { error?: string } } | null)?.error?.error;

  if (status === 404 || status === 409) {
    return { message: message ?? fallback, closeAndReload: true };
  }
  if ((status === 400 || status === 403) && message) {
    return { message, closeAndReload: false };
  }
  return { message: fallback, closeAndReload: false };
}

// The backend answers "Student not found" in English, so the record of the
// withdrawals of a student always fails with this message.
export const WITHDRAWAL_RECORD_ERROR = 'No se pudo cargar el registro de retiros.';
