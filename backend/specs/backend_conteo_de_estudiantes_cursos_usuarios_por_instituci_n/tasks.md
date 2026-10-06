# Tasks — Backend: conteo de estudiantes/cursos/usuarios por institución

Cada `T<n>` es un paso concreto y atómico. Cada uno lista los archivos que toca, los `R<n>`
que avanza, y una condición de cierre verificable. El implementer los marca en orden; el
reviewer rechaza la feature si queda alguno `[ ]` sin justificación documentada y aceptada en
`progress/impl_backend_conteo_de_estudiantes_cursos_usuarios_por_instituci_n.md`.

Este proyecto no tiene framework de tests automatizados (`docs/verification.md`); la
trazabilidad se cubre igual que en features anteriores: `pnpm run build` sin errores + smoke
test manual contra el API y la DB en vivo, con request/response verbatim capturados en el
archivo de progreso indicado arriba.

- [x] T1 (R1, R2, R3, R4, R5, R6, R7) Modificar `src/services/institution.service.ts`
      exactamente como se describe en `design.md` ("Forma de las funciones modificadas" +
      "Estrategia de query"): declarar el tipo local `InstitutionWithStats = Institution & {
      stats: { students: number; courses: number; users: number } }`; agregar el helper
      privado `attachStats(institutions: Institution[])` por encima de `findAll` (siguiendo
      `docs/conventions.md` — "private helpers above their first use"), con las tres queries
      de agregación filtrando únicamente `deleted_at IS NULL` (sin `is_active` — ver
      "Decisión: filtro de `is_active`" en `design.md`); reescribir `findAll` para llamar a
      `attachStats` después del `find({ order: { name: 'ASC' } })`, con early return `[]` si
      la lista viene vacía. No modificar `findById`, `create`, `update`, `remove` ni
      `updateLogo` (queda fuera del contrato — ver "Flagged for the human reviewer" en
      `design.md`: `findById` no está expuesta por ninguna ruta HTTP). No exportar
      `attachStats`.

- [x] T2 (R6) Verificar que la respuesta de `findAll` produce, para cada institución, un
      objeto con los campos pre-existentes (`id`, `name`, `isActive`, `logoUrl`,
      `primaryColor`, `secondaryColor`, `createdAt`, `updatedAt`) en el mismo orden que la
      salida pre-feature (TypeORM preserva el orden de columnas de la entidad; el spread
      `...i` antes de `stats: {...}` asegura que `stats` queda al final), seguido del campo
      `stats: { students: number, courses: number, users: number }` con esos tres nombres
      exactos y tipos `number` (no string). Confirmar manualmente con
      `console.log(JSON.stringify(await svc.findAll(), null, 2))` o equivalente antes del
      smoke test HTTP.

- [x] T3 (R8) Correr `pnpm run build` (o `node_modules/.bin/tsc -p .` si `pnpm` no está
      disponible). Done: exit code `0`, sin nuevos errores de TypeScript atribuibles a
      `src/services/institution.service.ts` o `src/controllers/institution.controller.ts`
      (este último no se modifica — la build limpia valida que el controller sigue
      compilando contra la nueva firma de retorno del service).

- [x] T4 (R9-i) Smoke test manual: autenticarse como superadmin (token con
      `institutionId = null`, sin header `X-Institution-Id`). `GET /api/institutions` →
      `200`. Done: la respuesta es un arreglo; cada elemento incluye `stats: { students,
      courses, users }` con conteos no-negativos. Verificar la corrección comparando con
      tres `SELECT institution_id, COUNT(*) FROM students|courses|users WHERE
      institution_id = ANY(<ids de la respuesta>) AND deleted_at IS NULL GROUP BY
      institution_id` ejecutados contra la DB — los conteos deben coincidir uno-a-uno.
      Capturar verbatim en el archivo de progreso.

- [x] T5 (R9-ii, R7) Smoke test manual: autenticarse como un usuario ligado a una
      institución (no superadmin, con permiso `institutions:read`). `GET /api/institutions`
      → `200`. Done: el response body tiene la misma forma que en T4 (mismo shape JSON,
      campos pre-existentes byte-identical, `stats` presente). Capturar verbatim; comparar
      el shape contra T4 — debe ser idéntico.

- [x] T6 (R9-iii, R3, R4, R5) Smoke test de aislamiento: elegir dos instituciones reales
      `A` y `B` con conteos distintos en al menos una de las tres tablas (verificable
      previamente con `SELECT COUNT(*)` separados). Llamar `GET /api/institutions` y
      comparar `A.stats` y `B.stats` contra dos `SELECT COUNT(*) ... WHERE institution_id
      IN (A.id, B.id) GROUP BY institution_id` ejecutados a mano para `students`, `courses`
      y `users` (filtrando sólo `deleted_at IS NULL`). Done: (a) los `stats` de `A` no
      contienen filas contadas desde `B` ni viceversa; (b) cada conteo del response coincide
      con el `SELECT COUNT` correspondiente; (c) si alguna de las dos instituciones tiene
      cero filas en una tabla, su campo es `0`, no `undefined` ni `null` (cubre R5).
      Capturar los `SELECT`s y el response verbatim.

- [x] T7 (R9-iv, R5) Smoke test del caso borde "institución sin filas": crear (si no
      existe ya) una institución de prueba — método más simple: `INSERT INTO institutions
      (name, is_active) VALUES ('__test_stats_empty__', true) RETURNING id`, guardar el
      `id` resultante. Llamar `GET /api/institutions` y confirmar que ese elemento aparece
      con `stats: { students: 0, courses: 0, users: 0 }`. Limpiar después con `DELETE FROM
      institutions WHERE name = '__test_stats_empty__'` (o dejarla y marcarla en el log —
      decisión del implementer). Capturar el response verbatim y el SQL de cleanup.

- [x] T8 (R9-v, R7) Regresión de campos pre-existentes: diff manual entre el response de
      T4 y un response pre-feature (re-crear el response pre-feature es trivial: correr el
      `find()` actual contra la misma DB y dumpear; o mirar el commit anterior al cambio).
      Done: los campos `id`, `name`, `isActive`, `logoUrl`, `primaryColor`, `secondaryColor`,
      `createdAt`, `updatedAt` están presentes, con los mismos nombres y los mismos tipos
      (`number`, `string`, `boolean`, `string|null`, `string|null`, `string|null`, `string`
      ISO 8601, `string` ISO 8601). El único campo nuevo es `stats`. Capturar el diff en el
      archivo de progreso.

- [x] T9 (R9) Re-correr `./init.sh` al final. Done: verde; los únicos `[WARN]` son los
      baseline pre-existentes (típicamente `verify_command` vacío, `SUPABASE_URL` sin set,
      etc.). Capturar el output de init en el archivo de progreso.

## Trazabilidad inversa (cada `R<n>` cubierto por al menos un `T<n>`)

| `R<n>` | Cubierto por |
|--------|--------------|
| R1     | T1, T2, T4, T5 |
| R2     | T1, T4, T6 |
| R3     | T1, T4, T6 |
| R4     | T1, T4, T6 |
| R5     | T1, T6, T7 |
| R6     | T1, T2 |
| R7     | T1, T2, T5, T8 |
| R8     | T3 |
| R9     | T4, T5, T6, T7, T8, T9 |
