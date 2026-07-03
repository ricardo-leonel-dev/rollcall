import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Request, Response, NextFunction } from 'express';
import { voiceAbsenceQueue } from '../queues/voice-absence.queue';

export function bullBoardBasicAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Basic ')) {
    const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    if (user === process.env.BULL_BOARD_USER && pass === process.env.BULL_BOARD_PASS) {
      next(); return;
    }
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Queue Monitor"');
  res.status(401).end();
}

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(voiceAbsenceQueue)],
  serverAdapter,
});

export { serverAdapter };
