import { Router } from 'express';
import multer from 'multer';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import { voiceAbsenceQueue } from '../queues/voice-absence.queue';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(requireInstitution);

router.post('/voice-absence', requirePermission('absences', 'create'),
  upload.single('audio'),
  async (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'Audio requerido' }); return; }

    const courseId       = req.body.course_id       ? +req.body.course_id       : undefined;
    const academicYearId = req.body.academic_year_id ? +req.body.academic_year_id : undefined;

    if (!courseId || !academicYearId) {
      res.status(400).json({ error: 'Debes seleccionar un curso antes de registrar una inasistencia por voz' });
      return;
    }

    const job = await voiceAbsenceQueue.add('parse' as const, {
      audioBase64:   req.file.buffer.toString('base64'),
      mimeType:      req.file.mimetype,
      institutionId: req.institutionId!,
      courseId,
      academicYearId,
    });

    res.status(202).json({ jobId: job.id });
  }
);

export default router;
