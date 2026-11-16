import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/student-withdrawal.service';

const router = Router();
const R = 'student-withdrawals';

router.use(requireInstitution);

router.get('/',                            requirePermission(R,'read'),   async (req, res) => res.json(await svc.findAll(req.institutionId!, req.courseIds ?? null, req.query as Record<string, unknown>)));
router.get('/stats',                       requirePermission(R,'read'),   async (req, res) => res.json(await svc.getStats(req.institutionId!, req.courseIds ?? null, req.query as Record<string, unknown>)));
router.get('/students/:studentId/history', requirePermission(R,'read'),   async (req, res) => res.json(await svc.findStudentHistory(req.institutionId!, req.courseIds ?? null, +req.params.studentId)));
router.post('/',                           requirePermission(R,'create'), async (req, res) => res.status(201).json(await svc.withdraw(req.institutionId!, req.courseIds ?? null, req.user?.id ?? null, req.body)));
router.post('/:id/revert',                 requirePermission(R,'update'), async (req, res) => res.json(await svc.revert(req.institutionId!, req.courseIds ?? null, req.user?.id ?? null, +req.params.id)));

export default router;
