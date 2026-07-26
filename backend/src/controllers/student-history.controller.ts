import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/student-history.service';

const router = Router();
const R = 'students';

router.use(requireInstitution);

router.get('/:enrollmentId/summary', requirePermission(R, 'read'), async (req, res) => {
  res.json(await svc.getSummary(req.institutionId!, req.courseIds ?? null, +req.params.enrollmentId, {
    dateFrom: req.query.date_from as string,
    dateTo: req.query.date_to as string,
  }));
});

router.get('/:enrollmentId/timeline', requirePermission(R, 'read'), async (req, res) => {
  res.json(await svc.getTimeline(req.institutionId!, req.courseIds ?? null, +req.params.enrollmentId, {
    dateFrom: req.query.date_from as string,
    dateTo: req.query.date_to as string,
  }));
});

export default router;
