import { Router } from 'express';
import multer from 'multer';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/ocr.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(requireInstitution);

router.post('/process-photo', requirePermission('absences', 'create'),
  upload.single('foto'),
  async (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'Foto requerida' }); return; }
    const courseId = +req.body.course_id;
    const academicYearId = +req.body.academic_year_id;
    if (!courseId || !academicYearId) {
      res.status(400).json({ error: 'course_id y academic_year_id son requeridos' });
      return;
    }

    const ocrResp = await svc.processPhoto(req.institutionId!, courseId, academicYearId, req.body.date, req.file);
    res.setHeader('Content-Type', ocrResp.headers.get('content-type') || 'application/json');
    const buf = Buffer.from(await ocrResp.arrayBuffer());
    res.send(buf);
  }
);

export default router;
