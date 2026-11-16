import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/student.service';

const router = Router();
const R = 'students';

router.use(requireInstitution);

function academicYearId(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw Object.assign(new Error('academic_year_id inválido'), { status: 400 });
  }
  return value;
}

router.get('/',    requirePermission(R,'read'),   async (req, res) => res.json(await svc.findAll(req.institutionId!, req.courseIds ?? null, req.query.search as string, academicYearId(req.query.academic_year_id))));
router.post('/',   requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.institutionId!, req.body)));
router.put('/:id', requirePermission(R,'update'), async (req, res) => res.json(await svc.update(req.institutionId!, req.courseIds ?? null, +req.params.id, req.body)));
router.delete('/:id', requirePermission(R,'delete'), async (req, res) => { await svc.remove(req.institutionId!, req.courseIds ?? null, +req.params.id); res.status(204).send(); });

export default router;
