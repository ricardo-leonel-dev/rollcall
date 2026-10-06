# Requirements — Promote ProfileDialog to routed `/profile` page

Scope: **frontend-only** (`attendance_frontend`). Files affected: a new
`src/app/features/profile/profile.component.ts`, a new
`src/app/features/profile/unsaved-changes-dialog.component.ts`, a new
`src/app/core/guards/profile-can-deactivate.guard.ts`,
`src/app/app.routes.ts`, `src/app/shared/layout/layout.component.ts`, and
`src/app/features/absences/absences.component.ts` (one import path update —
the `DEFAULT_NOTIFICATION_TEMPLATE` constant currently re-exported from the
old dialog disappears with the dialog). No backend change is in scope — the
`PUT /api/auth/me` and `PUT /api/auth/me/password` /
`PUT /api/auth/me/avatar` / `POST /api/auth/me/avatar/upload` endpoints this
feature already depends on are unchanged.

## Existing UI being migrated (read before the rest of this file)

The "Mi perfil" surface today is a `MatDialog` — `ProfileDialogComponent` at
`src/app/shared/components/profile-dialog/profile-dialog.component.ts` —
opened from `layout.component.ts`'s topbar avatar menu
(`openProfile()` → `this.dialog.open(ProfileDialogComponent, { width:
'520px' })`). It is opened unconditionally by every authenticated user; there
is no `moduleGuard` and no role check at the call site, so every user with a
valid JWT can reach it. It contains five `Datos personales`, `Firma en
reportes`, `Avatar`, `Contraseña`, and `Mensaje de notificación`
(`Faltas y atrasos (WhatsApp)`) sections, all wired via:

- `inject(HttpClient)` for `GET /api/auth/me` and the section-specific
  save/upload calls.
- `inject(AuthService).updateLocalUser(partial)` after any save that
  changes a session-visible field (full name, email, title, signature
  label, avatar URL).
- `inject(NotificationService)` (`.success`/`.warning`/`.error`) for all
  user feedback.
- `FormsModule` + `[(ngModel)]` plain class fields (not signals — they are
  written to only through `[(ngModel)]`, per the existing convention in this
  file) for the personal-data, signature, and password fields; `signal()`
  for the template, avatar URL, selected preset, and per-section saving
  flags.
- A local `Me` interface (matching the `/api/auth/me` payload: `fullName`,
  `email`, `notificationTemplate`, `avatarUrl`, `title`, `signatureLabel`).
- A local `DEFAULT_NOTIFICATION_TEMPLATE` constant (re-exported and
  currently imported by `absences.component.ts` as the per-user fallback
  for the WhatsApp template).

The dialog also exports two more pieces of code: `AVATAR_PRESETS` and
`resolveAvatarPreset(avatarUrl)`. `resolveAvatarPreset` is used by
`layout.component.ts`'s topbar avatar (to decide whether to show the
preset icon, an uploaded image, or initials). Those two exports survive
this migration — they move to `profile.component.ts` (see R14); only the
`ProfileDialogComponent` class, the `Me` interface, and the
`DEFAULT_NOTIFICATION_TEMPLATE` constant disappear.

## Routing

## R1
The system SHALL register a child route at `path: 'profile'` inside the
authenticated shell (`app.routes.ts`, inside the `path: ''`,
`canActivate: [authGuard]` block) with `loadComponent` pointing to
`./features/profile/profile.component` and **no** `canActivate:
[moduleGuard]` / `data: { module: ... }` block — every authenticated user
with a valid JWT SHALL reach `/profile` regardless of role or `user_modules`
permissions, matching today's dialog accessibility.

## R2
The system SHALL attach `canDeactivate: [profileCanDeactivateGuard]` to
the `/profile` route (declared in `app.routes.ts` per R1) so that the
navigation guard described in R11–R14 runs on every navigation away.

## Profile page

## R3
The system SHALL provide `ProfileComponent` (`src/app/features/profile/
profile.component.ts`) as a `standalone: true` Angular component with
`changeDetection: ChangeDetectionStrategy.OnPush` (matching
`docs/architecture.md` §4) and inline `template` / `styles` (matching
`docs/conventions.md` "No `.html`/`.css` siblings"). The component's
declared `imports` SHALL include exactly: `FormsModule`, `MatFormFieldModule`,
`MatInputModule`, `MatButtonModule`, `MatIconModule`, `Router` (only if a
runtime nav is needed beyond what the layout already provides) — no
`MatDialogModule` / `MatDialogRef` (the component is no longer a dialog).

## R4
`ProfileComponent` SHALL render a page header (`Mi perfil`) plus the same
five sections the current dialog renders, in the same order:
1. Datos personales (full name + email + `Guardar` button).
2. Firma en reportes (title + signature label + preview block + `Guardar
   firma` button).
3. Avatar (current-avatar preview, preset grid, file-upload button — no
   per-section save button; selection/upload already persists immediately
   like today).
4. Contraseña (current password, new password, confirm new password,
   `Cambiar contraseña` button).
