# Tasks — Promote ProfileDialog to routed `/profile` page

Work top-to-bottom; later tasks depend on files created by earlier ones.
Order is chosen so each task ends with a buildable repo: scaffold route
first so the lazy import resolves, then component skeleton, then the
guard wiring, then the dialog deletion last (after every importer is
updated, per R9's "verify no other callers" gate).

## Routing & guard scaffold

- [ ] T1 (R1) Add `path: 'profile'` child route to `app.routes.ts`
      inside the authenticated shell block (parent `canActivate:
      [authGuard]`), with `loadComponent` pointing at
      `./features/profile/profile.component` and **no** `moduleGuard` /
      `data: { module: ... }`.
- [ ] T2 (R12) Create `src/app/core/guards/profile-can-deactivate.guard.ts`
      exporting `profileCanDeactivateGuard: CanDeactivateFn<ProfileComponent>`
      that calls `component.canDeactivate()` and returns its
      `Promise<boolean>`.
- [ ] T3 (R2) Attach `canDeactivate: [profileCanDeactivateGuard]` to the
      `path: 'profile'` route added in T1.

## `ProfileComponent`

- [ ] T4 (R14) Create `src/app/features/profile/profile.component.ts`
      with `AVATAR_PRESETS` and `resolveAvatarPreset` copied verbatim
      from today's `profile-dialog.component.ts` (same shape, same
      `preset:` URL prefix parsing).
- [ ] T5 (R5) Add `DEFAULT_NOTIFICATION_TEMPLATE` (same text as today)
      and the local `Me` interface (`fullName`, `email`,
      `notificationTemplate`, `avatarUrl`, `title`, `signatureLabel`) to
      `profile.component.ts`.
