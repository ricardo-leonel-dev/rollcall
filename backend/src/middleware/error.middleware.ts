import { Request, Response, NextFunction } from 'express';

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  console.error('[error]', err);

  if (res.headersSent) return;

  if (err instanceof Error) {
    if (err.message.includes('duplicate key') || err.message.includes('unique')) {
      res.status(409).json({ error: 'Registro duplicado', detail: err.message });
      return;
    }
    if (err.message.includes('violates foreign key')) {
      res.status(409).json({ error: 'Referencia inválida', detail: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: 'Error interno del servidor' });
}
