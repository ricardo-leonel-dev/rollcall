import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/export.service';
import { getSigners } from '../services/user.service';

const router = Router();

router.use(requireInstitution);

router.get('/excel', requirePermission('export','read'), async (req, res) => {
  if (!req.institutionId) {
    res.status(400).json({ error: 'Institución requerida' });
    return;
  }

  const { course_ids, academic_year_id, date_from, date_to } = req.query as Record<string, string>;
  if (!course_ids || !academic_year_id || !date_from || !date_to) {
    res.status(400).json({ error: 'course_ids, academic_year_id, date_from, date_to son requeridos' });
    return;
  }

  const courseIds = course_ids.split(',').map(s => parseInt(s.trim(), 10));
  if (courseIds.some(id => isNaN(id))) {
    res.status(400).json({ error: 'course_ids debe ser una lista de enteros separados por coma' });
    return;
  }

  if (req.courseIds) {
    const unauthorized = courseIds.filter(id => !req.courseIds!.includes(id));
    if (unauthorized.length > 0) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
  }

  const signers = await getSigners(req.institutionId);
  const ocrResp = await svc.exportExcel(req.institutionId, courseIds, +academic_year_id, date_from, date_to, signers);

  const contentType = ocrResp.headers.get('content-type') || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const disposition = ocrResp.headers.get('content-disposition') || 'attachment; filename="asistencia.xlsx"';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', disposition);

  const buf = Buffer.from(await ocrResp.arrayBuffer());
  res.send(buf);
});

export default router;
