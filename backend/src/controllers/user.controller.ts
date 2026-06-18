import { Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/user.service';

const router = Router();
const R = 'users';

router.get('/', requireInstitution, requirePermission(R,'read'), async (req, res) => {
  res.json(await svc.findAll(req.institutionId!));
});

router.post('/', requirePermission(R,'create'), async (req, res) => {
  const isActorSuperAdmin = req.user!.roleName === 'superadmin';
  const targetInstitutionId = isActorSuperAdmin
    ? (req.body.institutionId ?? null)
    : req.institutionId!;
  res.status(201).json(await svc.create(isActorSuperAdmin, targetInstitutionId, req.body));
});

router.put('/:id', requireInstitution, requirePermission(R,'update'), async (req, res) => {
  const isActorSuperAdmin = req.user!.roleName === 'superadmin';
  res.json(await svc.update(req.institutionId!, isActorSuperAdmin, +req.params.id, req.body));
});

router.delete('/:id', requireInstitution, requirePermission(R,'delete'), async (req, res) => {
  await svc.remove(req.institutionId!, +req.params.id);
  res.status(204).send();
});

router.put('/:id/courses', requireInstitution, requirePermission(R,'update'), async (req, res) => {
  await svc.setCourses(req.institutionId!, +req.params.id, req.body.courseIds ?? []);
  res.json({ message: 'Cursos actualizados' });
});

export default router;
