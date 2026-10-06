# Design — Backend: conteo de estudiantes/cursos/usuarios por institución

## Estado actual (lo que ya existe, verificado en código)

- `src/controllers/institution.controller.ts:30` monta `GET /` con `requirePermission(R,'read')`
  y delega a `svc.findAll()` sin pasar contexto de tenant — la respuesta es la lista plana de
  instituciones de la tabla, sin conteos. El controller **no** monta `GET /:id` — sólo `GET /`,
  `POST /`, `PUT /:id`, `DELETE /:id` y `POST /:id/logo/upload` (verificado leyendo el archivo
  completo, 42 líneas). Esta feature no agrega esa ruta: el criterio de aceptación sólo pide que
  el listado (`GET /api/institutions`) lleve los 3 conteos.
- `src/services/institution.service.ts:17-19` — `findAll()` hace
  `repo().find({ order: { name: 'ASC' } })` y devuelve el listado crudo.
- `src/services/institution.service.ts:21-25` — `findById(id)` hace `findOne({ where: { id }
  })` y lanza 404 si no existe. Grep de `src/` completo confirma que **ningún controller la
  invoca**: sus únicos call sites son internos, dentro del propio `institution.service.ts`
  (`update`, `remove`, `updateLogo` la usan para cargar la entidad antes de mutarla). No está
  expuesta por ninguna ruta HTTP hoy, y esta feature no cambia eso — `findById` queda sin tocar
  (ver "Archivos a tocar" abajo).
- `src/middleware/institution.middleware.ts` — los usuarios ligados a una institución tienen
  `req.institutionId` fijado a la suya; los superadmins (`req.user.institutionId === null`)
  eligen institución vía header `X-Institution-Id`. **Importante**: hoy el controller de
  instituciones NO llama a `requireInstitution` (ver `institution.controller.ts`), así que
  `findAll()` corre sin restricción de `req.institutionId` para nadie con permiso
  `institutions:read` — esto se preserva tal cual (no es parte de esta feature ajustar el
  alcance del listado).
- Las entidades relevantes (`src/entities/`): `Student.institutionId` + `deletedAt` +
  `isActive`; `Course.institutionId` + `deletedAt` + `isActive`; `User.institutionId`
  (nullable, `null` para superadmins) + `deletedAt` + `isActive`. Las tablas
  `enrollments` y `course_academic_years` también existen pero su uso para este conteo se
  descarta (ver "Definición de los conteos" abajo).
- Patrón vigente de agregación multi-tenant: `src/services/dashboard.service.ts:3-26` arma
  filtros con `institution_id = $1`, `deleted_at IS NULL`, y pasa `params` con `i++` por cada
  filtro opcional. Esta feature sigue el mismo estilo.
- **Las queries `findAll` de los tres recursos que se cuentan aquí no filtran `is_active`.**
  Verificado leyendo el código: `src/services/student.service.ts` `findAll` (líneas ~18-21) hace
  `.where('s.institution_id = :institutionId').andWhere('s.deleted_at IS NULL')` — sin
  `is_active`. `src/services/course.service.ts` `findAll` (líneas ~12-13) hace
  `{ institutionId, deletedAt: IsNull() }` — sin `isActive`. `src/services/user.service.ts`
  `findAll` (líneas ~38-39) hace `{ institutionId, deletedAt: IsNull() }` — sin `isActive`. Esto
  importa directamente para la decisión de filtro de esta feature (ver más abajo).

## Archivos a tocar

### Editados

- `src/services/institution.service.ts` — modificar únicamente `findAll()` para añadir el
  campo `stats` por institución. Sin cambio de firma (sigue sin parámetros de tenant — el
  listado de instituciones no es tenant-scoped). **`findById(id)` no se toca**: no está expuesta
  por ninguna ruta, sus únicos usos son internos a `update`/`remove`/`updateLogo`, que devuelven
  la entidad mutada sin `stats` (ver "Flagged for the human reviewer"), así que agregarle
  `stats` no tiene consumidor y sólo introduciría trabajo (3 queries extra) en cada `PUT`/
  `DELETE`/upload de logo sin que nadie lo use.
