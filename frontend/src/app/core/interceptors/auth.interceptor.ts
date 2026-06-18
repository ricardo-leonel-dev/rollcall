import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { InstitutionContextService } from '../services/institution-context.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  const selectedInstitutionId = inject(InstitutionContextService).selectedId();

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (selectedInstitutionId !== null) headers['X-Institution-Id'] = String(selectedInstitutionId);

  if (Object.keys(headers).length) {
    req = req.clone({ setHeaders: headers });
  }
  return next(req);
};
