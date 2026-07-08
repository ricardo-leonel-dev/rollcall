# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

School attendance management system (SaaS, multi-tenant). Supports manual absence entry, OCR from handwritten photo lists, and voice-to-absence via Whisper + LLM.

## Services & Ports

| Service | Tech | Port | Purpose |
|---|---|---|---|
| `frontend` | Angular 22 + PWA + Tailwind | 80 | UI served by Nginx; proxies `/api/*` to backend |
| `backend` | Node 22 + Express 5 + TypeScript | 3000 | Main REST API |
| `excel-service` | Go + pgx | 8002 | Export attendance report to `.xlsx` template |
| `postgres` | PostgreSQL 16 | 5432 | Primary DB |
| `redis` | Redis 7 | 6379 | BullMQ job queues for voice and photo processing |

## Development Commands

### Backend
```bash
cd backend
pnpm install
pnpm dev          # ts-node-dev with hot reload -> localhost:3000
pnpm build        # tsc -> dist/
pnpm start        # run compiled dist/app.js
```

### Frontend
```bash
cd frontend
pnpm install
pnpm start        # ng serve -> localhost:4200
pnpm build        # ng build --configuration production
```

### Full stack (Docker)
```bash
cp .env.example .env   # fill in secrets
docker compose up -d
docker compose logs -f backend
```

### Database
```bash
# Apply new migration SQL manually — no ORM migrations exist
psql $DATABASE_URL -f postgres/NN_migration.sql
# Seed runs automatically on backend startup (creates superadmin user)
```

No test or lint scripts are configured in either `backend/package.json` or `frontend/package.json`.

## Architecture

### Backend Controller/Service Pattern

Every resource follows a strict 1:1 pairing:
- `controllers/<resource>.controller.ts` — Express route handlers, req/res parsing, HTTP status codes
- `services/<resource>.service.ts` — business logic and raw DB queries via `AppDataSource.query()`

DB queries go in services; HTTP response logic goes in controllers. Never mix the two.

### Multi-tenancy & Authorization Model

Every protected route passes through two middleware layers in this order:

1. **`authMiddleware`** — verifies JWT, sets `req.user` (`id`, `roleId`, `institutionId`)
2. **`institutionMiddleware`** — sets `req.institutionId` and `req.courseIds`

`req.courseIds` is the course-scope filter:
- `null` = sees all courses in the institution (rector, admin, general inspector)
- `number[]` = scoped to only those courses (teacher, block inspector)

Superadmins have `institutionId === null` in the JWT and select institutions via the `X-Institution-Id` request header. Regular users are permanently bound to their institution.

Role-based permissions are checked per-resource with `requirePermission(resource, action)` (`middleware/role.middleware.ts`), querying the `role_permissions` table (CRUD flags per role per resource name).

Module visibility (which sidebar items appear) is controlled by `user_modules` rows per user, enforced by `moduleGuard` on the frontend.

### Voice Absence Pipeline

1. Frontend records audio -> `POST /api/ai/voice-absence`
2. Backend enqueues a BullMQ job in the `voice-absence` queue (Redis)
3. Worker (`workers/voice-absence.worker.ts`) picks it up:
   - Calls Whisper (transcription) -> `WHISPER_URL`
   - Calls LLM (parse student name + date + type) -> `LLM_URL`
   - Returns `VoiceAbsencePreview` via job polling
4. Frontend previews result; user confirms -> `POST /api/absences`
5. All jobs (success and failure) are logged to `voice_absence_logs` table
6. Bull Board dashboard at `GET /api/admin/queues` (cookie-auth via `POST /api/admin/queues-session`)

### Photo Absence Pipeline

Mirrors the voice pipeline — same BullMQ pattern, preview before confirm:

1. Frontend uploads photo -> `POST /api/ai/photo-absence` (multipart: `image`, `course_id`, `academic_year_id`, optional `date`)
2. Backend enqueues a BullMQ job in the `photo-absence` queue (Redis)
3. Worker (`workers/photo-absence.worker.ts`) picks it up:
   - Calls vision-capable LLM (`IMAGE_LLM_URL`) with base64 image + enrolled student roster as context
   - Returns `PhotoAbsencePreview` with `matched[]`, `notFound[]`, `total`
