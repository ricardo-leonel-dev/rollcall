import { Worker } from 'bullmq';
import { connectionOptions, PhotoAbsenceJobData } from '../queues/photo-absence.queue';
import { parsePhotoAbsence, PhotoAbsencePreview } from '../services/ai.service';
import { AppDataSource } from '../data-source';

type JobName = 'parse';

async function saveLog(params: {
  jobId: string;
  data: PhotoAbsenceJobData;
  result?: PhotoAbsencePreview;
  processingMs: number;
  status: 'completed' | 'failed';
  errorReason?: string;
}): Promise<void> {
  const { jobId, data, result, processingMs, status, errorReason } = params;
  try {
    await AppDataSource.query(
      `INSERT INTO photo_absence_logs
        (job_id, institution_id, course_id, academic_year_id,
         records_matched, records_not_found, total_in_photo,
         status, error_reason, processing_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        jobId,
        data.institutionId,
        data.courseId,
        data.academicYearId,
        result?.matched.length ?? null,
        result?.notFound ?? null,
        result?.total ?? null,
        status,
        errorReason ?? null,
        processingMs,
      ],
    );
  } catch (err: any) {
    console.error('[worker] error guardando log de foto:', err.message);
  }
}

export function startPhotoAbsenceWorker(): void {
  const worker = new Worker<PhotoAbsenceJobData, PhotoAbsencePreview, JobName>(
    'photo-absence',
    async (job) => {
      const start = Date.now();
      const { imageBase64, mimeType, institutionId, courseId, academicYearId, date } = job.data;
      const buffer = Buffer.from(imageBase64, 'base64');
      const result = await parsePhotoAbsence(buffer, mimeType, institutionId, courseId, academicYearId, date);
      await saveLog({ jobId: job.id!, data: job.data, result, processingMs: Date.now() - start, status: 'completed' });
      return result;
    },
    {
      connection: connectionOptions,
      concurrency: 2,
    },
  );

  worker.on('failed', async (job, err) => {
    console.error(`[worker] photo job ${job?.id} falló:`, err.message);
    if (job) {
      await saveLog({
        jobId: job.id!,
        data: job.data,
        processingMs: Date.now() - (job.processedOn ?? Date.now()),
        status: 'failed',
        errorReason: err.message,
      });
    }
  });

  console.log('[worker] photo-absence iniciado (concurrency: 2)');
}
