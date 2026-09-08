import fs from 'fs';
import path from 'path';
import { AppDataSource } from '../data-source';
import { Institution } from '../entities/Institution';

const repo = () => AppDataSource.getRepository(Institution);
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export type InstitutionStats = { students: number; courses: number; users: number };
export type InstitutionWithStats = Institution & { stats: InstitutionStats };

function assertValidColors(data: Partial<{ primaryColor: string | null; secondaryColor: string | null }>) {
  for (const value of [data.primaryColor, data.secondaryColor]) {
    if (value != null && !HEX_COLOR.test(value)) {
      throw Object.assign(new Error('El color debe tener formato #RRGGBB'), { status: 400 });
    }
  }
}

// Counts are filtered with `deleted_at IS NULL` only (no `is_active`) on
// purpose — mirrors the existing findAll of student/course/user services
// (see design.md §"Decisión: filtro de is_active").
async function attachStats(institutions: Institution[]): Promise<InstitutionWithStats[]> {
  const ids = institutions.map(i => i.id);

  const [studentsRows, coursesRows, usersRows] = await Promise.all([
    AppDataSource.query(
      `SELECT institution_id, COUNT(*)::int AS count
         FROM students
        WHERE institution_id = ANY($1) AND deleted_at IS NULL
        GROUP BY institution_id`,
      [ids],
    ),
    AppDataSource.query(
      `SELECT institution_id, COUNT(*)::int AS count
         FROM courses
        WHERE institution_id = ANY($1) AND deleted_at IS NULL
        GROUP BY institution_id`,
      [ids],
    ),
    AppDataSource.query(
      `SELECT institution_id, COUNT(*)::int AS count
         FROM users
        WHERE institution_id = ANY($1) AND deleted_at IS NULL
        GROUP BY institution_id`,
      [ids],
    ),
  ]);

  const byInst = (rows: { institution_id: number | string; count: number | string }[]) =>
    new Map<number, number>(rows.map(r => [Number(r.institution_id), Number(r.count)]));

  const studentsById = byInst(studentsRows);
  const coursesById = byInst(coursesRows);
  const usersById = byInst(usersRows);

  return institutions.map(i => ({
    ...i,
    stats: {
      students: studentsById.get(i.id) ?? 0,
      courses: coursesById.get(i.id) ?? 0,
      users: usersById.get(i.id) ?? 0,
    },
  }));
}

export async function findAll(): Promise<InstitutionWithStats[]> {
  const institutions = await repo().find({ order: { name: 'ASC' } });
  if (!institutions.length) return [];
  return attachStats(institutions);
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
