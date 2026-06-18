import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import * as authService from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
const avatarStorage = multer.diskStorage({
  destination: avatarsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user!.id}-${Date.now()}${ext}`);
  },
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP'));
      return;
    }
    cb(null, true);
  },
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) { res.status(400).json({ error: 'username y password requeridos' }); return; }
  const result = await authService.login(username, password);
  res.json(result);
});

router.post('/logout', authMiddleware, (_req, res) => {
  res.json({ message: 'Sesión cerrada' });
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await authService.getMe(req.user!.id);
  res.json(user);
});

router.put('/me', authMiddleware, async (req, res) => {
  const user = await authService.updateMe(req.user!.id, req.body);
  res.json(user);
});

router.put('/me/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) { res.status(400).json({ error: 'currentPassword y newPassword requeridos' }); return; }
  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  res.json({ message: 'Contraseña actualizada' });
});

router.put('/me/avatar', authMiddleware, async (req, res) => {
  const { preset } = req.body;
  if (!preset) { res.status(400).json({ error: 'preset requerido' }); return; }
  const user = await authService.updateAvatar(req.user!.id, `preset:${preset}`);
  res.json(user);
});

router.post('/me/avatar/upload', authMiddleware, uploadAvatar.single('photo'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'Foto requerida' }); return; }
  const avatarUrl = `/api/uploads/avatars/${req.file.filename}`;
  const user = await authService.updateAvatar(req.user!.id, avatarUrl);
  res.json(user);
});

export default router;
