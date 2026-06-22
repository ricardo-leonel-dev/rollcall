import { AppDataSource } from '../data-source';
import { Guardian } from '../entities/Guardian';
import { ILike, IsNull } from 'typeorm';

const repo = () => AppDataSource.getRepository(Guardian);

// Derived from phone, not user-editable directly — keeps the WhatsApp deep
// link in sync whenever the phone number changes (Ecuador mobile numbers:
// drop the leading 0, prefix the 593 country code).
export function buildWhatsappLink(phone?: string | null): string | null {
  if (!phone) return null;
  return `https://wa.me/593${phone.replace(/^0/, '')}`;
}

export async function findAll(institutionId: number, search?: string) {
  const where: any = { institutionId, deletedAt: IsNull() };
  if (search) where.name = ILike(`%${search}%`);
  return repo().find({ where, order: { name: 'ASC' } });
}

export async function findById(institutionId: number, id: number) {
  const g = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!g) throw Object.assign(new Error('Guardian not found'), { status: 404 });
  return g;
}

export async function create(institutionId: number, data: {
  name: string; idNumber?: string; phone?: string;
  whatsappLink?: string; email?: string;
}) {
  const g = repo().create({ ...data, institutionId, name: data.name.toUpperCase(), whatsappLink: buildWhatsappLink(data.phone) });
  return repo().save(g);
}

export async function update(institutionId: number, id: number, data: Partial<{
  name: string; idNumber: string; phone: string;
  whatsappLink: string; email: string; isActive: boolean;
}>) {
  const g = await findById(institutionId, id);
  if (data.name) data.name = data.name.toUpperCase();
  Object.assign(g, data);
  if (data.phone !== undefined) g.whatsappLink = buildWhatsappLink(data.phone);
  return repo().save(g);
}

export async function remove(institutionId: number, id: number) {
  const g = await findById(institutionId, id);
  g.deletedAt = new Date();
  g.isActive = false;
  await repo().save(g);
}
