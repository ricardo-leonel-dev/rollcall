# Requirements — Backend: conteo de estudiantes/cursos/usuarios por institución

Context: la entidad `Institution` (`src/entities/Institution.ts`) expone hoy `id`, `name`,
`isActive`, `logoUrl`, `primaryColor`, `secondaryColor`, `createdAt`, `updatedAt`. El endpoint
`GET /api/institutions` (`src/controllers/institution.controller.ts:30` →
`src/services/institution.service.ts:17`) devuelve esa forma plana y nada más. La feature
prerrequisito `admin_institutions_cuaderno_seal` (frontend) necesita mostrar un sello por
institución con tres conteos — estudiantes, cursos, usuarios — calculados con el aislamiento
multi-tenant ya existente. Este spec define ese contrato de respuesta en el backend; el cambio
del modelo frontend vive en otro repositorio y queda fuera de alcance.

Alcance del endpoint: sólo `GET /api/institutions` (el listado). No existe hoy — ni se agrega en
esta feature — un `GET /api/institutions/:id`; `src/controllers/institution.controller.ts` sólo
monta `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` y `POST /:id/logo/upload`, y
`src/services/institution.service.ts#findById` sólo se usa internamente desde `update`, `remove`
y `updateLogo` — nunca desde una ruta. El frontend tampoco llama a ese endpoint (sólo `PUT`/
`DELETE`/`POST .../logo/upload` por id). Agregar un endpoint nuevo está fuera de alcance del
criterio de aceptación original, que sólo pide que el listado lleve los 3 conteos.

Filtro de "fila activa" para los conteos: `deleted_at IS NULL` únicamente — **sin** `is_active =
TRUE`. Esto se aparta deliberadamente de la convención general de soft-delete descrita en
`docs/architecture.md` §4 (`deletedAt` + `isActive` como par) porque las queries `findAll` que ya
alimentan las páginas de listado de Students/Courses/Users (`src/services/student.service.ts`,
`src/services/course.service.ts`, `src/services/user.service.ts`) sólo filtran `deletedAt IS
NULL` — no comprueban `isActive`. Un estudiante/curso/usuario desactivado (`is_active = false`)
pero no eliminado ya aparece hoy en esas páginas de listado; esta feature debe contar exactamente
las mismas filas que esas páginas ya muestran (ver `design.md` para la justificación completa de
esta decisión).

Definición de los conteos (la justificación de cada elección está en `design.md`):

- **students**: cantidad de filas en `students` con `institution_id = X AND deleted_at IS NULL`.
  Es el padrón vigente de "estudiantes de la institución" (el mismo conjunto que ve
  `GET /api/students`); no se cuentan `enrollments` (un estudiante puede tener varias matrículas
  a lo largo de los años y/o en varios cursos).
- **courses**: cantidad de filas en `courses` con `institution_id = X AND deleted_at IS NULL`. Es
  el catálogo de cursos de la institución, persistente a través de los años lectivos (el mismo
  conjunto que ve `GET /api/courses`); no se cuentan filas de `course_academic_years` (esa tabla
  liga cursos a un año lectivo específico).
- **users**: cantidad de filas en `users` con `institution_id = X AND deleted_at IS NULL`. Quedan
  excluidos los superadmins por construcción (su `institution_id` es `NULL`, el mismo conjunto
  que ve `GET /api/users`); también excluidos los soft-deletes.

Alineación con el criterio de aceptación:

- "El endpoint de instituciones devuelve los 3 conteos por institución" → **R1, R2**.
- "Los conteos respetan el aislamiento multi-tenant" → **R3, R4, R5**.
- "El modelo frontend se actualiza" → fuera de alcance de este repo; ver **R6** que fija el
  contrato.
- "No se rompe ningún consumidor existente" → **R7, R8**.

## R1

`GET /api/institutions` SHALL devolver, por cada institución del listado, un objeto con todos
los campos existentes de `Institution` (`id`, `name`, `isActive`, `logoUrl`, `primaryColor`,
`secondaryColor`, `createdAt`, `updatedAt`) más un campo adicional `stats` con la forma
`{ students: number, courses: number, users: number }`.

## R2

For each institution `i` in the response of `GET /api/institutions`, `i.stats.students` SHALL
equal the count of `students` rows with `institution_id = i.id AND deleted_at IS NULL`, and
SHALL be a non-negative integer.

## R3

For each institution `i` in the response of `GET /api/institutions`, `i.stats.courses` SHALL
equal the count of `courses` rows with `institution_id = i.id AND deleted_at IS NULL`, and SHALL
be a non-negative integer.

## R4

For each institution `i` in the response of `GET /api/institutions`, `i.stats.users` SHALL equal
the count of `users` rows with `institution_id = i.id AND deleted_at IS NULL`, and SHALL be a
non-negative integer.

## R5

WHEN the `students`, `courses`, or `users` table contains no rows that match `institution_id = i.id
AND deleted_at IS NULL` for a given institution `i`, THEN
`i.stats.{students|courses|users}` SHALL equal `0` (no `undefined`, no `null`, no omisión del
campo).

## R6

The fields of the `stats` object — names and types — SHALL be exactly `students: number`,
`courses: number`, `users: number`, in that order (any equivalent JSON ordering is acceptable;
the names and types are the contract). Esta es la superficie observable por el frontend y
constituye el contrato inter-repo.

## R7

The fields returned for each institution other than `stats` SHALL be byte-identical in name and
type to the pre-feature response: `id: number`, `name: string`, `isActive: boolean`,
`logoUrl: string | null`, `primaryColor: string | null`, `secondaryColor: string | null`,
`createdAt: string` (ISO 8601), `updatedAt: string` (ISO 8601). Ningún consumidor existente
puede romperse por un cambio de tipo o de nombre en estos campos.

## R8

WHEN the implementation is complete, the system SHALL compile under `pnpm run build` with exit
code `0`, introducing no new TypeScript errors attributable to `src/services/institution.service.ts`
or `src/controllers/institution.controller.ts`.

## R9

WHEN the implementation is complete, the system SHALL be verified by a manual smoke test
documented in
`progress/impl_backend_conteo_de_estudiantes_cursos_usuarios_por_instituci_n.md`, covering at
minimum:

- (i) `GET /api/institutions` autenticado como superadmin (sin `X-Institution-Id`) → `200` con un
  arreglo donde cada elemento incluye `stats: { students, courses, users }` con conteos
  consistentes con un `SELECT COUNT(...) GROUP BY institution_id` ejecutado manualmente contra la
  base de datos para las mismas condiciones.
- (ii) `GET /api/institutions` autenticado como un usuario ligado a una institución (no
  superadmin) → `200`, mismo formato de respuesta.
- (iii) Aislamiento: para dos instituciones `A` y `B` con cantidades distintas, los `stats` de
  `A` no deben contener filas de `B` y viceversa (verificable comparando con dos `SELECT
  COUNT(...)` separados).
- (iv) Institución sin estudiantes / sin cursos / sin usuarios → sus conteos son `0`, no faltan
  campos.
- (v) Regresión: el endpoint conserva los campos previos (`id`, `name`, `isActive`, `logoUrl`,
  `primaryColor`, `secondaryColor`, `createdAt`, `updatedAt`) en cada elemento, byte-identical.

Cada caso SHALL capturar verbatim request/response en la sección Traceability del archivo de
progreso.
