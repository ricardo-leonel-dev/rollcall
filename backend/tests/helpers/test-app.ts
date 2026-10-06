import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { AppDataSource } from '../../src/data-source';
import authRouter from '../../src/controllers/auth.controller';
import notificationTemplateRouter from '../../src/controllers/notification-template.controller';
import { authMiddleware } from '../../src/middleware/auth.middleware';
import { institutionMiddleware } from '../../src/middleware/institution.middleware';
import { errorMiddleware } from '../../src/middleware/error.middleware';

export async function startTestApp(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  await AppDataSource.initialize();

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: '*', credentials: false }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/auth', authRouter);
  app.use(authMiddleware);
  app.use(institutionMiddleware);
  app.use('/api/notification-templates', notificationTemplateRouter);
  app.use(errorMiddleware);

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (typeof addr === 'string' || addr === null) {
        throw new Error('Could not bind ephemeral port');
      }
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({ baseUrl, close: () => new Promise<void>((r) => server.close(() => r())) });
    });
  });
}

export async function stopTestApp(close: () => Promise<void>): Promise<void> {
  await close();
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}