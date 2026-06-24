import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/dashboard.service';

const router = Router();

router.use(requireInstitution);

router.get('/summary', requirePermission('dashboard','read'), async (req, res) => {
  const courseId = req.query.course_id ? +req.query.course_id : undefined;
  const yearId   = req.query.academic_year_id ? +req.query.academic_year_id : undefined;
  const dateFrom = req.query.date_from as string | undefined;
  const dateTo   = req.query.date_to as string | undefined;
  res.json(await svc.getSummary(req.institutionId!, req.courseIds ?? null, courseId, yearId, dateFrom, dateTo));
});

export default router;