- [ ] T6 (R3, R6) Scaffold `ProfileComponent` (`standalone: true`,
      `ChangeDetectionStrategy.OnPush`, inline `template` / `styles`,
      `imports: [FormsModule, MatFormFieldModule, MatInputModule,
      MatButtonModule, MatIconModule]`), with `inject(AuthService)`,
      `inject(HttpClient)`, `inject(NotificationService)`,
      `inject(MatDialog)` (the latter is only used by R13's guard), all
      field declarations (`fullName`, `email`, `title`,
      `signatureLabel`, `currentPassword`, `newPassword`,
      `confirmPassword`), the `template: signal<string>`,
      `avatarUrl: signal<string | null>`, `selectedPreset:
      signal<string | null>`, and the five per-section saving signals
      (`savingProfile`, `savingSignature`, `savingPassword`,
      `savingTemplate`, `savingAvatar`).
- [ ] T7 (R5, R6) Copy the five `saveXxx()` / `choosePreset()` /
      `onAvatarFile()` methods verbatim from
      `profile-dialog.component.ts` (same HTTP calls, same request
      bodies, same `try { ... } finally { savingFlag.set(false); }`
      shape, same success / error notifications, same
      `AuthService.updateLocalUser` calls for personal data, signature,
      and avatar). The `preview` / `insert` helpers also carry over
      unchanged.
- [ ] T8 (R4, R5) Copy the `<mat-dialog-content>` body markup verbatim
      (five `.section` blocks with `Datos personales`, `Firma en
      reportes`, `Avatar`, `Contraseña`, `Mensaje de notificación`,
      in that exact order, with their description copy, placeholder
      chips, preview blocks, save buttons) and swap `<mat-dialog-title>`
      for a `<div class="page-header"><h1 class="page-title">Mi
      perfil</h1></div>` block; remove the
      `<mat-dialog-actions>...Cerrar...</mat-dialog-actions>` block.
- [ ] T9 (R11) In `ngOnInit`, snapshot the initial values into
      `private initial: Pick<Me, ...>` after the
      `GET /api/auth/me` resolves; implement `hasDirty(): boolean` per
      `design.md` (compares every tracked field against the snapshot,
      treats any non-empty password field as dirty, treats
      `selectedPreset()` differing from the preset resolved from the
      snapshot's `avatarUrl` as dirty).
- [ ] T10 (R11) After every successful save (`saveProfile`,
      `saveSignature`, `savePassword`, `saveTemplate`, `choosePreset`,
      `onAvatarFile`), refresh the relevant slice of `this.initial` so
      `hasDirty()` returns `false` immediately after a successful
      save — matches the user's mental model "I clicked Save, so the
      form is no longer dirty" and keeps the no-dirty fast path
      deterministic.

## `UnsavedChangesDialogComponent`

- [ ] T11 (R15) Create
      `src/app/features/profile/unsaved-changes-dialog.component.ts`
      (standalone, `ChangeDetectionStrategy.OnPush`, inline template /
      styles) with three action buttons:
      `Guardar y salir` (primary, `dialogRef.close('save')`),
      `Descartar cambios` (warn, `dialogRef.close('discard')`),
      `Cancelar` (`dialogRef.close(false)`), plus a header icon
      (`warning_amber`), title ("Tienes cambios sin guardar"), and
      message ("Tienes cambios sin guardar en tu perfil. ¿Quieres
      guardarlos antes de salir?" or equivalent neutral copy).

## Guard wiring

- [ ] T12 (R13) Implement
      `ProfileComponent.canDeactivate(): Promise<boolean>`:
      `hasDirty()` → `true`; otherwise open
      `UnsavedChangesDialogComponent` via `MatDialog`, await
      `firstValueFrom(.afterClosed())`, and resolve per R13's
      `'save'` / `'discard'` / `undefined` branches. `'save'` triggers
      every dirty section's existing `saveXxx()` in parallel via
      `Promise.allSettled`; resolve `true` only if all save promises
      fulfilled, `false` otherwise (each section's existing
      `try/catch` already emits `NotificationService.error` on
      failure).
- [ ] T13 (R12) Verify `profileCanDeactivateGuard` (from T2) calls
      `component.canDeactivate()` and returns its `Promise<boolean>`
      untouched; T3 already wires it into the route.

## Layout wiring

- [ ] T14 (R7) Replace `LayoutComponent.openProfile()` body with
      `this.router.navigate(['/profile'])`.
- [ ] T15 (R8) Update `LayoutComponent`'s import: replace
      `import { ProfileDialogComponent, resolveAvatarPreset } from '../components/profile-dialog/profile-dialog.component'`
      with `import { resolveAvatarPreset } from '../features/profile/profile.component'`.
      Remove the `MatDialog` import / `private readonly dialog =
      inject(MatDialog)` line from `LayoutComponent` only after
      confirming (by reading the full file) that `openProfile` was its
      sole consumer.
- [ ] T16 (R8) Confirm the topbar avatar `Mi perfil` button's
      `matTooltip`, icon, and visibility conditions are unchanged from
      today's `layout.component.ts:254-256`.

## ProfileDialogComponent deletion

- [ ] T17 (R9) Grep the entire `src/` tree for any remaining
      `ProfileDialogComponent` or `profile-dialog` references; every
      importer must already be updated by T15 + T18 before deletion.
- [ ] T18 (R10) Update `src/app/features/absences/absences.component.ts`
      to import `DEFAULT_NOTIFICATION_TEMPLATE` from
      `'../../features/profile/profile.component'` (same symbol, new
      path).
- [ ] T19 (R9) Delete `src/app/shared/components/profile-dialog/` and
      its `profile-dialog.component.ts` (and any empty sibling files).

## Build & verification

- [ ] T20 (R16) Run `pnpm run build` (or
      `./node_modules/.bin/tsc --noEmit -p .`) and confirm exit code
      `0`. If red, fix and re-run before T21.
- [ ] T21 (R17) Run the R17 manual smoke scenario against
      `docker compose up -d --build frontend` (Level 1 + Level 3 per
      `docs/verification.md`), recording each step's pass/fail outcome
      in `progress/impl_profile_to_route_promotion.md`:
      1. Log in; click the topbar avatar's `Mi perfil` icon; confirm
         URL is `/profile` and the page renders all 5 sections with
         the user's current data prefilled.
      2. Edit `Datos personales`, click `Guardar`, confirm success
         toast; reload, confirm edit persists.
      3. Edit `Firma en reportes`, save, confirm preview block updates.
      4. Pick an avatar preset; confirm the new icon appears in the
         topbar avatar without a page reload.
      5. Set a new password, confirm success toast; log out, log back
         in with the new password.
      6. Edit `Mensaje de notificación`, click `Guardar mensaje`,
         confirm success toast.
      7. Trigger the dirty-field guard: edit a field, click the
         `Inicio` sidebar link, confirm the `Guardar y salir` /
         `Descartar cambios` / `Cancelar` dialog appears. Click
         `Cancelar` → stay on `/profile`. Re-edit, click `Descartar
         cambios` → navigate to `/home`, edit gone on return.
         Re-edit, click `Guardar y salir` → all dirty fields persist
         and navigation proceeds.
      8. Repeat step 7's first half, click the topbar `logout` button
         instead of the sidebar; guard prompts the same way.
      9. Navigate to `/profile` with no dirty fields, click any other
         sidebar / topbar link; confirm no prompt appears.
      10. As a non-admin user, visit `/admin`; confirm redirect to
          `/home` still works (proves no guard outside `/profile` was
          changed).
- [ ] T22 (R17, Level 4) If `scripts/visual-smoke.mjs`'s `mockApi`
      already mocks `GET /api/auth/me` (per `docs/verification.md`
      §Level 4), capture `progress/visual_profile_to_route_promotion.png`
      + `.json` and attach to the session log; otherwise extend
      `mockApi` with the missing fixture first.