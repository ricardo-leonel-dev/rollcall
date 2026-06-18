import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const moduleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const key = route.data['module'] as string | undefined;
  if (!key || auth.canAccessModule(key)) return true;
  return router.createUrlTree(['/inicio']);
};
