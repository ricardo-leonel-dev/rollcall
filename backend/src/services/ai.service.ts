import { AppDataSource } from '../data-source';

const WHISPER_URL     = process.env.WHISPER_URL ?? '';
const LLM_URL         = process.env.LLM_URL ?? '';
const LLM_API_KEY     = process.env.LLM_API_KEY ?? '';
const IMAGE_LLM_URL   = process.env.IMAGE_LLM_URL || LLM_URL;

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

function spokenNameMatchesRoster(spoken: string, roster: string): boolean {
  const words = (s: string) =>
    s.toLowerCase()
     .normalize('NFD').replace(/[̀-ͯ]/g, '')
     .split(/\s+/).filter(w => w.length >= 3);
  const sw = words(spoken);
  const rw = words(roster);
  return sw.some(s => rw.some(r => r.startsWith(s.slice(0, 4)) || s.startsWith(r.slice(0, 4))));
}

function todayContext(): { iso: string; label: string } {
  const now = new Date();
  const iso = now.toISOString().split('T')[0];
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return { iso, label: days[now.getDay()] };
}

export async function parseVoiceAbsence(
  audioBuffer: Buffer,
  mimeType: string,
  institutionId: number,
  courseId?: number,
  academicYearId?: number,
  onTranscribed?: (t: string) => Promise<void>,
): Promise<VoiceAbsencePreview> {
  if (!courseId || !academicYearId) {
    throw new Error('Debes seleccionar un curso antes de registrar una inasistencia por voz');
  }

  const transcription = await transcribeAudio(audioBuffer, mimeType);
  if (onTranscribed) await onTranscribed(transcription);

  const rows = await fetchEnrollments(courseId, academicYearId, institutionId);
  let studentContext = '';
  if (rows.length) {
    studentContext = '\nEstudiantes del curso (nombre | enrollmentId):\n'
      + rows.map(r => `- ${r.name} | ${r.enrollment_id}`).join('\n');
  }

  const today = todayContext();
  const systemPrompt =
    `Eres un asistente que interpreta comandos de voz para un sistema de inasistencias escolares.` +
    ` El usuario habla en español y pide registrar una falta o atraso de un estudiante.` +
    ` Hoy es ${today.iso} (${today.label}). Responde ÚNICAMENTE con JSON válido sin markdown, sin explicaciones.`;

  const userPrompt =
    `Comando de voz: "${transcription}"` +
    studentContext +
    `\n\nIMPORTANTE: Si el nombre mencionado NO coincide claramente con algún estudiante de la lista (incluso aproximadamente), devuelve enrollmentId: null, spokenName con el nombre que escuchaste, y confidence menor a 0.5. NO elijas el estudiante más parecido si el nombre es diferente. Solo asigna un enrollmentId si hay una coincidencia obvia.\n` +
    `\nDevuelve:\n{\n` +
    `  "spokenName": "<nombre exacto que escuchaste en el audio, sin modificar>",\n` +
    `  "enrollmentId": <número del enrollmentId del estudiante mencionado, o null si no encontrado>,\n` +
    `  "studentName": "<nombre del estudiante tal como aparece en la lista, o cadena vacía si no encontrado>",\n` +
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

  const validIds = new Set(rows.map(r => r.enrollment_id));
  if (rows.length > 0 && !validIds.has(enrollmentId)) {
    throw new Error('No se pudo identificar al estudiante en el comando de voz');
  }

  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
  if (confidence < 0.65) {
    throw new Error(`No se pudo identificar con certeza al estudiante en el audio. ${transcription}`);
  }

  const spokenName  = String(parsed.spokenName ?? '');
  const studentName = String(parsed.studentName ?? '');
  if (spokenName && studentName && !spokenNameMatchesRoster(spokenName, studentName)) {
    throw new Error(`El nombre mencionado ("${spokenName}") no coincide con ningún estudiante del curso. ${transcription}`);
  }

  const rawType  = String(parsed.type ?? 'F').toUpperCase();
  const dateFrom = String(parsed.dateFrom ?? today.iso);

  return {
    transcription,
    enrollmentId,
    studentName: String(parsed.studentName ?? ''),
    type:        (rawType === 'AT' ? 'AT' : 'F') as 'F' | 'AT',
    dateFrom,
    dateTo:      String(parsed.dateTo ?? dateFrom),
    confidence,
  };
}