4. Frontend previews result; user confirms each match -> `POST /api/absences`
5. Job results are logged to `photo_absence_logs` table
6. Job polling uses the same `GET /api/jobs/:id` endpoint as voice

### Database Schema

TypeORM is used with `synchronize: false` — all schema changes must be applied via manual SQL files in `postgres/` (numbered `01_init.sql` through `10_voice_absence_logs.sql`).

Raw `AppDataSource.query()` calls bypass TypeORM's entity system. The `extra.options` setting on the DataSource (`-c search_path=…`) ensures raw queries also hit the correct schema — without it, raw queries fail on non-public schemas.

Key entity relationships:
- `Institution` -> `AcademicYear` -> `Course` (via `CourseAcademicYear`)
- `Student` -> `Enrollment` (per course per year per institution) -> `Absence`
- `Absence` <- `JustificationAbsence` -> `Justification` (with optional `JustificationAttachment`)
- `User` -> `Role` -> `RolePermission[]` (CRUD flags per resource name)
- `User` -> `UserCourse[]` (course-scope, per academic year)
- `User` -> `UserModule[]` (which modules the user can see)
- `PhotoLog` — audit trail para OCR legacy (no usar; ver `photo_absence_logs` para el pipeline actual)
- `photo_absence_logs` — audit trail para el pipeline photo-absence (paralelo a `voice_absence_logs`)

### Frontend Architecture

Angular 22 with standalone components throughout (no NgModule). All routes use lazy-loaded components. Key services:

- **`AuthService`** — JWT storage, login/logout, `canAccessModule(key)` used by `moduleGuard`
- **`AcademicYearContextService`** — globally selected academic year; most list views react to it
- **`InstitutionContextService`** — superadmin institution switcher; sends `X-Institution-Id` header
- **`NotificationService`** — toast wrapper

Components are colocated with their dialogs in the same feature folder. Dialogs use Angular Material `MatDialog`.

Two functional interceptors in `frontend/src/app/core/interceptors/` apply globally to all HTTP calls:
- `authInterceptor` — attaches `Authorization: Bearer <token>` and `X-Institution-Id` automatically
- `errorInterceptor` — handles HTTP error responses globally

New protected routes must include `canActivate: [moduleGuard]` with `data: { module: '<key>' }`, where `<key>` matches a `user_modules.module_key` value. Current keys: `dashboard`, `absences`, `calendar`, `justifications`, `students`, `enrollments`, `admin`.

Static uploads are served at `/api/uploads/<type>/` (avatars, logos, justifications). The backend creates these directories on startup from `process.cwd()/uploads/`.

### Excel Export

The Go `excel-service` fills a fixed `.xlsx` template (`excel-service/plantilla_asistencia.xlsx`) using data from PostgreSQL. The backend calls it internally; the frontend hits `GET /api/export/excel`.

## Key Environment Variables

See `.env.example` for all variables. Critical ones:
- `LLM_URL` — text LLM endpoint (OpenAI-compatible) for voice absence parsing
- `WHISPER_URL` — audio transcription endpoint (faster-whisper or compatible)
- `IMAGE_LLM_URL` — vision-capable LLM endpoint for photo absence parsing; defaults to `LLM_URL` in code if unset
- `LLM_API_KEY` — Bearer token shared between backend and the LLM endpoints
- `REDIS_URL` — BullMQ connection (defaults to `redis://redis:6379`)
- `DB_SCHEMA` — PostgreSQL schema name
- `BULL_BOARD_USER` / `BULL_BOARD_PASS` — credentials for the queue dashboard

## Deployment

- **Production**: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
- **Frontend builds**: pre-built tarballs (`frontend-build-*.tar.gz`) are used when deploying to a VPS without a build step
- **Supabase**: some migration files have a `_supabase` variant that omits unsupported DDL
