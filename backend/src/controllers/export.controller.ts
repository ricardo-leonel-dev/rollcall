import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/export.service';

const router = Router();

router.use(requireInstitution);

router.get('/excel', requirePermission('export','read'), async (req, res) => {
  const { course_id, academic_year_id, date_from, date_to } = req.query as Record<string, string>;
  if (!course_id || !academic_year_id || !date_from || !date_to) {
    res.status(400).json({ error: 'course_id, academic_year_id, date_from, date_to son requeridos' });
    return;
  }
  if (req.courseIds && !req.courseIds.includes(+course_id)) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  const ocrResp = await svc.exportExcel(req.institutionId!, +course_id, +academic_year_id, date_from, date_to);

  const contentType = ocrResp.headers.get('content-type') || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const disposition = ocrResp.headers.get('content-disposition') || 'attachment; filename="asistencia.xlsx"';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', disposition);

  const buf = Buffer.from(await ocrResp.arrayBuffer());
  res.send(buf);
});

export default router;
