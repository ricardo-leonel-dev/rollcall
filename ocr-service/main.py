import os, json, base64, httpx, psycopg2, psycopg2.extras
from datetime import date as date_class
from dateutil import parser as dateparser
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from PIL import Image
import io, re

app = FastAPI(title="OCR Service — School Attendance System")

VLLM_URL     = os.getenv("VLLM_URL", "http://vllm-vision:8000")
VISION_MODEL = os.getenv("VISION_MODEL", "local")
AI_API_KEY   = os.getenv("AI_API_KEY", "")
DB_URL       = os.getenv("DATABASE_URL", "postgresql://attendance:asistencia_local_2026@postgres:5432/attendance")
DB_SCHEMA    = os.getenv("DB_SCHEMA", "attendance")

# ─── DB ──────────────────────────────────────────────────────────────────────

def get_db():
    conn = psycopg2.connect(DB_URL)
    with conn.cursor() as cur:
        cur.execute(f"SET search_path TO {DB_SCHEMA}")
    return conn

# ─── NORMALIZACIÓN Y MATCHING ─────────────────────────────────────────────────

def normalize_name(name: str) -> str:
    return re.sub(r'\s+', ' ', name.strip().upper())

def match_name(ocr_name: str, candidates: dict) -> str | None:
    ocr_norm = normalize_name(ocr_name)
    if ocr_norm in candidates:
        return ocr_norm
    ocr_words = set(ocr_norm.split())
    best, best_score = None, 0
    for key in candidates:
        common = len(ocr_words & set(key.split()))
        if common >= 2 and common > best_score:
            best, best_score = key, common
    return best

# ─── OCR — LLAMADA A vLLM ────────────────────────────────────────────────────

PROMPT_OCR = """Analiza esta foto de un listado de inasistencias escolar escrito a mano.
Identifica todos los nombres y su tipo:
F = falta (ausente), AT = atraso (llegó tarde).
Si no se especifica el tipo asume F.
Responde ÚNICAMENTE con JSON válido sin markdown:
{
  "date": "DD/MM/YYYY o sin_fecha",
  "records": [
    {"name": "APELLIDO NOMBRE", "type": "F"}
  ]
}"""

def imagen_a_base64(imagen_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(imagen_bytes))
    if img.mode != "RGB":
        img = img.convert("RGB")
    if max(img.size) > 1024:
        img.thumbnail((1024, 1024), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("utf-8")

async def call_vllm(imagen_b64: str) -> dict:
    payload = {
        "model": VISION_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imagen_b64}"}},
                {"type": "text", "text": PROMPT_OCR}
            ]
        }],
        "max_tokens": 1024,
        "temperature": 0.1
    }
    headers = {"Authorization": f"Bearer {AI_API_KEY}"} if AI_API_KEY else {}
    async with httpx.AsyncClient(timeout=1800.0) as client:
        resp = await client.post(f"{VLLM_URL}/v1/chat/completions", json=payload, headers=headers)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Error vLLM: {resp.text[:300]}")
    texto = resp.json()["choices"][0]["message"]["content"].strip()
    if texto.startswith("```"):
        texto = "\n".join(texto.split("\n")[1:-1])
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail=f"Invalid JSON from model: {texto[:300]}")

# ─── ENDPOINTS ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{VLLM_URL}/health")
            vllm_ok = r.status_code == 200
    except Exception:
        vllm_ok = False
    return {"status": "ok" if vllm_ok else "degraded", "vllm": vllm_ok, "model": VISION_MODEL}

@app.post("/process-photo")
async def process_photo(
    foto: UploadFile = File(...),
    course_id: int = Form(...),
    academic_year_id: int = Form(...),
    list_date: str = Form("", alias="date")
):
    if not foto.content_type or not foto.content_type.startswith("image/"):
        raise HTTPException(400, "Only image files are accepted")

    imagen_bytes = await foto.read()
    if len(imagen_bytes) > 15 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 15MB)")

    imagen_b64 = imagen_a_base64(imagen_bytes)
    datos = await call_vllm(imagen_b64)

    fecha_str = list_date.strip() if list_date.strip() else datos.get("date", "")
    try:
        if fecha_str and fecha_str not in ("sin_fecha", ""):
            fecha_uso = dateparser.parse(fecha_str, dayfirst=True).date()
        else:
            fecha_uso = date_class.today()
    except Exception:
        fecha_uso = date_class.today()

    conn = get_db()
    cur  = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    cur.execute("SELECT institution_id FROM courses WHERE id = %s", (course_id,))
    course_row = cur.fetchone()
    if not course_row:
        raise HTTPException(404, "Course not found")
    institution_id = course_row['institution_id']

    cur.execute("""
        SELECT m.id AS enrollment_id, e.name
        FROM enrollments m
        JOIN students e ON e.id = m.student_id
        WHERE m.course_id = %s
          AND m.academic_year_id = %s
          AND m.deleted_at IS NULL
          AND e.deleted_at IS NULL
    """, (course_id, academic_year_id))

    enrollments = {normalize_name(r['name']): r['enrollment_id'] for r in cur.fetchall()}

    creados, no_encontrados = 0, []
    records = datos.get("records", [])

    for reg in records:
        nombre = reg.get("name", "")
        tipo   = reg.get("type", "F").upper()
        if tipo == "A":  # el modelo a veces sigue usando la convención vieja
            tipo = "F"
        if tipo not in ("F", "AT"):
            tipo = "F"

        matched = match_name(nombre, enrollments)
        if matched:
            enroll_id = enrollments[matched]
            cur.execute("""
                INSERT INTO absences (institution_id, enrollment_id, date, type, photo_source)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (enrollment_id, date)
                DO UPDATE SET type = EXCLUDED.type, updated_at = NOW()
            """, (institution_id, enroll_id, fecha_uso, tipo, foto.filename))
            creados += 1
        else:
            no_encontrados.append(nombre)

    cur.execute("""
        INSERT INTO photo_logs
          (institution_id, filename, list_date, course_id, academic_year_id, records_created, records_not_found)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (institution_id, foto.filename, fecha_uso, course_id, academic_year_id, creados, no_encontrados))

    conn.commit()
    cur.close()
    conn.close()

    return {
        "date": fecha_uso.isoformat(),
        "records_created": creados,
        "not_found": no_encontrados,
        "total_in_photo": len(records)
    }
