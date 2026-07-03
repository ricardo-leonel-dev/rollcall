import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { voiceAbsenceQueue } from '../queues/voice-absence.queue';

export function bullBoardCookieAuth(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers.cookie ?? '';
  const token = raw.split(';').map(c => c.trim())
    .find(c => c.startsWith('bbs='))?.split('=').slice(1).join('=');

  if (!token) { res.status(401).send('Sin sesión. Abre desde la app.'); return; }
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET!) as { roleName?: string };
    if (p.roleName !== 'superadmin') { res.status(403).send('Solo superadmin'); return; }
    next();
  } catch {
    res.status(401).send('Sesión expirada. Abre desde la app.');
  }
}

export function createQueueSession(req: Request, res: Response): void {
  if (req.user?.roleName !== 'superadmin') {
    res.status(403).json({ error: 'Solo superadmin' }); return;
  }
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  res.cookie('bbs', token, {
    httpOnly: true,
    maxAge: 3_600_000,
    sameSite: 'lax',
    secure: true,
  });
  res.json({ ok: true });
}

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(voiceAbsenceQueue)],
  serverAdapter,
});

export { serverAdapter };
