import { CitationReasonSeverity } from '../../core/models/index';

export interface CitationReasonSeverityOption {
  value: CitationReasonSeverity;
  label: string;
  badgeClass: string;
}

export const CITATION_REASON_SEVERITY_OPTIONS: readonly CitationReasonSeverityOption[] = [
  { value: 'low',    label: 'Bajo',  badgeClass: 'badge-J' },
  { value: 'medium', label: 'Medio', badgeClass: 'badge-AT' },
  { value: 'high',   label: 'Alto',  badgeClass: 'badge-F' },
] as const;

export function citationReasonSeverityBadgeClass(severity: string): string {
  return CITATION_REASON_SEVERITY_OPTIONS.find(o => o.value === severity)?.badgeClass ?? 'badge-gray';
}
