import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/academic-year.service';

const router = Router();
const R = 'academic_years';

router.use(requireInstitution);

router.get('/',    requirePermission(R,'read'),   async (req, res) => res.json(await svc.findAll(req.institutionId!)));
router.post('/',   requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.create(req.institutionId!, req.body)));
router.put('/:id', requirePermission(R,'update'), async (req, res) => res.json(await svc.update(req.institutionId!, +req.params.id, req.body)));
router.delete('/:id', requirePermission(R,'delete'), async (req, res) => { await svc.remove(req.institutionId!, +req.params.id); res.status(204).send(); });

export default router;
