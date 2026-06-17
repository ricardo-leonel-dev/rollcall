import { Router } from 'express';
import * as authService from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

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

export default router;
