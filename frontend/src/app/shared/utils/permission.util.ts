import type { RolePermission } from '../../core/models/index';

export interface ResourceFlags {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export const NO_FLAGS: ResourceFlags = { canCreate: false, canUpdate: false, canDelete: false };

export function resolveResourcePermissions(
  rows: readonly RolePermission[] | null,
  resource: string,
  isSuperAdmin: boolean,
): ResourceFlags {
  if (isSuperAdmin) return { canCreate: true, canUpdate: true, canDelete: true };
  const row = rows?.find(r => r.resource === resource);
  if (!row) return { ...NO_FLAGS };
  return {
    canCreate: !!row.canCreate,
    canUpdate: !!row.canUpdate,
    canDelete: !!row.canDelete,
  };
}
