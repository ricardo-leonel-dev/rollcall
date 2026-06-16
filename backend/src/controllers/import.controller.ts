import { Router } from 'express';
import multer from 'multer';
import { requirePermission } from '../middleware/role.middleware';
import * as svc from '../services/import.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/roster', requirePermission('import','create'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'Archivo requerido' }); return; }
    const result = await svc.importRoster(req.file.buffer);
    res.json(result);
  }
);

export default router;
