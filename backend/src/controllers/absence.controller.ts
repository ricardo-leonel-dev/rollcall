import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import * as svc from '../services/absence.service';

const router = Router();
const R = 'absences';

router.get('/', requirePermission(R,'read'), async (req, res) => {
  res.json(await svc.findAll({
    enrollmentId:   req.query.enrollment_id   ? +req.query.enrollment_id   : undefined,
    courseId:       req.query.course_id       ? +req.query.course_id       : undefined,
    academicYearId: req.query.academic_year_id ? +req.query.academic_year_id : undefined,
    dateFrom:       req.query.date_from       as string,
    dateTo:         req.query.date_to         as string,
    type:           req.query.type            as string,
    isJustified:    req.query.is_justified    as string,
  }));
});

router.post('/',   requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.body)));
router.put('/:id', requirePermission(R,'update'), async (req, res) => res.json(await svc.update(+req.params.id, req.body)));
router.delete('/:id', requirePermission(R,'delete'), async (req, res) => { await svc.remove(+req.params.id); res.status(204).send(); });

export default router;
