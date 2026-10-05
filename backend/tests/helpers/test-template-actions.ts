import { AppDataSource } from '../../src/data-source';
import { MessageTemplateAction } from '../../src/entities/MessageTemplateAction';

export async function createTestAction(opts: {
  suffix: string;
  sortOrder?: number;
  active?: boolean;
  defaultTemplate?: string;
}): Promise<MessageTemplateAction> {
  const actionKey = `testaction_${opts.suffix}`;
  const repo = AppDataSource.getRepository(MessageTemplateAction);
  const existing = await repo.findOne({ where: { actionKey } });
  if (existing) await repo.delete({ actionKey });
  const row = repo.create({
    actionKey,
    label: `Test action ${opts.suffix}`,
    description: null,
    placeholders: [],
    defaultTemplate: opts.defaultTemplate ?? `default for ${opts.suffix}`,
    sortOrder: opts.sortOrder ?? 0,
    active: opts.active ?? true,
  });
  return repo.save(row);
}

export async function deleteTestActions(): Promise<void> {
  await AppDataSource.query(
    "DELETE FROM user_message_templates WHERE action_key LIKE 'testaction\\_%' ESCAPE '\\'"
  );
  await AppDataSource.getRepository(MessageTemplateAction)
    .createQueryBuilder()
    .delete()
    .where("action_key LIKE 'testaction\\_%' ESCAPE '\\'")
    .execute();
}