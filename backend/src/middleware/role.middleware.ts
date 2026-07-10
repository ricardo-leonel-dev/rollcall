import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source';
import { RolePermission } from '../entities/RolePermission';

type Action = 'read' | 'create' | 'update' | 'delete';

export function requirePermission(resource: string, action: Action) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    if (req.user.roleName === 'superadmin') { next(); return; }

    const repo = AppDataSource.getRepository(RolePermission);
    const perm = await repo.findOne({
      where: { roleId: req.user.roleId, resource },
    });

    if (!perm) {
      res.status(403).json({ error: 'Sin permisos para este recurso' });
      return;
    }

    const allowed =
      action === 'read'   ? perm.canRead :
      action === 'create' ? perm.canCreate :
      action === 'update' ? perm.canUpdate :
                            perm.canDelete;

    if (!allowed) {
      res.status(403).json({ error: `Sin permiso de ${action} en ${resource}` });
      return;
    }

    next();
  };
}
