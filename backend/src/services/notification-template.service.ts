import { AppDataSource } from '../data-source';
import { UserMessageTemplate } from '../entities/UserMessageTemplate';
import { NOTIFICATION_ACTION_KEYS } from './user.service';

const repo = () => AppDataSource.getRepository(UserMessageTemplate);

export async function findAllForUser(userId: number) {
  const rows = await repo().find({ where: { userId }, order: { actionKey: 'ASC' } });
  return rows.map(r => ({ actionKey: r.actionKey, template: r.template }));
}

export async function upsert(userId: number, actionKey: unknown, template: unknown) {
  if (typeof actionKey !== 'string' || !NOTIFICATION_ACTION_KEYS.includes(actionKey)) {
    throw Object.assign(new Error(`Acción inválida: ${actionKey}`), { status: 400 });
  }
  if (typeof template !== 'string' || !template.trim()) {
    throw Object.assign(new Error('template es requerido'), { status: 400 });
  }

  let row = await repo().findOne({ where: { userId, actionKey } });
  row = row ? Object.assign(row, { template }) : repo().create({ userId, actionKey, template });
  const saved = await repo().save(row);
  return { actionKey: saved.actionKey, template: saved.template };
}