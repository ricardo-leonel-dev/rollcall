import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Request, Response, NextFunction } from 'express';
import { voiceAbsenceQueue } from '../queues/voice-absence.queue';

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.roleName !== 'superadmin') {
    res.status(403).json({ error: 'Solo superadmin' });
    return;
  }
  next();
}

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(voiceAbsenceQueue)],
  serverAdapter,
});

export { serverAdapter };
