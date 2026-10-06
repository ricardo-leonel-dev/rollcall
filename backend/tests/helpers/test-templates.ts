import { AppDataSource } from '../../src/data-source';
import { UserMessageTemplate } from '../../src/entities/UserMessageTemplate';

export async function getTemplatesForUser(userId: number): Promise<UserMessageTemplate[]> {
  return AppDataSource.getRepository(UserMessageTemplate).find({ where: { userId } });
}

export async function getTemplateForUserAction(userId: number, actionKey: string): Promise<UserMessageTemplate | null> {
  return AppDataSource.getRepository(UserMessageTemplate).findOne({ where: { userId, actionKey } });
}

export async function deleteAllTemplatesForUser(userId: number): Promise<void> {
  await AppDataSource.getRepository(UserMessageTemplate).delete({ userId });
}

export async function deleteTestTemplates(): Promise<void> {
  await AppDataSource.getRepository(UserMessageTemplate)
    .createQueryBuilder()
    .delete()
    .where("user_id IN (SELECT id FROM users WHERE username LIKE 'testuser\\_%' ESCAPE '\\')")
    .execute();
}