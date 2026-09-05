import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/citation.service';

const router = Router();
const R = 'citaciones';

const attachmentsDir = path.join(process.cwd(), 'uploads', 'citaciones');
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
  const courseId       = req.query.course_id       ? +req.query.course_id       : undefined;
  const academicYearId  = req.query.academic_year_id ? +req.query.academic_year_id : undefined;
  const enrollmentId    = req.query.enrollment_id    ? +req.query.enrollment_id    : undefined;
  const status          = req.query.status as string | undefined;

  if (courseId !== undefined) {
    if (academicYearId === undefined) {
      res.status(400).json({ error: 'academic_year_id es requerido junto con course_id' });
      return;
    }
    res.json(await svc.findRoster(req.institutionId!, req.courseIds ?? null, courseId, academicYearId));
    return;
  }
  if (enrollmentId !== undefined) {
    res.json(await svc.findByEnrollment(req.institutionId!, req.courseIds ?? null, enrollmentId, status));
    return;
  }
  res.status(400).json({ error: 'Debe especificar course_id y academic_year_id, o enrollment_id' });
});

router.post('/',   requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.institutionId!, req.courseIds ?? null, req.body, req.user?.id ?? null)));
router.put('/:id', requirePermission(R,'update'), async (req, res) => res.json(await svc.update(req.institutionId!, req.courseIds ?? null, +req.params.id, req.body)));
router.put('/:id/close', requirePermission(R,'update'), async (req, res) => res.json(await svc.close(req.institutionId!, req.courseIds ?? null, +req.params.id, req.user?.id ?? null)));
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
