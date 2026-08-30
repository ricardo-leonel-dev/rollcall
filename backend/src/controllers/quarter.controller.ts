import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/quarter.service';

const router = Router();
const R = 'academic_years';

router.use(requireInstitution);

router.get('/',        requirePermission(R,'read'),   async (req, res) => {
  const { academic_year_id } = req.query as Record<string, string>;
  let academicYearId: number | undefined;
  if (academic_year_id !== undefined) {
    academicYearId = parseInt(academic_year_id, 10);
    if (isNaN(academicYearId) || academicYearId <= 0) {
      res.status(400).json({ error: 'academic_year_id debe ser un entero positivo' });
      return;
    }
  }
  res.json(await svc.findAllForYear(req.institutionId!, academicYearId));
});
router.post('/',       requirePermission(R,'create'), async (req, res, next) => {
  if (req.body.startDate == null || req.body.endDate == null) {
    return next(Object.assign(new Error('El período debe tener fecha de inicio y fecha de fin.'), { status: 400 }));
  }
  res.status(201).json(await svc.create(req.institutionId!, req.body));
});
router.put('/:id',     requirePermission(R,'update'), async (req, res, next) => {
  if (req.body.startDate === null || req.body.endDate === null) {
    return next(Object.assign(new Error('El período debe tener fecha de inicio y fecha de fin.'), { status: 400 }));
  }
  res.json(await svc.update(req.institutionId!, +req.params.id, req.body));
});
router.delete('/:id',  requirePermission(R,'delete'), async (req, res) => { await svc.remove(req.institutionId!, +req.params.id); res.status(204).send(); });

export default router;
