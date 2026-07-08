import { Router } from 'express';
import { voiceAbsenceQueue } from '../queues/voice-absence.queue';
import { photoAbsenceQueue } from '../queues/photo-absence.queue';
import { requirePermission } from '../middleware/role.middleware';
import { requireInstitution } from '../middleware/institution.middleware';
import { AppDataSource } from '../data-source';

const router = Router();

router.use(requireInstitution);

router.get('/voice-logs', requirePermission('absences', 'read'), async (req, res) => {
  const { course_id, academic_year_id, date_from, date_to } = req.query;
  const limit  = Math.min(Number(req.query.limit)  || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const filters: string[] = ['institution_id = $1'];
  const values: unknown[] = [req.institutionId];
  let i = 2;

  if (course_id)        { filters.push(`course_id = $${i++}`);        values.push(Number(course_id)); }
  if (academic_year_id) { filters.push(`academic_year_id = $${i++}`); values.push(Number(academic_year_id)); }
  if (date_from)        { filters.push(`created_at >= $${i++}`);      values.push(date_from); }
  if (date_to)          { filters.push(`created_at <= $${i++}`);      values.push(date_to); }

  const where = filters.join(' AND ');

  const [rows, countResult] = await Promise.all([
    AppDataSource.query(
      `SELECT id, job_id, enrollment_id, transcription, student_name,
              absence_type, date_from, date_to, confidence,
              status, error_reason, confirmed, processing_ms, created_at
       FROM voice_absence_logs
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset],
    ),
    AppDataSource.query(
      `SELECT COUNT(*) FROM voice_absence_logs WHERE ${where}`,
      values,
    ),
  ]);

  res.json({ data: rows, total: Number(countResult[0].count) });
});

router.get('/:id', async (req, res) => {
  const job = await voiceAbsenceQueue.getJob(req.params.id)
           ?? await photoAbsenceQueue.getJob(req.params.id);
  if (!job) { res.status(404).json({ error: 'Job no encontrado' }); return; }

  const state = await job.getState();

  if (state === 'completed') {
    res.json({ status: 'completed', result: job.returnvalue });
    return;
  }
  if (state === 'failed') {
    res.status(422).json({ status: 'failed', error: job.failedReason ?? 'Error desconocido' });
    return;
  }
  res.json({ status: state });
});

router.patch('/:jobId/confirm', requirePermission('absences', 'create'), async (req, res) => {
  const { jobId } = req.params;
  const { confirmed, absenceId } = req.body as { confirmed: boolean; absenceId?: number };

  if (typeof confirmed !== 'boolean') {
    res.status(400).json({ error: 'El campo confirmed debe ser booleano' });
    return;
  }

  await AppDataSource.query(
    `UPDATE voice_absence_logs
     SET confirmed = $1, absence_id = $2
     WHERE job_id = $3 AND institution_id = $4`,
    [confirmed, absenceId ?? null, jobId, req.institutionId],
  );

  res.json({ ok: true });
});

export default router;
