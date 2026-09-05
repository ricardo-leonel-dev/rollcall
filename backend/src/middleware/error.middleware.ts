import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

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

  // Multer-thrown errors (LIMIT_FILE_SIZE, LIMIT_FILE_COUNT, LIMIT_UNEXPECTED_FILE, etc.)
  // — surface as 4xx, not 500. The client did something the server can name.
  if (err instanceof multer.MulterError) {
    const detail = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'El archivo excede el tamaño máximo permitido (8 MB)', detail });
      return;
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ error: 'Se excedió el número máximo de archivos permitidos (5)', detail });
      return;
    }
    res.status(400).json({ error: 'Solicitud de archivo inválida', detail });
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
