# Sistema de Asistencia Escolar — AGENTS.md

Este archivo es leído automáticamente por Claude Code al iniciar en este directorio.
Contiene las convenciones, restricciones y contexto del proyecto.

---

## Descripción del proyecto

Sistema de gestión de inasistencias escolares para la Unidad Educativa Particular "Tia Blanquita".
Permite registrar faltas/atrasos desde fotos de listas manuscritas o manualmente,
justificarlas, y exportar reportes en formato Excel oficial.

---

## Arquitectura de servicios

```
frontend/      → Angular 22 SPA + PWA (Nginx, puerto 80)
backend/       → Node.js 22 + Express 5 + TypeScript (puerto 3000)
ocr-service/   → Python 3.11 + FastAPI (puerto 8001) — solo OCR de fotos
postgres/      → PostgreSQL 16
```

Nginx proxea:
- `/api/*`  → backend:3000
- `/ocr/*`  → ocr-service:8001
- `/*`      → Angular SPA

AI Stack adicional (no tocar):
- `ollama-chat`  → GPU 0, qwen2.5:7b, chat familiar
- `vllm-vision`  → GPU 1+2, qwen2.5vl:7b, OCR de imágenes
- `open-webui`   → puerto 3001, interfaz chat
- `tailscale`    → acceso remoto

---

## Archivos que NUNCA se deben modificar

- `postgres/init.sql` — contiene 27 cursos y 766 estudiantes ya importados
  del año lectivo 2026-2027. Modificarlo romperá la BD.
- `ocr-service/plantilla_asistencia.xlsx` — plantilla oficial de la institución
  para exportar reportes. No regenerar ni sobreescribir.

---

## Stack tecnológico — versiones exactas

```
Node.js:          22 LTS
TypeScript:       5.9+
Express:          5.x
TypeORM:          0.3.x
Angular:          22 (lanzado 3 junio 2026)
Angular Material: 22
Python:           3.11
FastAPI:          latest
PostgreSQL:       16
```

---

## Convenciones de base de datos

### Reglas estrictas
- Nombres de tablas y campos en **inglés**, snake_case
- Cada tabla tiene: `id SERIAL PRIMARY KEY`, `created_at`, `updated_at`, `deleted_at`
- **NUNCA usar DELETE físico** — siempre soft delete: `deleted_at = NOW(), is_active = FALSE`
- Todas las queries filtran `WHERE deleted_at IS NULL`
- La edad SIEMPRE se calcula en tiempo real: `DATE_PART('year', AGE(NOW(), birth_date))::INTEGER`
  — nunca almacenar la edad como campo

### Tablas principales
```
academic_years       → años lectivos
courses              → cursos (independientes del año)
course_academic_year → docente por curso+año (cambia cada año)
guardians            → representantes legales
students             → datos fijos del estudiante
enrollments          → matrícula: estudiante+curso+año+representante
absences             → inasistencias (type: 'A'=ausente, 'AT'=atraso)
justifications       → justificaciones de faltas
justification_absences → pivot: qué faltas cubre cada justificación
photos_log           → log de fotos procesadas por OCR
roles                → roles del sistema
role_permissions     → permisos por rol y recurso
users                → usuarios del sistema
```

### Regla de justificaciones IMPORTANTE
- El campo `type` en `absences` NUNCA cambia a 'J'
- Una falta se considera justificada si EXISTS en `justification_absences`
- En el Excel exportado aparece 'J' si está justificada, pero en BD sigue siendo 'A' o 'AT'

### whatsapp_link
- Siempre opcional en guardians
- Formato: `https://wa.me/5939XXXXXXXX` (código Ecuador +593)

---

## Convenciones Angular 22 — OBLIGATORIAS

### Usar siempre
- **Signal Forms** — `signalForm()`, `signalControl()` — nunca FormGroup/FormControl
- **Selectorless Components** — importar componentes directamente sin string selectors
- **Zoneless** — sin Zone.js en ningún componente
- **OnPush** — detección de cambios por defecto en TODOS los componentes
- **Signals** — `signal()`, `computed()`, `effect()` para todo el estado
- **httpResource()** — para todas las llamadas HTTP reactivas
- **@if, @for, @switch** — nuevo control flow en todos los templates
- **Standalone components** — sin NgModules

### NUNCA usar en Angular 22
- `NgModules`
- `Zone.js`
- `FormGroup`, `FormControl`, `FormBuilder` (Reactive Forms)
- `NgRx` ni `BehaviorSubject` para estado
- `*ngIf`, `*ngFor`, `*ngSwitch` (directivas antiguas)
- String selectors en templates cuando se puede usar selectorless

---

## Convenciones del backend (Node.js)

