import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/justification.service';

const router = Router();
const R = 'justifications';

const attachmentsDir = path.join(process.cwd(), 'uploads', 'justifications');
const attachmentStorage = multer.diskStorage({
  destination: attachmentsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.params.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const uploadAttachments = multer({
  storage: attachmentStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(new Error('Solo se permiten imágenes (JPG/PNG/WEBP), PDF o Word (.doc/.docx)'));
      return;
    }
    cb(null, true);
  },
});

router.use(requireInstitution);

router.get('/', requirePermission(R,'read'), async (req, res) => {
  const enrollmentId   = req.query.enrollment_id   ? +req.query.enrollment_id   : undefined;
  const courseId       = req.query.course_id        ? +req.query.course_id        : undefined;
  const academicYearId = req.query.academic_year_id ? +req.query.academic_year_id : undefined;
  res.json(await svc.findAll(req.institutionId!, req.courseIds ?? null, enrollmentId, courseId, academicYearId));
});

router.post('/',   requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.institutionId!, req.courseIds ?? null, req.body)));
router.put('/:id', requirePermission(R,'update'), async (req, res) => res.json(await svc.update(req.institutionId!, req.courseIds ?? null, +req.params.id, req.body)));
router.delete('/:id', requirePermission(R,'delete'), async (req, res) => { await svc.remove(req.institutionId!, req.courseIds ?? null, +req.params.id); res.status(204).send(); });

router.post('/:id/attachments', requirePermission(R,'create'), uploadAttachments.array('files', 5), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) { res.status(400).json({ error: 'Debe adjuntar al menos un archivo' }); return; }
  const result = await svc.addAttachments(req.institutionId!, req.courseIds ?? null, +req.params.id, files);
  res.status(201).json(result);
});

router.delete('/:id/attachments/:attachmentId', requirePermission(R,'delete'), async (req, res) => {
  await svc.removeAttachment(req.institutionId!, req.courseIds ?? null, +req.params.id, +req.params.attachmentId);
  res.status(204).send();
});

export default router;
