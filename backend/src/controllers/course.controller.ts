import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import * as svc from '../services/course.service';

const router = Router();
const R = 'courses';

router.get('/',    requirePermission(R,'read'),   async (_req, res) => res.json(await svc.findAll()));
router.post('/',   requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.body)));
router.put('/:id', requirePermission(R,'update'), async (req, res) => res.json(await svc.update(+req.params.id, req.body)));
router.delete('/:id', requirePermission(R,'delete'), async (req, res) => { await svc.remove(+req.params.id); res.status(204).send(); });

export default router;
