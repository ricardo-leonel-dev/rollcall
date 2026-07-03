CREATE TABLE IF NOT EXISTS attendance.voice_absence_logs (
  id               SERIAL PRIMARY KEY,
  job_id           VARCHAR(50)   NOT NULL,
  institution_id   INT           NOT NULL REFERENCES attendance.institutions(id),
  course_id        INT,
  academic_year_id INT,
  enrollment_id    INT           REFERENCES attendance.enrollments(id),
  transcription    TEXT,
  student_name     VARCHAR(255),
  absence_type     CHAR(2),
  date_from        DATE,
  date_to          DATE,
  confidence       NUMERIC(4,3),
  status           VARCHAR(20)   NOT NULL DEFAULT 'completed',
  error_reason     TEXT,
  confirmed        BOOLEAN,
  absence_id       INT           REFERENCES attendance.absences(id),
  processing_ms    INT,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS voice_absence_logs_institution_created_idx
  ON attendance.voice_absence_logs (institution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS voice_absence_logs_job_id_idx
  ON attendance.voice_absence_logs (job_id);
