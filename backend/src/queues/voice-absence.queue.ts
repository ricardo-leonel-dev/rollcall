import { Queue } from 'bullmq';
import { VoiceAbsencePreview } from '../services/ai.service';

export interface VoiceAbsenceJobData {
  audioBase64:    string;
  mimeType:       string;
  institutionId:  number;
  courseId:       number;
  academicYearId: number;
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

export const voiceAbsenceQueue = new Queue<VoiceAbsenceJobData, VoiceAbsencePreview, JobName>(
  'voice-absence',
  {
    connection: connectionOptions,
    defaultJobOptions: {
      removeOnComplete: { age: 3600 },
      removeOnFail:     { age: 86400 },
    },
  },
);
