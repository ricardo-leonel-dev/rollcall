# Code Conventions

> Extreme homogeneity. Agents predict better when the codebase looks like
> itself throughout.

## Language/Style

- **Language & version:** TypeScript, `strict: true`, target `ES2022`,
  `module: commonjs`, `experimentalDecorators` + `emitDecoratorMetadata`
  enabled (required by TypeORM). Node 22.
- **Formatter/linter:** none configured (no ESLint/Prettier config or
  dependency in this project as of this writing). No automated format
  check — match the surrounding file's style by hand (2-space indent,
  single quotes). If a linter/formatter is added later, update this section
  and `docs/verification.md` with the exact command.
- **Line length / formatting rules:** no enforced limit; controllers often
  align route tables in columns for scanability (see `student.controller.ts`)
  — keep that alignment when adding a route to an existing table.

## Names

| Construct | Convention | Example |
|---|---|---|
| Entity class/file | `PascalCase.ts`, singular, matches DB table via `@Entity('table_name')` | `Student.ts` → `@Entity('students')` |
| Entity column | DB is `snake_case` via `@Column({ name: '...' })`, TS property is `camelCase` | `@Column({ name: 'id_number' })` → `idNumber` |
| Controller file | `kebab-case.controller.ts`, default-exports an Express `Router` | `student.controller.ts` (exception: `controllers/bull-board.ts` — no `.controller` suffix, exports named functions + `serverAdapter`, not a default `Router`, because it wires up the Bull Board dashboard rather than a resource) |
| Service file | `kebab-case.service.ts`, exports plain `async function`s (no class) | `student.service.ts` |
| Middleware file | `kebab-case.middleware.ts`, exports named function(s) | `institution.middleware.ts` |
| Queue/Worker pair | `<domain>.queue.ts` defines `Queue` + job data type; `<domain>.worker.ts` defines the matching `Worker` | `voice-absence.queue.ts` / `voice-absence.worker.ts` |
| Permission resource const | Single-letter `const R = '<resource>'` at the top of a controller, reused in every `requirePermission(R, action)` call — used in 12/20 controllers, typically ones with 2+ checks against the same resource | `const R = 'students'` |
| Thrown HTTP error | `Object.assign(new Error('<message>'), { status: <code> })` | `throw Object.assign(new Error('Student not found'), { status: 404 })` |

## File Structure

No license header or file-level docstring convention. Controllers follow a
fixed shape: imports, `const router = Router()`, optional `const R = '...'`,
`router.use(requireInstitution)` if the resource is institution-scoped, one
route per permission-checked line, `export default router`. Services are a
flat list of exported functions in rough CRUD order
(`findAll`/`findById`/`create`/`update`/`remove`), private helpers above
their first use.

## Tests

- **Test file location/naming:** none exist yet — no `*.spec.ts`/`*.test.ts`
  files and no test script in `package.json`.
- **Test framework:** not set up. If one is added, record the exact run
  command in `docs/verification.md` and `.harness.json`'s `verify_command`.
- **Fixture/isolation convention:** N/A until a framework is chosen.

## Error Handling

- Services **throw**, they never call `res.*` themselves — a service
  function that needs to signal a client-facing failure does
  `throw Object.assign(new Error('<message>'), { status: <code> })`.
- `middleware/error.middleware.ts` is the only place that turns an error
  into an HTTP response. It already recognizes raw Postgres errors by
  message (`duplicate key`/`unique` → 409 "Registro duplicado",
  `violates foreign key` → 409 "Referencia inválida") — don't catch and
  re-wrap those in a service, let them propagate unchanged.
- An `Error` with no `status` becomes a 500 with the raw `err.message` — so
  don't put sensitive internals in a plain `throw new Error(...)` message
  destined for an unexpected-error path; give it a `status` if it's an
  expected, user-facing condition.

## Comments

By default, comments are **not** written. They are only allowed when they
explain a non-obvious *why* (a documented workaround, a subtle invariant).
Well-named identifiers should do the rest. This codebase already follows
that — see the `search_path` rationale in `data-source.ts` and the
institution/course-scoping rationale in `institution.middleware.ts` as the
bar for when a comment earns its place.
