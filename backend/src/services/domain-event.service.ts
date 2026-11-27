import { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';

export type DomainEventType =
  | 'AbsenceRecorded'
  | 'AbsenceUpdated'
  | 'AbsenceDeleted'
  | 'CitationCreated'
  | 'CitationUpdated'
  | 'CitationClosed'
  | 'CitationDeleted'
  | 'EnrollmentCreated'
  | 'EnrollmentUpdated'
  | 'EnrollmentDeleted'
  | 'JustificationCreated'
  | 'JustificationUpdated'
  | 'JustificationDeleted'
  | 'StudentWithdrawn'
  | 'StudentReinstated'
  | 'WithdrawalVisibilityChanged';

export interface DomainEventInput {
  institutionId: number;
  eventType: DomainEventType;
  entityType: 'absence' | 'citation' | 'enrollment' | 'justification' | 'student_withdrawal';
  entityId: number;
  actorUserId: number | null;
  payload: { before: Record<string, unknown> | null; after: Record<string, unknown> | null } & Record<string, unknown>;
}

// The audit row travels with the change it describes: it is written on the
// caller's transaction, so the event exists if and only if the action
// committed. One statement for the whole batch keeps the write cost flat no
// matter how many rows the action touched.
export async function recordEvents(em: EntityManager, events: DomainEventInput[]): Promise<void> {
  if (!events.length) return;

  const params: unknown[] = [];
  const tuples = events.map((e) => {
    const at = params.length + 1;
    params.push(e.institutionId, e.eventType, e.entityType, e.entityId, e.actorUserId, JSON.stringify(e.payload));
    return `($${at}, $${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}::jsonb)`;
  });

  await em.query(
    `INSERT INTO domain_events (institution_id, event_type, entity_type, entity_id, actor_user_id, payload)
     VALUES ${tuples.join(', ')}`,
    params,
  );
}

export interface AuditEventQuery {
  limit?: unknown;
  entity_type?: unknown;
  event_type?: unknown;
  entity_id?: unknown;
  actor_user_id?: unknown;
  before_id?: unknown;
  date_from?: unknown;
  date_to?: unknown;
}

export interface AuditEventItem {
  id: number;
  eventType: string;
  entityType: string;
  entityId: number;
  actorUserId: number | null;
  actorUsername: string | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// date_from/date_to name school days, so they are local days, not UTC days.
// The bounds become instants compared against the bare column, which keeps the
// (institution_id, occurred_at) index usable.
export const LOCAL_TIME_ZONE = 'America/Guayaquil';

function invalidQuery(): Error {
  return Object.assign(new Error('Parámetros de consulta inválidos'), { status: 400 });
}

function single(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const raw = single(value);
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw invalidQuery();
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw invalidQuery();
  return parsed;
}

function parseDate(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const raw = single(value);
  if (typeof raw !== 'string' || !DATE_RE.test(raw)) throw invalidQuery();
  const [year, month, day] = raw.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw invalidQuery();
  }
  return raw;
}

function parseText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const raw = single(value);
  if (typeof raw !== 'string' || !raw.length || raw.length > 64) throw invalidQuery();
  return raw;
}

function parseLimit(value: unknown): number {
  if (value === undefined) return 50;
  const raw = single(value);
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw invalidQuery();
  const parsed = Number(raw);
  if (parsed < 1 || parsed > 200) throw invalidQuery();
  return parsed;
}

// Keyset pagination: the page walks backwards from the cursor instead of
// counting rows, so the cost of a page does not grow with the history size.
export async function findAll(
  institutionId: number,
  query: AuditEventQuery,
): Promise<{ items: AuditEventItem[]; nextBeforeId: number | null }> {
  const limit = parseLimit(query.limit);
  const entityType = parseText(query.entity_type);
  const eventType = parseText(query.event_type);
  const entityId = parsePositiveInt(query.entity_id);
  const actorUserId = parsePositiveInt(query.actor_user_id);
  const beforeId = parsePositiveInt(query.before_id);
  const dateFrom = parseDate(query.date_from);
  const dateTo = parseDate(query.date_to);

  const params: any[] = [institutionId];
  const conditions: string[] = ['e.institution_id = $1'];

  if (entityType !== undefined) { params.push(entityType); conditions.push(`e.entity_type = $${params.length}`); }
  if (eventType !== undefined) { params.push(eventType); conditions.push(`e.event_type = $${params.length}`); }
  if (entityId !== undefined) { params.push(entityId); conditions.push(`e.entity_id = $${params.length}`); }
  if (actorUserId !== undefined) { params.push(actorUserId); conditions.push(`e.actor_user_id = $${params.length}`); }
  if (dateFrom !== undefined) { params.push(dateFrom); conditions.push(`e.occurred_at >= (($${params.length}::date)::timestamp AT TIME ZONE '${LOCAL_TIME_ZONE}')`); }
  if (dateTo !== undefined) { params.push(dateTo); conditions.push(`e.occurred_at < (($${params.length}::date + 1)::timestamp AT TIME ZONE '${LOCAL_TIME_ZONE}')`); }
  if (beforeId !== undefined) {
    params.push(beforeId);
    conditions.push(
      `(e.occurred_at, e.id) < (SELECT occurred_at, id FROM domain_events WHERE id = $${params.length} AND institution_id = $1)`,
    );
  }

  params.push(limit);

  const rows = await AppDataSource.query(
    `SELECT e.id, e.event_type, e.entity_type, e.entity_id, e.actor_user_id,
            u.username AS actor_username, e.payload, e.occurred_at
       FROM domain_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.occurred_at DESC, e.id DESC
      LIMIT $${params.length}`,
    params,
  );

  const items: AuditEventItem[] = rows.map((r: any) => ({
    id: Number(r.id),
    eventType: r.event_type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    actorUserId: r.actor_user_id,
    actorUsername: r.actor_username ?? null,
    payload: r.payload,
    occurredAt: r.occurred_at,
  }));

  return {
    items,
    nextBeforeId: items.length === limit ? items[items.length - 1].id : null,
  };
}
