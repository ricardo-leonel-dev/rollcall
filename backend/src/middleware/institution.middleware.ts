import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source';
import { UserCourse } from '../entities/UserCourse';

// Institution-bound users (institutionId set) can never escape their own
// institution — any client-supplied override is ignored. Only a superadmin
// (institutionId === null) picks which institution to operate on, via the
// X-Institution-Id header sent by the frontend's institution switcher.
export async function institutionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) { next(); return; }

  if (req.user.institutionId !== null) {
    req.institutionId = req.user.institutionId;
    req.courseIds = await resolveCourseIds(req.user.id);
    next();
    return;
  }

  // Superadmin: never course-scoped, regardless of institution selected.
  req.courseIds = null;

  const header = req.headers['x-institution-id'];
  const headerValue = Array.isArray(header) ? header[0] : header;
  const parsed = headerValue ? Number(headerValue) : NaN;
  if (!Number.isNaN(parsed)) {
    req.institutionId = parsed;
  }
  next();
}

// A user with zero rows in user_courses sees every course in their
// institution (rector, admin, "inspector general"); one or more rows
// scopes them to just those courses (teacher, "inspector de bloque").
async function resolveCourseIds(userId: number): Promise<number[] | null> {
  const rows = await AppDataSource.getRepository(UserCourse).find({ where: { userId } });
  return rows.length ? rows.map(r => r.courseId) : null;
}

export function requireInstitution(req: Request, res: Response, next: NextFunction): void {
  if (req.institutionId === undefined) {
    res.status(400).json({ error: 'Selecciona una institución' });
    return;
  }
  next();
}
