import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { requirePermission } from '../middleware/role.middleware';
import * as svc from '../services/institution.service';

const router = Router();
const R = 'institutions';

const logosDir = path.join(process.cwd(), 'uploads', 'logos');
const logoStorage = multer.diskStorage({
  destination: logosDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.mimetype)) {
      cb(new Error('Solo se permiten imágenes JPG, PNG, WEBP o SVG'));
      return;
    }
    cb(null, true);
  },
});

router.get('/',    requirePermission(R,'read'),   async (_req, res) => res.json(await svc.findAll()));
router.post('/',   requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.body)));
router.put('/:id', requirePermission(R,'update'), async (req, res) => res.json(await svc.update(+req.params.id, req.body)));
router.delete('/:id', requirePermission(R,'delete'), async (req, res) => { await svc.remove(+req.params.id); res.status(204).send(); });

router.post('/:id/logo/upload', requirePermission(R,'update'), uploadLogo.single('logo'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'Logo requerido' }); return; }
  const logoUrl = `/api/uploads/logos/${req.file.filename}`;
  res.json(await svc.updateLogo(+req.params.id, logoUrl));
});

export default router;
