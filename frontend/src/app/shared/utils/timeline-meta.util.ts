import type { TimelineEvent } from '../../core/models/index';

export interface TypeMeta {
  icon: string;
  classes: string;
  rotate: string;
}

export const TYPE_META: Record<TimelineEvent['type'], TypeMeta> = {
  enrollment:    { icon: 'school',     classes: 'bg-indigo-50 text-indigo-600 border-indigo-200',   rotate: '1deg' },
  absence:       { icon: 'event_busy', classes: 'bg-red-50 text-red-600 border-red-200',             rotate: '-2deg' },
  tardy:         { icon: 'schedule',   classes: 'bg-amber-50 text-amber-600 border-amber-200',       rotate: '2deg' },
  justification: { icon: 'fact_check', classes: 'bg-emerald-50 text-emerald-600 border-emerald-200', rotate: '-1deg' },
  citation:      { icon: 'campaign',   classes: 'bg-sky-50 text-sky-700 border-sky-200',             rotate: '1.5deg' },
  withdrawal:    { icon: 'logout',     classes: 'bg-pink-50 text-pink-600 border-pink-200',          rotate: '-1.5deg' },
  reinstatement: { icon: 'how_to_reg', classes: 'bg-teal-50 text-teal-700 border-teal-200',          rotate: '1deg' },
};

export const NEUTRAL_META: TypeMeta = { icon: 'timeline', classes: 'bg-gray-50 text-gray-600 border-gray-200', rotate: '0deg' };

export function timelineMeta(type: string): TypeMeta {
  return TYPE_META[type as TimelineEvent['type']] ?? NEUTRAL_META;
}
