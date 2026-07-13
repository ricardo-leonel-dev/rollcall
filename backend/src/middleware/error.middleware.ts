import { Request, Response, NextFunction } from 'express';

interface HttpError extends Error {
  status?: number;
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  // Client dropped the connection mid-upload (network drop, user navigated away, proxy timeout)
  if (err instanceof Error && err.message === 'Unexpected end of form' && 'storageErrors' in err) {
    res.status(400).json({ error: 'La solicitud fue interrumpida. Intenta nuevamente.' });
    return;
  }

  console.error('[error]', err);

  if (err instanceof Error) {
    if (err.message.includes('duplicate key') || err.message.includes('unique')) {
      res.status(409).json({ error: 'Registro duplicado', detail: err.message });
      return;
    }
    if (err.message.includes('violates foreign key')) {
      res.status(409).json({ error: 'Referencia inválida', detail: err.message });
      return;
    }
    res.status((err as HttpError).status ?? 500).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: 'Error interno del servidor' });
}