### Estructura de carpetas
```
backend/src/
├── entities/     → TypeORM entities (una por tabla)
├── dtos/         → class-validator DTOs (CreateXxx, UpdateXxx)
├── controllers/  → un archivo por recurso
├── services/     → lógica de negocio
├── middleware/   → auth.middleware.ts, role.middleware.ts, error.middleware.ts
└── app.ts        → setup Express
```

### Autenticación y permisos
- JWT Bearer token en todos los endpoints
- Middleware de roles verifica `role_permissions` por recurso y acción
- Recursos: `students`, `absences`, `justifications`, `guardians`,
  `enrollments`, `courses`, `academic_years`, `users`, `roles`, `dashboard`

### Roles y sus permisos
```
admin      → todo sin restricciones
rector     → todo + soft delete de cualquier cosa
inspector  → CRUD estudiantes, años, representantes, inasistencias,
             justificaciones, docentes, matrículas
teacher    → crear/actualizar estudiantes e inasistencias, sin delete
readonly   → solo lectura
```

---

## Convenciones del OCR service (Python)

- Solo se encarga del procesamiento de fotos
- Llama a vLLM en `http://vllm-vision:8000/v1/chat/completions`
- Modelo: `qwen2.5vl:7b`
- Redimensionar imágenes a máx 1024px antes de enviar
- Fuzzy matching: normalizar a uppercase, match si ≥2 palabras coinciden
- El resultado se guarda directamente en PostgreSQL (misma BD que el backend)

---

## Variables de entorno (.env)

```
# Tailscale
TS_AUTHKEY=

# PostgreSQL
POSTGRES_DB=asistencia
POSTGRES_USER=asistencia
POSTGRES_PASSWORD=

# JWT
JWT_SECRET=
JWT_EXPIRES_IN=8h

# URLs internas
DATABASE_URL=postgresql://asistencia:PASSWORD@postgres:5432/asistencia
VLLM_URL=http://vllm-vision:8000
OLLAMA_URL=http://ollama-chat:11434
```

---

## Responsive y PWA

El frontend debe funcionar correctamente en:
- **Móvil** (<768px): menú hamburguesa, tablas como cards, cámara nativa para fotos
- **Tablet** (768-1024px): sidebar colapsable, tablas con columnas reducidas
- **Desktop** (>1024px): sidebar fijo, layout completo

PWA configurado con `@angular/pwa`:
- Instalable desde móvil como app nativa
- Service worker con caché de assets estáticos
- Acceso offline a listados en caché

---

## Flujo del procesamiento de fotos

1. Usuario selecciona año lectivo + curso + fecha en la interfaz
2. Sube foto del listado manuscrito (o la toma con la cámara del celular)
3. Frontend envía a `POST /ocr/process-photo`
4. OCR service redimensiona la imagen
5. Envía a vLLM con prompt específico para extraer nombres y tipo (A/AT)
6. Fuzzy matching contra enrollments activos del curso+año
7. INSERT en `absences` para cada nombre reconocido
8. Retorna: reconocidos, no encontrados, fecha usada
9. Los no encontrados se pueden agregar manualmente desde la misma pantalla

---

## Exportación Excel

- Usa `ocr-service/plantilla_asistencia.xlsx` como base (no regenerar)
- Fila 7: meses, Fila 10: días del mes, Filas 11+: estudiantes
- Llena celdas con 'A', 'AT' o 'J' según los registros del período
- 'J' aparece si la falta tiene registro en `justification_absences`
- Descarga como archivo adjunto desde `GET /api/export/excel`

---

## Comandos útiles

```bash
# Levantar todo el stack
docker compose up -d

# Ver logs de un servicio específico
docker logs -f backend
docker logs -f frontend
docker logs -f ocr-service

# Rebuild solo frontend después de cambios
docker compose up -d --build frontend

# Rebuild solo backend
docker compose up -d --build backend

# Ver estado de las GPUs
nvidia-smi

# Acceder a PostgreSQL
docker exec -it postgres psql -U asistencia -d asistencia

# Ver estudiantes cargados
docker exec postgres psql -U asistencia -d asistencia \
  -c "SELECT c.name, COUNT(e.id) FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id GROUP BY c.name ORDER BY c.name;"
```

---

## Contexto institucional

- Institución: Unidad Educativa Particular "Tia Blanquita"
- Año lectivo activo: 2026-2027
- Cursos: 27 (8vo A-D BS, 9no A-E BS, 10mo A-F BS, 1ero-3ero A-D BGU)
- Estudiantes: 766
- Códigos de inasistencia: A (ausente), AT (atraso)
- Trimestres: 1ero (mayo-julio), 2do (agosto-octubre), 3ero (noviembre-enero)
