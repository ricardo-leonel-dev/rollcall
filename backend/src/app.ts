import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { AppDataSource } from './data-source';
import { seedAdmin } from './seed';
import routes from './routes/index';
import { errorMiddleware } from './middleware/error.middleware';

const app = express();

app.use(helmet());
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  try {
    await AppDataSource.initialize();
    console.log('[db] Conexión establecida');

    await seedAdmin();

    app.listen(PORT, () => {
      console.log(`[server] Backend escuchando en http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('[bootstrap] Error fatal:', err);
    process.exit(1);
  }
}

bootstrap();
