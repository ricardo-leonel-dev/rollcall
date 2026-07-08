-- Photo absence job audit log (parallel to voice_absence_logs)
CREATE TABLE IF NOT EXISTS attendance.photo_absence_logs (
  id               BIGSERIAL PRIMARY KEY,
  job_id           TEXT        NOT NULL,
  institution_id   INTEGER     NOT NULL,
  course_id        INTEGER,
  academic_year_id INTEGER,
  records_matched  INTEGER,
  records_not_found TEXT[],
  total_in_photo   INTEGER,
  status           TEXT        NOT NULL CHECK (status IN ('completed', 'failed')),
  error_reason     TEXT,
  processing_ms    INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
