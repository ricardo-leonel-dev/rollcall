import { Router } from 'express';
import multer from 'multer';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import { parseVoiceAbsence } from '../services/ai.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(requireInstitution);

router.post('/voice-absence', requirePermission('absences', 'create'),
  upload.single('audio'),
  async (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'Audio requerido' }); return; }

    const courseId       = req.body.course_id       ? +req.body.course_id       : undefined;
    const academicYearId = req.body.academic_year_id ? +req.body.academic_year_id : undefined;

    const preview = await parseVoiceAbsence(
      req.file.buffer,
      req.file.mimetype,
      req.institutionId!,
      courseId,
      academicYearId,
    );
    res.json(preview);
  }
);

export default router;
