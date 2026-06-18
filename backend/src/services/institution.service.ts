import fs from 'fs';
import path from 'path';
import { AppDataSource } from '../data-source';
import { Institution } from '../entities/Institution';

const repo = () => AppDataSource.getRepository(Institution);
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function assertValidColors(data: Partial<{ primaryColor: string | null; secondaryColor: string | null }>) {
  for (const value of [data.primaryColor, data.secondaryColor]) {
    if (value != null && !HEX_COLOR.test(value)) {
      throw Object.assign(new Error('El color debe tener formato #RRGGBB'), { status: 400 });
    }
  }
}

export async function findAll() {
  return repo().find({ order: { name: 'ASC' } });
}

export async function findById(id: number) {
  const inst = await repo().findOne({ where: { id } });
  if (!inst) throw Object.assign(new Error('Institution not found'), { status: 404 });
  return inst;
}

export async function create(data: { name: string; primaryColor?: string | null; secondaryColor?: string | null }) {
  assertValidColors(data);
  const inst = repo().create({
    name: data.name,
    isActive: true,
    primaryColor: data.primaryColor ?? null,
    secondaryColor: data.secondaryColor ?? null,
  });
  return repo().save(inst);
}

export async function update(id: number, data: Partial<{ name: string; isActive: boolean; primaryColor: string | null; secondaryColor: string | null }>) {
  assertValidColors(data);
  const inst = await findById(id);
  Object.assign(inst, data);
  return repo().save(inst);
}

export async function updateLogo(id: number, logoUrl: string) {
  const inst = await findById(id);

  // Clean up the previous uploaded file so they don't pile up on disk.
  if (inst.logoUrl?.startsWith('/api/uploads/logos/')) {
    const oldPath = path.join(process.cwd(), 'uploads', 'logos', path.basename(inst.logoUrl));
    fs.unlink(oldPath, () => {});
  }

  inst.logoUrl = logoUrl;
  return repo().save(inst);
}

export async function remove(id: number) {
  const inst = await findById(id);
  inst.isActive = false;
  await repo().save(inst);
}
