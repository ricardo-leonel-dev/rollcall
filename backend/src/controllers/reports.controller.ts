import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/reports.service';

const router = Router();
router.use(requireInstitution);

router.get('/student-summary', requirePermission('reports', 'read'), async (req, res) => {
  const { course_ids, academic_year_id, date_from, date_to } = req.query as Record<string, string>;

  if (!course_ids || !academic_year_id || !date_from || !date_to) {
    res.status(400).json({ error: 'Se requieren course_ids, academic_year_id, date_from y date_to' });
    return;
  }

  const courseIds = course_ids.split(',').map(Number);
  if (courseIds.some(isNaN)) {
    res.status(400).json({ error: 'course_ids inválidos' });
    return;
  }

  const yearId = Number(academic_year_id);
  if (isNaN(yearId)) {
    res.status(400).json({ error: 'academic_year_id inválido' });
    return;
  }

  const data = await svc.getStudentSummary(
    req.institutionId!,
    req.courseIds ?? null,
    courseIds,
    yearId,
    date_from,
    date_to,
  );

  res.json(data);
});

export default router;
