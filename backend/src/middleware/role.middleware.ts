import { Request, Response, NextFunction } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { RolePermission } from '../entities/RolePermission';

type Action = 'read' | 'create' | 'update' | 'delete';
type Check = { resource: string; action: Action };

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

export function requireAnyPermission(checks: Check[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    if (req.user.roleName === 'superadmin') { next(); return; }

    const resources = [...new Set(checks.map(c => c.resource))];
    const repo = AppDataSource.getRepository(RolePermission);
    const perms = await repo.find({
      where: { roleId: req.user.roleId, resource: In(resources) },
    });
    const byResource = new Map(perms.map(p => [p.resource, p]));

    const allowed = checks.some(({ resource, action }) => {
      const perm = byResource.get(resource);
      if (!perm) return false;
      return action === 'read'   ? perm.canRead :
             action === 'create' ? perm.canCreate :
             action === 'update' ? perm.canUpdate :
                                    perm.canDelete;
    });

    if (!allowed) {
      res.status(403).json({ error: 'Sin permisos para este recurso' });
      return;
    }

    next();
  };
}
