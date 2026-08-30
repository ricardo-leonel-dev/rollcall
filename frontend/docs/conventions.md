# Code Conventions

> Extreme homogeneity. Agents predict better when the codebase looks like
> itself throughout.

## Before touching any UI

Load the `frontend-design` skill before writing or editing a component's
`template:`/`styles:` block — see "Design Workflow" in `docs/architecture.md`
for how it fits with the `design` canvas skill. This is fundamental, not
optional: it applies to a brand-new screen and a small restyle alike.

## Language/Style

- **Language & version:** TypeScript, `strict: true` plus
  `noImplicitOverride`, `noPropertyAccessFromIndexSignature`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch` (see `tsconfig.json`).
  Target/module `ES2022`. Angular 22, standalone components, zoneless change
  detection.
- **Formatter/linter:** none configured (no ESLint/Prettier config or
  dependency in this project as of this writing). There is no automated
  format check — match the surrounding file's style by hand (2-space indent,
  single quotes, trailing commas in multiline literals). If you add a
  linter/formatter later, update this section and `docs/verification.md`
  with the exact command.
- **Line length / formatting rules:** no enforced limit; existing files keep
  route tables and import lists on one line when it stays readable (see
  `app.routes.ts`), otherwise wrap.

## Names

| Construct | Convention | Example |
|---|---|---|
| Component class | `PascalCase` + `Component` suffix | `AbsencesComponent`, `AbsenceDialogComponent` |
| Component file | `kebab-case.component.ts`, inline template+styles, no `.html`/`.css` siblings | `absences.component.ts` |
| Service class | `PascalCase` + `Service` suffix, `providedIn: 'root'` | `NotificationService` |
| Guard | `camelCase` + `Guard` suffix, `CanActivateFn` | `authGuard`, `moduleGuard` |
| Interceptor | `camelCase` + `Interceptor` suffix, `HttpInterceptorFn` | `authInterceptor`, `errorInterceptor` |
| Model interface | `PascalCase`, declared in `core/models/index.ts` | `Student`, `Enrollment`, `Absence` |
| Private signal-backed field | `_camelCase`, exposed via a public `readonly` of the same name without the underscore | `private _token = signal(...)`, `readonly token = this._token.asReadonly()` |
| Utility function | `camelCase`, grouped in `shared/utils/<domain>.util.ts` | `dateToDateString` in `date.util.ts` |
| Constant lookup table | `SCREAMING_SNAKE_CASE` or `PascalCase` `Record<...>`, module-level `const` | `DEFAULT_NOTIFICATION_TEMPLATE`, `DEFAULT_DURATION` |

## File Structure

No license header or file-level docstring convention. Import order, top to
bottom, as seen throughout `src/app`:

1. `@angular/core` (`Component`, `signal`, `inject`, ...)
2. Other `@angular/*` (`common/http`, `router`, `forms`)
3. `@angular/material/*` modules used by the component
4. Third-party (`rxjs`, ...)
5. Local: models (`../../core/models/index`), utils, services, then shared
   components, then sibling feature components (dialogs) last.

Component decorator field order: `standalone`, `changeDetection`, `imports`,
`host` (if any), `styles`, `template`.

## Reusability

Before building a component or service that's specific to one screen, check
whether the same concern will plausibly show up elsewhere (list views,
dialogs, other feature pages) and, if so, build it as a standalone,
composable unit from the start — not a bigger refactor after the second
screen needs it. In practice this means: no host-specific assumptions baked
into a shared component's public contract (avoid required `@Input()`s a
future consumer can't supply); prefer injecting a shared context
service directly over threading the same 2-3 bindings through every host
(the existing `AcademicYearContextService`/year-switcher pattern, and
`QuarterContextService`/`QuarterSelectorComponent` built the same way, are
the reference examples); keep the component's own template/styles ignorant
of which page it's rendered on. This is a bias, not a mandate — don't build
a generic abstraction for a concern that's genuinely one-off; three similar
inline blocks across unrelated pages is still better than a premature shared
component with a leaky contract.

## Tests

- **Test file location/naming:** none exist yet in this project — no
  `*.spec.ts` files and no test builder configured in `angular.json`.
- **Test framework:** not set up. If you add one, use Angular's default
  toolchain (Karma/Jasmine or the current Angular CLI default) and record the
  exact run command in `docs/verification.md` and `.harness.json`'s
  `verify_command`.
- **Fixture/isolation convention:** N/A until a framework is chosen.

## Smoke scripts

Smoke tests live **inline in `progress/impl_<feature>.md`** as markdown steps
plus visual references (PNGs, JSONs in `progress/`). Do **not** create new
`.mjs` smoke scripts in `frontend/scripts/` or `progress/smoke/` — these are
not part of the project's testing infrastructure, and the convention is
to keep smoke procedures human-readable so future styling agents can
follow the steps without re-running a brittle Playwright script.

`frontend/scripts/` is reserved for **harness-installed scripts only**
(`harness.sh`, `lib.sh`, `snapshot.sh`, `notion_*.sh`, `sync_postgres.sh`,
`dev_jwt.sh` — copied by `install.sh` from the harness template, never
edited in place). Project scratch files created during styling or
verification that happen to live under `frontend/scripts/` are kept there
as ephemeral local-only files via `.git/info/exclude`; they are **not**
intended to be re-run or versioned.

The visual outputs of past smokes (screenshots, JSON transcripts) stay in
`progress/` as the durable record — they are the actual artifacts future
agents reference when restyling a similar surface.

## Error Handling

- HTTP-layer errors: centralized in `error.interceptor.ts` (401 → forced
  logout; everything else rethrown to the caller).
- Component-layer errors: wrap `firstValueFrom(...)` calls in `try/catch`
  and report failures to the user via `NotificationService.error(...)` —
  never fail silently or leave only a `console.error`.
- Auth-layer: `AuthService` throws through the native `HttpClient` error path
  on a failed login (no custom error wrapper) — the caller (e.g.
  `login.component.ts`) is responsible for catching it and showing feedback.

## Comments

By default, comments are **not** written. They are only allowed when they
explain a non-obvious *why* (a documented workaround, a subtle invariant).
Well-named identifiers should do the rest. This codebase already follows that
— see the multi-line rationale comments in `nginx.conf` and the
`activeInstitution`/`moduleKeys` comments in `auth.service.ts` as the bar for
when a comment earns its place.