- `src/controllers/institution.controller.ts` — sin cambios. Los handlers siguen siendo
  one-liners (`docs/architecture.md` §1: "controller handler is a one-liner: ... call the
  matching `services/` function, send the result").

### No tocados

- `src/entities/Institution.ts` — no hay cambio de esquema; `stats` no es una columna, es un
  campo computado del DTO de respuesta.
- `postgres/*.sql` — no hay migración. El feature no agrega ni quita tablas/columnas/índices.
- Cualquier controller, service o entity de `students` / `courses` / `users` — la feature
  sólo lee (no escribe ni muta) las tablas correspondientes.
- `src/middleware/institution.middleware.ts` y `src/middleware/auth.middleware.ts` — el
  aislamiento multi-tenant ya se garantiza porque cada query de conteo filtra por
  `institution_id = X` (ver "Estrategia de query"); el middleware no necesita cambiar.
- Ninguna ruta nueva: no se agrega `GET /api/institutions/:id`. Ver "Estado actual" arriba —
  ese endpoint no existe hoy, ni el frontend lo llama (verificado en el repo sibling
  `frontend/src/app/features/admin/admin.component.ts` e `institution-dialog.component.ts`:
  sólo `PUT`, `DELETE`, `POST` y `POST .../logo/upload` por id). Agregarlo sería expandir el
  contrato más allá del criterio de aceptación original ("el endpoint de instituciones" —
  singular, el listado — "devuelve los 3 conteos"). Si en el futuro se necesita, es una feature
  separada con su propio `R<n>`.
- Frontend — fuera de este repo. `R6` fija el contrato del objeto `stats` (nombres y tipos
  exactos), que es lo que el frontend consumirá.

## Forma de la respuesta

Cada elemento del listado devuelto por `GET /api/institutions` lleva `stats` como objeto
anidado, no como campos sueltos en el nivel superior:

```json
{
  "id": 1,
  "name": "Colegio X",
  "isActive": true,
  "logoUrl": "/api/uploads/logos/1-1700000000000.png",
  "primaryColor": "#1E40AF",
  "secondaryColor": "#F59E0B",
  "createdAt": "2026-01-15T12:00:00.000Z",
  "updatedAt": "2026-01-15T12:00:00.000Z",
  "stats": {
    "students": 245,
    "courses": 12,
    "users": 18
  }
}
```

Razones para anidar bajo `stats` y no agregar `studentsCount`/`coursesCount`/`usersCount` al
nivel superior:

1. Mantiene la lista de campos pre-existentes intacta (`R7`).
2. El namespace explícito `stats` deja espacio para futuros conteos sin contaminar el modelo
   (e.g. `stats.absencesLast30Days`).
3. El frontend consume un solo objeto, no tres propiedades huérfanas.

## Definición de los conteos (justificación de las elecciones)

### `students` → `students.institution_id`, NO `enrollments`

La entidad `Student` tiene `institution_id` directo (`src/entities/Student.ts:14`), así que la
pertenencia del estudiante a la institución está modelada de forma canónica y persistente.
Contar `enrollments` en su lugar sería incorrecto porque:

- Un estudiante puede tener (históricamente o simultáneamente) múltiples `enrollments`:
  uno por año lectivo, más de uno si está matriculado en varios cursos a la vez. Contar
  matrículas infla el número y mezcla dos conceptos ("estudiantes del colegio" vs
  "matrículas vigentes").
- Estudiantes sin matrícula vigente (ej. egresados sin baja, transferencias pendientes)
  cuentan como "del colegio" pero no aparecerían en `enrollments`.

### `courses` → `courses.institution_id`, NO `course_academic_years`

La entidad `Course` tiene `institution_id` directo (`src/entities/Course.ts:17`). La tabla
`course_academic_years` (`src/entities/CourseAcademicYear.ts`) ata un curso a un año lectivo
específico — eso es "curso activo este año", no "curso del colegio". Contar
`course_academic_years` mezclaría la pertenencia del catálogo (estable) con la apertura anual
(variable). Un curso no abierto este año sigue siendo del colegio.

Si en el futuro la UI necesita "cursos activos este año", ese es un conteo distinto que
puede agregarse al mismo objeto `stats` más adelante (e.g. `stats.activeCoursesThisYear`).
Esta feature no lo incluye — fuera de alcance.

### `users` → `users.institution_id = X`, no otra cosa

La entidad `User` tiene `institution_id` (`src/entities/User.ts:23`) que es `NULL` sólo para
superadmins. El filtro `institution_id = X` los excluye por construcción. Adicionalmente se
aplica `deleted_at IS NULL` (ver "Decisión: filtro de `is_active`" abajo — deliberadamente
**no** se agrega `is_active = TRUE`). Esto excluye:

- Cuentas soft-deleted (las bajas lógicas no cuentan).
- Superadmins (`institution_id IS NULL` ≠ cualquier `X`).
- Usuarios creados pero aún sin asignar a una institución (caso edge: existe el rol
  `superadmin` antes de cualquier otra asignación; el filtro los deja fuera).

No se filtra por rol. `users` cubre admin, rector, docentes, inspectores, etc. — todos
son "usuarios de la institución" en sentido amplio.

## Decisión: filtro de `is_active` — se excluye deliberadamente

`docs/architecture.md` §4 documenta la convención general de soft-delete del repo: `deletedAt` +
`isActive` como par, "set together on delete", y "filtered with `deletedAt IS NULL` / `IsNull()`
on every read". Una lectura superficial de esa convención sugeriría filtrar los tres conteos con
`deleted_at IS NULL AND is_active = TRUE`. **Esta feature no lo hace** — filtra únicamente
`deleted_at IS NULL`. Razón:

`is_active` en `Student`/`Course`/`User` no es sólo un espejo de "fue soft-deleted" — también se
usa como flag de desactivación manual independiente del borrado (p. ej. un docente con licencia
prolongada, un curso que se cierra a mitad de año sin eliminarse, una cuenta suspendida
temporalmente). Verificado en código: las queries `findAll` que alimentan las páginas de listado
reales de Students, Courses y Users **no comprueban `is_active`**, sólo `deleted_at IS NULL`:

- `src/services/student.service.ts` `findAll` (~líneas 18-21): `.andWhere('s.deleted_at IS
  NULL')`, sin `is_active`.
- `src/services/course.service.ts` `findAll` (~líneas 12-13): `{ institutionId, deletedAt:
  IsNull() }`, sin `isActive`.
- `src/services/user.service.ts` `findAll` (~líneas 38-39): `{ institutionId, deletedAt:
  IsNull() }`, sin `isActive`.

Es decir: un estudiante/curso/usuario desactivado pero no eliminado **ya aparece hoy** cuando un
rector abre la pantalla de Students/Courses/Users de su institución. Si esta feature filtrara
también por `is_active = TRUE`, el sello (`stats`) mostraría un número menor al que ese mismo
rector ve al contar filas en esas mismas pantallas — una divergencia silenciosa y confusa para
el propósito de esta feature, que es justamente un resumen ("¿cuántos estudiantes/cursos/
usuarios tiene esta institución?") pensado para reflejar lo que el usuario ya ve en las listas.
Un stat que cuenta un conjunto distinto al que la UI de detalle muestra es peor que uno que
simplemente reutiliza la misma semántica ya establecida.

Por eso: los tres conteos de esta feature usan `deleted_at IS NULL` únicamente, alineados con
`findAll` de `student.service.ts`/`course.service.ts`/`user.service.ts`, no con la convención
general de `docs/architecture.md` §4 (que sigue siendo válida para decidir *cuándo escribir*
`isActive = false` al hacer soft-delete de esas filas — sólo no es el filtro de lectura que estas
tres pantallas de listado ya usan). Si en el futuro el producto quiere un conteo separado de
"activos estrictamente" (con `is_active = TRUE`), es un campo adicional explícito en `stats`
(e.g. `stats.activeStudents`), no un cambio silencioso al significado de `stats.students`.

## Estrategia de query

Tres consultas de agregación parametrizadas, ejecutadas en paralelo (vía `Promise.all`) sobre
los IDs de las instituciones a devolver. Cada consulta devuelve una fila por institución con
el conteo correspondiente, agrupada por `institution_id`:

```ts
const ids = institutions.map(i => i.id);

const [studentsRows, coursesRows, usersRows] = await Promise.all([
  AppDataSource.query(
    `SELECT institution_id, COUNT(*)::int AS count
       FROM students
      WHERE institution_id = ANY($1) AND deleted_at IS NULL
      GROUP BY institution_id`,
    [ids],
  ),
  AppDataSource.query(
    `SELECT institution_id, COUNT(*)::int AS count
       FROM courses
      WHERE institution_id = ANY($1) AND deleted_at IS NULL
      GROUP BY institution_id`,
    [ids],
  ),
  AppDataSource.query(
    `SELECT institution_id, COUNT(*)::int AS count
       FROM users
      WHERE institution_id = ANY($1) AND deleted_at IS NULL
      GROUP BY institution_id`,
    [ids],
  ),
]);

const byInst = (rows: any[]) => new Map<number, number>(
  rows.map(r => [Number(r.institution_id), Number(r.count)]),
);

return institutions.map(i => ({
  ...i,
  stats: {
    students:  byInst(studentsRows).get(i.id) ?? 0,
    courses:   byInst(coursesRows).get(i.id)  ?? 0,
    users:     byInst(usersRows).get(i.id)    ?? 0,
  },
}));
```

Detalles relevantes:

- **No N+1**: cada conteo es UNA consulta con `GROUP BY`, independiente de la cantidad de
  instituciones. Para 1 institución son 3 queries; para N son 3 queries.
- **Aislamiento multi-tenant**: cada query filtra por `institution_id` específico — un bug
  que olvide el `WHERE institution_id = ANY($1)` haría que `students` por ejemplo cruzara
  instituciones, pero el filtro lo hace imposible por construcción.
- **`COUNT(*)::int`**: PostgreSQL devuelve `bigint` por defecto; el cast `::int` evita el
  problema del string `"245"` que devuelve `bigint` en pg sin cast. El `?? 0` después del
  `Number(...)` cubre tanto `undefined` (institución sin filas en esa tabla → fila ausente en
  el resultado del `GROUP BY`) como el caso defensivo de un `NaN`.
- **`Promise.all`**: las tres consultas son independientes; correrlas en serie sumaría latencia
  sin beneficio.
- **Sin cache**: la lista de instituciones es chica (decenas como mucho), las tablas indexadas
  por `institution_id` (FK implícito en cada tabla hija) y las consultas son O(N) con N
  pequeño. Un cache sería sobre-ingeniería.

## Comportamiento de superadmin vs usuario común

`findAll()` se llama sin `req.institutionId` ni `req.courseIds`. Esto es deliberado y
consistente con el comportamiento pre-existente: el listado de instituciones no está
tenant-scoped (el superadmin lo necesita completo para alimentar el conmutador; un usuario
ligado a una institución con permiso `institutions:read` también lo recibe). Esta feature no
cambia ese alcance — sólo agrega `stats`.

El aislamiento multi-tenant de los conteos se garantiza por construcción: las queries de
agregación filtran por `institution_id` específico de cada fila de la respuesta. No se usa
`req.institutionId` en ningún momento del cálculo — eso sería un error de diseño (rompería el
caso superadmin que lista varias instituciones con conteos distintos por institución).

## Forma de las funciones modificadas

```ts
type InstitutionWithStats = Institution & {
  stats: { students: number; courses: number; users: number };
};

export async function findAll(): Promise<InstitutionWithStats[]> {
  const institutions = await repo().find({ order: { name: 'ASC' } });
  if (!institutions.length) return [];
  return attachStats(institutions);
}

// findById(id) queda sin cambios — no está expuesta por ninguna ruta HTTP (ver "Estado
// actual" arriba), así que no necesita `stats`.

async function attachStats(institutions: Institution[]): Promise<InstitutionWithStats[]> {
  // ... las 3 queries + merge, como arriba ...
}
```

`attachStats` es un helper privado del módulo, declarado encima de `findAll` siguiendo
`docs/conventions.md` ("private helpers above their first use"). No se exporta.

## Alternativas descartadas

1. **Opt-in vía `?stats=true` (query param).** Descartado: el prerrequisito
   `admin_institutions_cuaderno_seal` siempre necesita los conteos (es el dato que muestra el
   sello), así que opt-in sólo agrega complejidad en el call site del frontend sin valor.
   Además, la query de agregación es `GROUP BY institution_id` en una sola pasada — no hay
   ahorro real de performance entre "siempre" y "a veces", porque el costo está dominado por
   el `find()` de instituciones, no por las agregaciones. Hacer el comportamiento
   dependiente del query param también expondría un detalle de implementación ("los stats son
   caros") en la superficie de la API sin motivo.

2. **Contar `enrollments` en lugar de `students`.** Descartado: un estudiante con varias
   matrículas (históricas o simultáneas en varios cursos) inflaría el conteo. El
   `students.institution_id` ya modela la pertenencia canónica del estudiante a la
   institución — contar una tabla derivada reintroduce ambigüedad sobre "¿qué es un
   estudiante del colegio?".

3. **Contar `course_academic_years` en lugar de `courses`.** Descartado: conflagra "curso del
   colegio" (catálogo persistente) con "curso abierto este año lectivo" (asignación
   anual). Un curso no abierto este año todavía pertenece al colegio y debe contar. Si la UI
   luego necesita el dato por año, eso es un conteo adicional, no un sustituto.

4. **Una sola query combinada con CTE / `UNION ALL` / `LEFT JOIN LATERAL`.** Descartado: el
   ahorro es marginal (3 queries con `GROUP BY` cada una es trivial para el motor con índices
   en `institution_id`) y la legibilidad cae mucho. El patrón vigente del repo
   (`dashboard.service.ts`) es queries parametrizadas separadas — seguirlo.

5. **Cachear los conteos en memoria con TTL corto.** Descartado: la lista de instituciones es
   chica y los conteos cambian con cualquier matrícula / creación de usuario; un cache
   introduce invalidación sin upside observable. Si en el futuro esto se vuelve un problema
   real (muchas instituciones, alto tráfico al endpoint), se reconsidera — pero no es el
   caso ahora.

6. **Agregar `GET /api/institutions/:id` para exponer `stats` de una sola institución.**
   Descartado: ese endpoint no existe hoy, el frontend nunca lo llama (usa `PUT`/`DELETE`/
   `POST .../logo/upload` por id, no `GET`), y el criterio de aceptación original sólo pide
   que "el endpoint de instituciones" (el listado) lleve los 3 conteos. Agregarlo expandiría
   el contrato de la API sin un consumidor real ni un requisito que lo pida — si surge esa
   necesidad más adelante, es una feature separada con su propio `R<n>` y su propio smoke
   test, no algo a inferir de esta.

7. **Filtrar los conteos con `is_active = TRUE` además de `deleted_at IS NULL`, siguiendo al
   pie de la letra `docs/architecture.md` §4.** Descartado — ver "Decisión: filtro de
   `is_active`" arriba. Las páginas de listado reales de Students/Courses/Users ya no filtran
   por `is_active`, y esta feature debe reflejar el mismo conjunto de filas que esas pantallas
   muestran, no un subconjunto más estricto que las contradiga.

8. **Hacer el cálculo lazy, computar `stats` sólo cuando el cliente lo pide por endpoint
   separado `GET /api/institutions/:id/stats`.** Descartado: rompe el contrato atómico del
   `GET /api/institutions` (un round-trip extra por carga del listado) y complica el
   frontend. Para esta escala es innecesario. (Y, como en el punto 6, no hay hoy un `GET
   /api/institutions/:id` del cual colgar un sub-recurso `/stats`.)

## Flagged for the human reviewer

- **`create`, `update`, `remove` y `updateLogo` de `institution.service.ts` no se modifican.**
  Estas funciones siguen devolviendo la entidad cruda sin `stats` (no tiene sentido agregar
  conteos al payload de una mutación puntual). El frontend que llame a `POST/PUT/DELETE
  /api/institutions` no recibe `stats` — y no lo espera (esos endpoints ya no se usan para
  re-pintar el sello). Si en algún momento `POST /api/institutions` (alta de institución nueva)
  necesita devolver los conteos para refrescar la UI sin un round-trip extra, eso es un
  follow-up explícito — no se incluye en esta feature para no expandir el contrato sin
  necesidad.
- **`findById(id)` tampoco se modifica**, por la misma razón: no está expuesta por ninguna ruta
  HTTP (ver "Estado actual"), y sus tres call sites internos (`update`, `remove`, `updateLogo`)
  no necesitan `stats`. Si en el futuro se agrega un `GET /api/institutions/:id` real, ese es el
  momento de decidir si necesita `stats` — no antes.
- **El comportamiento de `findAll()` para usuarios no-superadmin sigue sin tenant-scoping.**
  Esto es pre-existente y no se ajusta aquí. Si más adelante el producto decide que un rector
  no debe ver la lista de otras instituciones, eso es una feature separada (probablemente un
  cambio de controller que llame a `requireInstitution` y/o filtre por `req.institutionId`).
- **El `count` se devuelve como `number` (no `string`).** PostgreSQL devuelve `bigint` como
  string en el driver de node-postgres; el cast `::int` lo convierte a numérico en el server
  y pg devuelve el `number` correspondiente a JavaScript. Si en el futuro los conteos
  pudieran exceder `Number.MAX_SAFE_INTEGER` (~9e15, imposible para una escuela), esto se
  revisita — irrelevante al dominio.
- **Decisión de `is_active` es una desviación deliberada de la convención general del repo**
  (`docs/architecture.md` §4) para este caso puntual — ver la sección dedicada arriba. Se marca
  explícitamente aquí porque es el tipo de decisión que un reviewer podría señalar como
  inconsistencia si no estuviera documentada: no lo es, es intencional y justificada por el
  comportamiento ya existente de las páginas de listado.
