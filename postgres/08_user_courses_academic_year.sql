-- ================================================================
-- Migration 08: año lectivo único activo + user_courses por año
-- La base real usa el schema "public" (DB_SCHEMA=public en .env) —
-- los archivos anteriores (01-07) dicen "attendance" pero ese schema
-- es inerte en esta instalación. Este archivo usa "public." explícito
-- en cada statement para no depender de search_path.
-- ================================================================

-- ─── 1. Resolver instituciones con más de un año "activo" hoy ────────
-- Antes de poder forzar unicidad, dejamos activo solo el más reciente
-- por nombre (mismo criterio que ya usa academic-year.service.ts:
-- ORDER BY name DESC — funciona porque el nombre sigue el patrón
-- "AAAA-AAAA"). created_at NO sirve aquí: un año académicamente más
-- viejo puede haberse insertado en la base más tarde que uno más nuevo.
UPDATE public.academic_years a
SET is_active = FALSE
WHERE a.is_active = TRUE
  AND a.deleted_at IS NULL
  AND a.id <> (
    SELECT b.id FROM public.academic_years b
    WHERE b.institution_id = a.institution_id
      AND b.is_active = TRUE
      AND b.deleted_at IS NULL
    ORDER BY b.name DESC, b.id DESC
    LIMIT 1
  );

-- ─── 2. Forzar un solo año activo por institución, de aquí en más ────
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_year_per_institution
  ON public.academic_years(institution_id)
  WHERE is_active AND deleted_at IS NULL;

-- ─── 3. user_courses con año lectivo ──────────────────────────────────
ALTER TABLE public.user_courses ADD COLUMN IF NOT EXISTS academic_year_id INTEGER;

-- Backfill: preservar el comportamiento actual de cada usuario asignando
-- sus filas existentes al año hoy activo de su institución. Esto NO es
-- la política de "año nuevo arranca vacío" (esa solo aplica a años que
-- se activen de ahora en adelante) — es solo evitar que el deploy borre
-- de golpe restricciones de visibilidad que ya existen en producción.
UPDATE public.user_courses uc
SET academic_year_id = ay.id
FROM public.users u
JOIN public.academic_years ay
  ON ay.institution_id = u.institution_id
 AND ay.is_active = TRUE
 AND ay.deleted_at IS NULL
WHERE uc.user_id = u.id
  AND uc.academic_year_id IS NULL;

-- Caso borde (no debería ocurrir hoy, pero por si una institución no
-- tiene ningún año activo): sin año al que asociar, no se puede
-- preservar esa fila bajo el nuevo modelo — se elimina antes del NOT NULL.
DELETE FROM public.user_courses WHERE academic_year_id IS NULL;

ALTER TABLE public.user_courses ALTER COLUMN academic_year_id SET NOT NULL;

ALTER TABLE public.user_courses
  ADD CONSTRAINT fk_user_courses_academic_year
  FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);

ALTER TABLE public.user_courses DROP CONSTRAINT IF EXISTS user_courses_user_id_course_id_key;
ALTER TABLE public.user_courses
  ADD CONSTRAINT user_courses_user_course_year_key UNIQUE (user_id, course_id, academic_year_id);

CREATE INDEX IF NOT EXISTS idx_user_courses_academic_year ON public.user_courses(academic_year_id);
