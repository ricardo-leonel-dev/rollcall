import { Queue } from 'bullmq';
import { PhotoAbsencePreview } from '../services/ai.service';

export interface PhotoAbsenceJobData {
  imageBase64:    string;
  mimeType:       string;
  institutionId:  number;
  courseId:       number;
  academicYearId: number;
  date?:          string;
}

type JobName = 'parse';

function redisOptions() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://redis:6379');
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    maxRetriesPerRequest: null as null,
  };
}

export const connectionOptions = redisOptions();

export const photoAbsenceQueue = new Queue<PhotoAbsenceJobData, PhotoAbsencePreview, JobName>(
  'photo-absence',
  {
    connection: connectionOptions,
    defaultJobOptions: {
      removeOnComplete: { age: 3600 },
      removeOnFail:     { age: 86400 },
    },
  },
);
