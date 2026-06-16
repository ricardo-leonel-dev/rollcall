import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import * as svc from '../services/course-academic-year.service';

const router = Router();
const R = 'courses';

router.get('/', requirePermission(R,'read'), async (req, res) => {
  const courseId = req.query.course_id ? +req.query.course_id : undefined;
  const yearId   = req.query.academic_year_id ? +req.query.academic_year_id : undefined;
  res.json(await svc.findAll(courseId, yearId));
});

router.post('/',   requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.body)));
router.put('/:id', requirePermission(R,'update'), async (req, res) => res.json(await svc.update(+req.params.id, req.body)));

export default router;
