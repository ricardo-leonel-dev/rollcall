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

## Tests

- **Test file location/naming:** none exist yet in this project — no
  `*.spec.ts` files and no test builder configured in `angular.json`.
- **Test framework:** not set up. If you add one, use Angular's default
  toolchain (Karma/Jasmine or the current Angular CLI default) and record the
  exact run command in `docs/verification.md` and `.harness.json`'s
  `verify_command`.
- **Fixture/isolation convention:** N/A until a framework is chosen.

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
