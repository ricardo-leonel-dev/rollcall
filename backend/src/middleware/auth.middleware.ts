import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: number;
  username: string;
  roleId: number;
  roleName: string;
  institutionId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      institutionId?: number;
      // null = unrestricted (sees every course in the institution).
      // Array = scoped to only those courses (e.g. teacher, "inspector de bloque").
      courseIds?: number[] | null;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret') as AuthUser;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
