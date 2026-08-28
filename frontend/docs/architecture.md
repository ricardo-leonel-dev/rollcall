# Architecture — What does "doing a good job" mean here?

> This document defines the quality bar for this project. The reviewer agent
> evaluates code against this file. If it's not here, it's not a requirement.

## Principles

1. **Layers.** `src/app` has three layers:
   - `core/` — app-wide singletons: `services/` (`providedIn: 'root'`), `guards/`
     (`CanActivateFn`), `interceptors/` (`HttpInterceptorFn`), `models/index.ts`
     (shared TS interfaces for backend DTOs), `nav-items.ts` (sidebar config).
     Nothing here is feature-specific.
   - `features/<name>/` — one folder per business area (`absences`, `admin`,
     `auth`, `calendar`, `dashboard`, `home`, `justifications`, `student-report`,
     `students`). Each folder holds its route-level component plus any dialogs
     that only that feature uses (e.g. `absence-dialog.component.ts` next to
     `absences.component.ts`). Features do not import from each other directly
     — shared behavior goes through `core/` or `shared/` instead.
   - `shared/` — reusable, feature-agnostic building blocks: `components/`
     (dialogs/widgets used by 2+ features, e.g. `confirm-dialog`, `toast`),
     `layout/` (the authenticated shell — sidebar/topbar), `utils/` (pure
     functions, e.g. `date.util.ts`, `string.util.ts`).
   Don't introduce a new top-level folder under `src/app` without updating
   this file first.
2. **Dependencies.** Angular 22 (standalone components only, no `NgModule`),
   Angular Material for UI primitives, Tailwind for utility CSS, RxJS only at
   the HTTP boundary (bridged to `async`/`await` via `firstValueFrom` — see
   below). Adding a new runtime dependency is a deliberate choice, not a
   default; prefer what's already in `package.json`.
3. **Error handling.** HTTP errors are centralized in
   `core/interceptors/error.interceptor.ts`: a `401` triggers
   `AuthService.logout()` and redirects to `/login`; every other status
   propagates to the caller via `throwError`. Feature code that calls
   `HttpClient` directly is expected to catch and surface failures to the user
   through `NotificationService` (`core/services/notification.service.ts`,
   backed by `MatSnackBar` + `ToastComponent`) — never a silent `console.error`
   as the only trace. Async component code uses `try/catch` around
   `firstValueFrom(...)` calls, not RxJS `catchError` pipelines, to keep call
   sites readable.
4. **State/mutability.** State lives in Angular **signals**, not RxJS
   `BehaviorSubject`s and not NgRx/Akita — there is no external state
   management library. The convention (see `AuthService`,
   `AcademicYearContextService`, `InstitutionContextService`) is: private
   `signal()` fields prefixed with `_` hold the mutable state, a public
   `readonly` `.asReadonly()` or `computed()` exposes it. Components never
   mutate a service's private signal directly — they call a public method
   (e.g. `login()`, `logout()`, `updateLocalUser()`). The app runs zoneless
   (`provideZonelessChangeDetection()` in `main.ts`) and every component sets
   `changeDetection: ChangeDetectionStrategy.OnPush` (two legacy exceptions as
   of this writing — `shared/components/placeholder/` and
   `shared/components/coming-soon/` — don't use these as precedent for new
   components) — signals (not manual
   `markForCheck`) are what drive view updates, so new state must be a signal
   or a `computed()`, never a plain class field read from the template.

## Data Flow

```
component (standalone, OnPush)
  -> inject(HttpClient), relative /api/... URL
  -> [authInterceptor: adds Authorization: Bearer <token> + X-Institution-Id]
  -> [errorInterceptor: 401 -> AuthService.logout(); else rethrow]
  -> nginx (nginx.conf) proxies /api/ -> http://backend:3000/api/
  -> backend (asistencia-backend / ai-personal-backend project)
```

Auth/session state (`AuthService`) and the active institution
(`InstitutionContextService`) are read by both interceptors on every request —
they are the two pieces of state the whole app is implicitly built around.
Route access is gated in two layers: `authGuard` (must be logged in) wraps the
whole authenticated shell in `app.routes.ts`; `moduleGuard` (must have the
`data: { module: '<key>' }` permission, checked via
`AuthService.canAccessModule`) wraps individual feature routes.

## Running the App

Both environments run the frontend **inside Docker, served by nginx** — there
is no standalone `ng serve` dev-server flow wired up for this project; the
`Dockerfile` is a single multi-stage build (`pnpm run build` → static output
in `dist/frontend/browser` → `nginx:alpine` serving it per `nginx.conf`,
which also reverse-proxies `/api/...` to the backend container) used for
both:

- **Development:** `docker compose up --build` from the repo root
  (`ai-personal/`). `docker-compose.override.yml` is picked up automatically
  and adds a read-only volume mount of `./frontend/src` on top of the same
  built nginx image.
- **Production:** the same `Dockerfile`/`docker-compose.yml`, without the
  override.

## Design Workflow

New screens or significant UI changes are prototyped first with Claude Code's
`design` skill (Claude Design canvas) before any Angular code is written —
this was the workflow used to build this frontend's UI originally, and should
be reused for new features rather than jumping straight into
`.component.ts` markup. Use it to draft/iterate the layout and visual design
(mockup, screen flow) as a canvas artifact, get it aligned with what's wanted,
then implement it following the conventions above (standalone component,
`OnPush`, inline template/styles, Angular Material + Tailwind). The skill is
for the visual/UX draft only — it does not replace the Angular
implementation, and its output is not committed to this repo.

**`frontend-design` is a fundamental skill for this codebase, not optional
polish.** Load it before any of: drafting a canvas with `design`, writing or
restyling a `.component.ts` template/styles block, or reviewing someone
else's UI diff. `design` produces the mockup artifact; `frontend-design`
supplies the aesthetic judgment behind it — typography choices, spacing/color
decisions, and avoiding templated-default Material/Tailwind output — so the
two are used together, not as alternatives. Any task that touches
`template:`/`styles:` in a `.component.ts` file, adds a new screen, or
reshapes an existing one requires `frontend-design` first; skipping it is a
convention violation the same as skipping `OnPush` or inline
templates/styles.

## What NOT to do

- Don't add an `NgModule` — every component in this codebase is `standalone:
  true`. Don't add a `.component.html` / `.component.css` sibling file either
  — every existing component uses inline `template`/`styles` in the `.ts`
  file; stay consistent with that, don't mix the two styles.
- Don't reach for constructor injection (`constructor(private x: X)`) — this
  codebase uses the `inject()` function exclusively.
- Don't add NgRx, Akita, or any other state library — extend the existing
  signal-based service pattern instead.
- Don't call `HttpClient` methods and `.subscribe()` manually in a component
  — the established pattern is `await firstValueFrom(this.http.xxx(...))`
  inside an `async` method. (Existing exception: `MatDialogRef.afterClosed()`
  is a long-lived UI event stream, not a one-shot HTTP call, so
  `.subscribe()` on it is the normal pattern throughout — see
  `admin.component.ts`, `students/student-management.component.ts`,
  `absences.component.ts`, `justifications.component.ts`. A few
  fire-and-forget `HttpClient` calls in `absences.component.ts` currently use
  `.subscribe()` instead of `firstValueFrom` — that's drift from this
  convention, not a second sanctioned exception; fix opportunistically when
  touching that file, don't propagate the pattern to new code.)
- Don't hardcode `http://backend:3000` or any absolute API host in frontend
  code — all calls use relative `/api/...` paths; nginx (`nginx.conf`)
  resolves them to the backend container in both dev and prod (see "Running
  the App" above).
