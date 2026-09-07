import { Router } from 'express';
import { requirePermission, requireAnyPermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/citation-reason.service';

const router = Router();
const R = 'citation-reasons';

router.use(requireInstitution);

router.get('/',       requireAnyPermission([{ resource: 'citaciones', action: 'read' }, { resource: 'citaciones', action: 'create' }, { resource: R, action: 'read' }]), async (req, res) => res.json(await svc.findAll(req.institutionId!, req.courseIds ?? null)));
router.post('/',      requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.institutionId!, req.courseIds ?? null, req.body)));
router.put('/:id',    requirePermission(R,'update'), async (req, res) => res.json(await svc.update(req.institutionId!, req.courseIds ?? null, +req.params.id, req.body)));
router.delete('/:id', requirePermission(R,'delete'), async (req, res) => { await svc.remove(req.institutionId!, req.courseIds ?? null, +req.params.id); res.status(204).send(); });

export default router;
