import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { AppDataSource } from './data-source';
import { seedSuperAdmin } from './seed';
import routes from './routes/index';
import { errorMiddleware } from './middleware/error.middleware';
import { startVoiceAbsenceWorker } from './workers/voice-absence.worker';
import { authMiddleware } from './middleware/auth.middleware';
import { serverAdapter, bullBoardCookieAuth, createQueueSession } from './controllers/bull-board';

const app = express();

const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
fs.mkdirSync(avatarsDir, { recursive: true });
const logosDir = path.join(process.cwd(), 'uploads', 'logos');
fs.mkdirSync(logosDir, { recursive: true });
const justificationsDir = path.join(process.cwd(), 'uploads', 'justifications');
fs.mkdirSync(justificationsDir, { recursive: true });

app.use(helmet());
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.post('/api/admin/queues-session', authMiddleware, createQueueSession);
app.use('/api/admin/queues', bullBoardCookieAuth, serverAdapter.getRouter());
app.use('/api', routes);

app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  try {
    await AppDataSource.initialize();
    console.log('[db] Conexión establecida');

    await seedSuperAdmin();
    startVoiceAbsenceWorker();

    app.listen(PORT, () => {
      console.log(`[server] Backend escuchando en http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('[bootstrap] Error fatal:', err);
    process.exit(1);
  }
}

bootstrap();
