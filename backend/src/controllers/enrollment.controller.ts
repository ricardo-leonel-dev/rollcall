import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/enrollment.service';

const router = Router();
const R = 'enrollments';

router.use(requireInstitution);

router.get('/', requirePermission(R,'read'), async (req, res) => {
  const courseId  = req.query.course_id ? +req.query.course_id : undefined;
  const yearId    = req.query.academic_year_id ? +req.query.academic_year_id : undefined;
  const studentId = req.query.student_id ? +req.query.student_id : undefined;
  res.json(await svc.findAll(req.institutionId!, courseId, yearId, studentId));
});

router.post('/',   requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.institutionId!, req.body)));
router.put('/:id', requirePermission(R,'update'), async (req, res) => res.json(await svc.update(req.institutionId!, +req.params.id, req.body)));
router.delete('/:id', requirePermission(R,'delete'), async (req, res) => { await svc.remove(req.institutionId!, +req.params.id); res.status(204).send(); });

export default router;