5. Mensaje de notificación (`Faltas y atrasos (WhatsApp)`, with
   `{{nombre}}`/`{{fecha}}`/`{{tipo}}`/`{{curso}}` placeholder chips,
   textarea, optional preview block, `Guardar mensaje` button).

## R5
Each of the five sections SHALL behave **functionally identically** to the
corresponding section in the current `ProfileDialogComponent`:
- HTTP endpoints called (`PUT /api/auth/me`, `PUT /api/auth/me/password`,
  `PUT /api/auth/me/avatar`, `POST /api/auth/me/avatar/upload`), request
  body shapes, success/error notifications, per-section save-button
  disabling while a request is in flight, and post-save side effects
  (`AuthService.updateLocalUser` for personal data / signature / avatar)
  SHALL match the dialog's current behavior exactly.
- `Me` interface SHALL match today's shape — `fullName`, `email`,
  `notificationTemplate`, `avatarUrl`, `title`, `signatureLabel` — read
  from `GET /api/auth/me` in `ngOnInit`.
- `DEFAULT_NOTIFICATION_TEMPLATE` SHALL be a module-local `const` in
  `profile.component.ts` with the **same text** as today's export
  (character-for-character), and SHALL be applied as the textarea's
  initial value when `me.notificationTemplate` is empty / null, exactly
  like today's `this.template.set(me.notificationTemplate ||
  DEFAULT_NOTIFICATION_TEMPLATE)`.
- The password section's blank-field / mismatch validations and its
  post-success local-clear of all three password fields SHALL match
  today.
- The avatar file-upload's preset clearing on a successful upload
  (`this.selectedPreset.set(null)`) SHALL match today.

## R6
`ProfileComponent` SHALL `inject(AuthService)`, `inject(HttpClient)`, and
`inject(NotificationService)` exactly as today's dialog does — same call
sites, same `firstValueFrom(this.http.x(...))` pattern, same
`try { ... } finally { savingFlag.set(false); }` shape for the per-section
saving signals (`savingProfile`, `savingSignature`, `savingPassword`,
`savingTemplate`, `savingAvatar`).

## Topbar avatar menu

## R7
`LayoutComponent.openProfile()` SHALL be replaced so that the topbar
avatar `Mi perfil` button calls `this.router.navigate(['/profile'])`
instead of `this.dialog.open(ProfileDialogComponent, { width: '520px' })`.
The button's `matTooltip`, `mat-icon-button` styling, and visibility
conditions (only when sidebar is expanded, i.e. `!collapsed() ||
isMobile()`, per today's `user-card` block in `layout.component.ts`)
SHALL be unchanged.

## R8
`LayoutComponent` SHALL remove the `import { ProfileDialogComponent,
resolveAvatarPreset } from '../components/profile-dialog/profile-dialog.component'`
line and SHALL import `resolveAvatarPreset` from
`../features/profile/profile.component` instead (R14 covers where the
helper lives). `MatDialog` SHALL be removed from `LayoutComponent` only
if no other consumer of `MatDialog` remains in that component (today it
is used solely by `openProfile()`; verify by reading
`layout.component.ts` end-to-end before deletion).

## ProfileDialogComponent removal

## R9
The system SHALL delete `src/app/shared/components/profile-dialog/`
(`profile-dialog.component.ts` and any empty sibling files) after the
new `ProfileComponent` is in place and every importer has been updated.
Before deletion, the implementer SHALL grep for any remaining
`ProfileDialogComponent` / `profile-dialog` references in `src/` and
update each one to the new component path (R8 covers the layout
importer; R10 covers the absences importer; R14's note covers the
`AVATAR_PRESETS` / `resolveAvatarPreset` move).

## R10
`AbsencesComponent` SHALL update its existing
`import { DEFAULT_NOTIFICATION_TEMPLATE } from '../../shared/components/profile-dialog/profile-dialog.component'`
to point at `'../../features/profile/profile.component'` — same symbol,
new path. The fallback-text behavior, the `private notificationTemplate
= DEFAULT_NOTIFICATION_TEMPLATE;` field, the `GET /api/auth/me`
notificationTemplate read in `ngOnInit`, and the WhatsApp message
construction at `~line 1202` SHALL be left functionally unchanged — this
spec does not introduce the per-action template service (that's a
separate feature scope); it only relocates the constant.

## Dirty-field guard

## R11
`ProfileComponent` SHALL track per-field dirty state for every
`ngModel`-bound plain field — `fullName`, `email`, `title`,
`signatureLabel`, `currentPassword`, `newPassword`, `confirmPassword` —
plus the `template` signal (used as a `[ngModel]`-equivalent via
`[(ngModel)]="template"` re-bound to a writable accessor, see design.md)
plus the avatar section's `selectedPreset()` (set by `choosePreset` and
`onAvatarFile` only on a successful save) — so the component can answer
"do any of these differ from the value originally loaded from
`/api/auth/me` or otherwise reflect a not-yet-saved user edit".

## R12
The system SHALL define a `CanDeactivateFn`-compatible guard at
`src/app/core/guards/profile-can-deactivate.guard.ts`, named
`profileCanDeactivateGuard`, which when invoked SHALL call
`component.canDeactivate()` (declared on `ProfileComponent`, R13) and
SHALL return its `Promise<boolean>` result (resolves to `true` →
navigation proceeds; resolves to `false` → navigation is cancelled).
The guard SHALL NOT block navigation for components other than
`ProfileComponent` (it is scoped to `/profile` only via the route config
in R2).

## R13
`ProfileComponent.canDeactivate(): Promise<boolean>` SHALL:
1. Return `Promise.resolve(true)` immediately if no tracked field is
   dirty (R11).
2. Otherwise open `UnsavedChangesDialogComponent` (R15) via
   `MatDialog.open(...)`, `await firstValueFrom(.afterClosed())` the
   emitted value, and:
   - `'save'` → trigger every section that has a not-yet-completed
     `saveXxx()` call against its currently-bound value (parallel
     `Promise.all`), and resolve to `true` only if all save calls
     resolve; resolve to `false` if any save rejects (the user stays on
     the page and the failed save's existing `NotificationService.error`
     toast already shown by the section's `catch` block is the
     feedback).
   - `'discard'` → resolve to `true` (in-flight unsaved local edits are
     lost; the next visit to `/profile` re-reads `/api/auth/me`).
   - `undefined` / `false` (Cancel button) → resolve to `false`.

## R14
The system SHALL keep `AVATAR_PRESETS` and `resolveAvatarPreset` as
named exports of `profile.component.ts` (moved from
`profile-dialog.component.ts`), with the same per-element shape
(`{ id, icon, color }`) and the same `preset:` URL prefix parsing —
`layout.component.ts`'s `avatarPreset()` / `isUploadedAvatar()` calls
and `ProfileComponent`'s own `selectedPreset` rendering SHALL both
keep working without changes to the data shape.

## R15
The system SHALL provide `UnsavedChangesDialogComponent` (`src/app/
features/profile/unsaved-changes-dialog.component.ts`) as a standalone
`MatDialog` component with three action buttons — `Guardar y salir`,
`Descartar cambios`, `Cancelar` — emitting the result values `'save'`,
`'discard'`, and `undefined` (Cancel — via `[mat-dialog-close]="false"`
or equivalent) respectively through `MatDialogRef.close(...)`. The
dialog SHALL display a `MatIcon` (`warning_amber` or similar),
a `title` ("Tienes cambios sin guardar"), and a `message`
("Tienes cambios sin guardar en tu perfil. ¿Quieres guardarlos antes
de salir?" or equivalent neutral Spanish copy).

## Build & verification

## R16
The implementer SHALL run `pnpm run build` (or
`./node_modules/.bin/tsc --noEmit -p .` if `pnpm` is not on `PATH`) and
SHALL confirm it exits `0`. The build SHALL pass with `strict: true`
and `strictTemplates: true` enabled (per `tsconfig.json` / `docs/
verification.md` Level 1).

## R17
Per `docs/verification.md` (no automated test suite today — Level 1
build + Level 3 manual smoke), the implementer SHALL run a manual smoke
against `docker compose up -d --build frontend` (or an already-running
stack) and record each step's pass/fail outcome in
`progress/impl_profile_to_route_promotion.md`:
1. Log in; click the topbar avatar's `Mi perfil` (`settings`) icon;
   confirm the URL becomes `/profile` and the page renders all 5
   sections with the user's current data prefilled.
2. Edit `Datos personales` (e.g. clear `Nombre completo`), click
   `Guardar`, confirm success toast, reload the page, confirm the
   edit persists.
3. Edit `Firma en reportes`, save, confirm success toast, confirm the
   preview block updates immediately.
4. Pick an avatar preset; confirm the new icon appears in the topbar
   avatar without a page reload (proves `AuthService.updateLocalUser`
   still fires).
5. Set a new password, confirm success toast; log out and log back in
   with the new password to prove the backend round-trip.
6. Edit `Mensaje de notificación` (add a placeholder), click
   `Guardar mensaje`, confirm success toast.
7. Trigger the dirty-field guard: edit a field (e.g. add a char to
   `Nombre completo` without clicking `Guardar`), then click the
   `Inicio` sidebar link; confirm the unsaved-changes dialog appears
   with `Guardar y salir`, `Descartar cambios`, `Cancelar`. Click
   `Cancelar` → stay on `/profile`. Re-edit, click `Descartar
   cambios` → navigate to `/home` and the edit is gone on return.
   Re-edit, click `Guardar y salir` → all dirty fields persist and
   navigation proceeds.
8. Repeat step 7's first half, but instead of clicking the sidebar,
   click the topbar `logout` button (which navigates to `/login`); the
   guard SHALL run and prompt the same way (proves the guard is wired
   into the route, not specific to one navigation origin).
9. Navigate to `/profile` with no dirty fields, then click anywhere
   else in the sidebar / topbar; confirm no prompt appears (proves
   the no-dirty-fields fast path of R13).
10. Visit `/admin` (a `moduleGuard`-gated route) as a non-admin user,
    confirm the redirect-to-`/home` flow still works; confirm that
    this spec did not change any guard behavior outside `/profile`.