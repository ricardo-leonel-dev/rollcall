import { Worker } from 'bullmq';
import { connectionOptions, VoiceAbsenceJobData } from '../queues/voice-absence.queue';
import { parseVoiceAbsence, VoiceAbsencePreview } from '../services/ai.service';
import { AppDataSource } from '../data-source';

type JobName = 'parse';

async function saveLog(params: {
  jobId: string;
  data: VoiceAbsenceJobData;
  result?: VoiceAbsencePreview;
  transcription?: string;
  processingMs: number;
  status: 'completed' | 'failed';
  errorReason?: string;
}): Promise<void> {
  const { jobId, data, result, transcription, processingMs, status, errorReason } = params;
  try {
    await AppDataSource.query(
      `INSERT INTO voice_absence_logs
        (job_id, institution_id, course_id, academic_year_id, enrollment_id,
         transcription, student_name, absence_type, date_from, date_to,
         confidence, status, error_reason, processing_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        jobId,
        data.institutionId,
        data.courseId,
        data.academicYearId,
        result?.enrollmentId ?? null,
        result?.transcription ?? transcription ?? null,
        result?.studentName ?? null,
        result?.type ?? null,
        result?.dateFrom ?? null,
        result?.dateTo ?? null,
        result?.confidence ?? null,
        status,
        errorReason ?? null,
        processingMs,
      ],
    );
  } catch (err: any) {
    console.error('[worker] error guardando log de voz:', err.message);
  }
}

export function startVoiceAbsenceWorker(): void {
  const worker = new Worker<VoiceAbsenceJobData, VoiceAbsencePreview, JobName>(
    'voice-absence',
    async (job) => {
      const start = Date.now();
      const { audioBase64, mimeType, institutionId, courseId, academicYearId } = job.data;
      const buffer = Buffer.from(audioBase64, 'base64');
      const result = await parseVoiceAbsence(
        buffer, mimeType, institutionId, courseId, academicYearId,
        async (t) => { await job.updateData({ ...job.data, transcription: t }); },
      );
      await saveLog({ jobId: job.id!, data: job.data, result, processingMs: Date.now() - start, status: 'completed' });
      return result;
    },
    {
      connection: connectionOptions,
      concurrency: 2,
    },
  );

  worker.on('failed', async (job, err) => {
    console.error(`[worker] job ${job?.id} falló:`, err.message);
    if (job) {
      await saveLog({
        jobId: job.id!,
        data: job.data,
        transcription: job.data.transcription,
        processingMs: Date.now() - (job.processedOn ?? Date.now()),
        status: 'failed',
        errorReason: err.message,
      });
    }
  });

  console.log('[worker] voice-absence iniciado (concurrency: 2)');
}
