import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { UserMessageTemplate } from '../entities/UserMessageTemplate';
import { MessageTemplateAction } from '../entities/MessageTemplateAction';

const repo = () => AppDataSource.getRepository(UserMessageTemplate);
const actionRepo = () => AppDataSource.getRepository(MessageTemplateAction);

function toItem(action: MessageTemplateAction, custom: string | null) {
  return {
    actionKey: action.actionKey,
    label: action.label,
    description: action.description,
    placeholders: action.placeholders,
    defaultTemplate: action.defaultTemplate,
    template: custom ?? action.defaultTemplate,
    isCustom: custom !== null,
  };
}

async function findActiveAction(actionKey: unknown) {
  if (typeof actionKey !== 'string') return null;
  return actionRepo().findOne({ where: { actionKey, active: true } });
}

export async function findAllForUser(userId: number) {
  const actions = await actionRepo().find({
    where: { active: true },
    order: { sortOrder: 'ASC', actionKey: 'ASC' },
  });
  const rows = await repo().find({
    where: { userId, actionKey: In(actions.map(a => a.actionKey)) },
  });
  const byKey = new Map(rows.map(r => [r.actionKey, r.template]));
  return actions.map(a => toItem(a, byKey.get(a.actionKey) ?? null));
}

export async function upsert(userId: number, actionKey: unknown, template: unknown) {
  const action = await findActiveAction(actionKey);
  if (!action) {
    throw Object.assign(new Error(`Acción inválida: ${actionKey}`), { status: 400 });
  }
  if (typeof template !== 'string' || !template.trim()) {
    throw Object.assign(new Error('template es requerido'), { status: 400 });
  }

  let row = await repo().findOne({ where: { userId, actionKey: action.actionKey } });
  row = row ? Object.assign(row, { template }) : repo().create({ userId, actionKey: action.actionKey, template });
  const saved = await repo().save(row);
  return toItem(action, saved.template);
}

export async function restoreDefault(userId: number, actionKey: string) {
  const action = await findActiveAction(actionKey);
  if (!action) {
    throw Object.assign(new Error(`Acción no encontrada: ${actionKey}`), { status: 404 });
  }
  await repo().delete({ userId, actionKey: action.actionKey });
  return toItem(action, null);
}