import { Request, Response, NextFunction, Router } from 'express';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import * as svc from '../services/domain-event.service';

const router = Router();
const R = 'audit-events';

// The audit trail is institution-wide and is not filtered by course, so a
// caller scoped to a few courses cannot read it — the answer would be
// incomplete by construction.
function requireInstitutionWide(req: Request, res: Response, next: NextFunction): void {
  if (req.courseIds !== null && req.courseIds !== undefined) {
    res.status(403).json({ error: 'El historial de auditoría requiere acceso a toda la institución' });
    return;
  }
  next();
}

router.use(requireInstitution);

router.get('/', requirePermission(R,'read'), requireInstitutionWide, async (req, res) => {
  res.json(await svc.findAll(req.institutionId!, req.query));
});

export default router;
