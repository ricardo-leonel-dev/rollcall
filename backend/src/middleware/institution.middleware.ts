import { Request, Response, NextFunction } from 'express';

// Institution-bound users (institutionId set) can never escape their own
// institution — any client-supplied override is ignored. Only a superadmin
// (institutionId === null) picks which institution to operate on, via the
// X-Institution-Id header sent by the frontend's institution switcher.
export function institutionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) { next(); return; }

  if (req.user.institutionId !== null) {
    req.institutionId = req.user.institutionId;
    next();
    return;
  }

  const header = req.headers['x-institution-id'];
  const headerValue = Array.isArray(header) ? header[0] : header;
  const parsed = headerValue ? Number(headerValue) : NaN;
  if (!Number.isNaN(parsed)) {
    req.institutionId = parsed;
  }
  next();
}

export function requireInstitution(req: Request, res: Response, next: NextFunction): void {
  if (req.institutionId === undefined) {
    res.status(400).json({ error: 'Selecciona una institución' });
    return;
  }
  next();
}
