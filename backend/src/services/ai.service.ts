import { AppDataSource } from '../data-source';

const WHISPER_URL = process.env.WHISPER_URL ?? '';
const LLM_URL     = process.env.LLM_URL ?? '';
const LLM_API_KEY = process.env.LLM_API_KEY ?? '';

const llmHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
});

export interface VoiceAbsencePreview {
  transcription: string;
  enrollmentId:  number;
  studentName:   string;
  type:          'F' | 'AT';
  dateFrom:      string;
  dateTo:        string;
  confidence:    number;
}

async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', new Blob([audioBuffer], { type: mimeType }), 'audio.webm');
  fd.append('model', 'Systran/faster-whisper-large-v3');
  fd.append('language', 'es');
  fd.append('response_format', 'json');

  const resp = await fetch(`${WHISPER_URL}/v1/audio/transcriptions`, { method: 'POST', body: fd });
  if (!resp.ok) throw new Error(`Whisper error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { text: string };
  return data.text.trim();
}

async function fetchEnrollments(courseId: number, academicYearId: number, institutionId: number) {
  return AppDataSource.query(`
    SELECT e.id AS enrollment_id, s.name
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    WHERE e.course_id = $1
      AND e.academic_year_id = $2
      AND e.institution_id = $3
      AND e.deleted_at IS NULL
      AND s.deleted_at IS NULL
    ORDER BY s.name
  `, [courseId, academicYearId, institutionId]) as Promise<{ enrollment_id: number; name: string }[]>;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export async function parseVoiceAbsence(
  audioBuffer: Buffer,
  mimeType: string,
  institutionId: number,
  courseId?: number,
  academicYearId?: number,
): Promise<VoiceAbsencePreview> {
  const transcription = await transcribeAudio(audioBuffer, mimeType);

  let studentContext = '';
  if (courseId && academicYearId) {
    const rows = await fetchEnrollments(courseId, academicYearId, institutionId);
    if (rows.length) {
      studentContext = '\nEstudiantes del curso (nombre | enrollmentId):\n'
        + rows.map(r => `- ${r.name} | ${r.enrollment_id}`).join('\n');
    }
  }

  const today = todayISO();
  const systemPrompt =
    `Eres un asistente que interpreta comandos de voz para un sistema de inasistencias escolares.` +
    ` El usuario habla en español y pide registrar una falta o atraso de un estudiante.` +
    ` Hoy es ${today}. Responde ÚNICAMENTE con JSON válido sin markdown, sin explicaciones.`;

  const userPrompt =
    `Comando de voz: "${transcription}"` +
    studentContext +
    `\n\nDevuelve:\n{\n` +
    `  "enrollmentId": <número del enrollmentId del estudiante mencionado, o null si no encontrado>,\n` +
    `  "studentName": "<nombre del estudiante tal como aparece en la lista>",\n` +
    `  "type": "F" o "AT"  (F=falta/ausente, AT=atraso/tarde),\n` +
    `  "dateFrom": "<YYYY-MM-DD>",\n` +
    `  "dateTo": "<YYYY-MM-DD>",\n` +
    `  "confidence": <0.0 a 1.0>\n` +
    `}`;

  const llmResp = await fetch(`${LLM_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: llmHeaders(),
    body: JSON.stringify({
      model: 'local',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens: 256,
      temperature: 0.1,
    }),
  });
  if (!llmResp.ok) throw new Error(`LLM error ${llmResp.status}: ${await llmResp.text()}`);

  const llmData = await llmResp.json() as { choices: { message: { content: string } }[] };
  let raw = llmData.choices[0].message.content.trim();
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1, -1).join('\n');

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`LLM devolvió JSON inválido: ${raw.slice(0, 200)}`); }

  const enrollmentId = typeof parsed.enrollmentId === 'number' ? parsed.enrollmentId : null;
  if (!enrollmentId) throw new Error(`No se pudo identificar al estudiante en el comando de voz. ${transcription}`);

  const rawType  = String(parsed.type ?? 'F').toUpperCase();
  const dateFrom = String(parsed.dateFrom ?? today);

  return {
    transcription,
    enrollmentId,
    studentName: String(parsed.studentName ?? ''),
    type:        (rawType === 'AT' ? 'AT' : 'F') as 'F' | 'AT',
    dateFrom,
    dateTo:      String(parsed.dateTo ?? dateFrom),
    confidence:  typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
  };
}