// ─── Photo Absence ────────────────────────────────────────────────────────────

export interface PhotoAbsenceItem {
  enrollmentId: number;
  studentName:  string;
  ocrName:      string;
  type:         'F' | 'AT';
  date:         string;
  confidence:   number;
}

export interface PhotoAbsencePreview {
  date:     string;
  matched:  PhotoAbsenceItem[];
  notFound: string[];
  total:    number;
}

const PHOTO_SYSTEM_PROMPT =
  `Eres un asistente que interpreta fotos de listas de inasistencias escolares escritas a mano.` +
  ` Analiza la imagen y extrae cada nombre con su tipo de inasistencia.` +
  ` Tipos: F = falta (ausente), AT = atraso (llegó tarde). Si no se especifica el tipo asume F.` +
  ` Para cada nombre detectado, identifica el enrollmentId que corresponde en la lista de estudiantes.` +
  ` Responde ÚNICAMENTE con JSON válido sin markdown, sin explicaciones.`;

export async function parsePhotoAbsence(
  imageBuffer: Buffer,
  mimeType: string,
  institutionId: number,
  courseId: number,
  academicYearId: number,
  dateOverride?: string,
): Promise<PhotoAbsencePreview> {
  const rows = await fetchEnrollments(courseId, academicYearId, institutionId);

  const rosterContext = rows.length
    ? '\nEstudiantes del curso (nombre | enrollmentId):\n' + rows.map(r => `- ${r.name} | ${r.enrollment_id}`).join('\n')
    : '';

  const today = todayContext();
  const dateHint = dateOverride ? `La fecha de la lista es ${dateOverride}.` : `Hoy es ${today.iso}.`;

  const userPromptText =
    `${dateHint} Extrae todos los nombres e inasistencias de la foto.` +
    rosterContext +
    `\n\nDevuelve:\n{\n` +
    `  "date": "<YYYY-MM-DD de la lista, o sin_fecha>",\n` +
    `  "records": [\n` +
    `    { "name": "<nombre tal como aparece en la foto>", "enrollmentId": <número o null>, "type": "F" o "AT", "confidence": <0.0-1.0> }\n` +
    `  ]\n` +
    `}`;

  const imageB64 = imageBuffer.toString('base64');
  const imageUrl = `data:${mimeType};base64,${imageB64}`;

  const llmResp = await fetch(`${IMAGE_LLM_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: llmHeaders(),
    body: JSON.stringify({
      model: 'local',
      messages: [
        { role: 'system', content: PHOTO_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text',      text: userPromptText },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.1,
    }),
  });
  if (!llmResp.ok) throw new Error(`LLM error ${llmResp.status}: ${await llmResp.text()}`);

  const llmData = await llmResp.json() as { choices: { message: { content: string } }[] };
  let raw = llmData.choices[0].message.content.trim();
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1, -1).join('\n');

  let parsed: { date?: string; records?: { name: string; enrollmentId: unknown; type?: string; confidence?: number }[] };
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`LLM devolvió JSON inválido: ${raw.slice(0, 200)}`); }

  const resolvedDate =
    dateOverride ??
    (parsed.date && parsed.date !== 'sin_fecha' ? parsed.date : today.iso);

  const validIds = new Map(rows.map(r => [r.enrollment_id, r.name]));
  const matched: PhotoAbsenceItem[] = [];
  const notFound: string[] = [];

  for (const rec of parsed.records ?? []) {
    const ocrName    = String(rec.name ?? '').trim();
    const confidence = typeof rec.confidence === 'number' ? rec.confidence : 0.5;
    const rawType    = String(rec.type ?? 'F').toUpperCase();
    const type       = (rawType === 'AT' ? 'AT' : 'F') as 'F' | 'AT';
    const enrollmentId = typeof rec.enrollmentId === 'number' ? rec.enrollmentId : null;

    if (!enrollmentId || !validIds.has(enrollmentId)) {
      notFound.push(ocrName);
      continue;
    }

    const studentName = validIds.get(enrollmentId)!;
    if (!spokenNameMatchesRoster(ocrName, studentName)) {
      notFound.push(ocrName);
      continue;
    }

    matched.push({ enrollmentId, studentName, ocrName, type, date: resolvedDate, confidence });
  }

  return {
    date:     resolvedDate,
    matched,
    notFound,
    total:    (parsed.records ?? []).length,
  };
}
