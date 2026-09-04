import { Router } from 'express';
import * as svc from '../services/notification-template.service';

const router = Router();

router.get('/', async (req, res) => {
  res.json(await svc.findAllForUser(req.user!.id));
});

router.put('/', async (req, res) => {
  res.json(await svc.upsert(req.user!.id, req.body.actionKey, req.body.template));
});

export default router;