# Design — Promote ProfileDialog to routed `/profile` page

## Files touched

- `src/app/core/guards/profile-can-deactivate.guard.ts` — **new file** (R12).
- `src/app/features/profile/profile.component.ts` — **new file** (R3, R4,
  R5, R6, R11, R13, R14). Houses `AVATAR_PRESETS`, `resolveAvatarPreset`,
  `DEFAULT_NOTIFICATION_TEMPLATE`, `ProfileComponent`, and the `Me`
  interface (moved from `profile-dialog.component.ts`).
- `src/app/features/profile/unsaved-changes-dialog.component.ts` — **new
  file** (R15). Co-located with `profile.component.ts`; only one consumer
  (the dirty-field guard).
- `src/app/app.routes.ts` — add the `path: 'profile'` child route under
  the authenticated shell with `loadComponent` and `canDeactivate`
  (R1, R2).
- `src/app/shared/layout/layout.component.ts` — `openProfile()` becomes
  `router.navigate(['/profile'])`; `MatDialog` import removed if no other
  consumer; `ProfileDialogComponent` import replaced with `Router` (the
  existing import stays usable); `resolveAvatarPreset` import path
  updated (R7, R8).
- `src/app/features/absences/absences.component.ts` — one-line import
  path update for `DEFAULT_NOTIFICATION_TEMPLATE` (R10).
- `src/app/shared/components/profile-dialog/` — **delete** the directory
  and its `profile-dialog.component.ts` file (R9).

No backend, `core/services/`, `core/models/`, `nginx.conf`, or other
`features/` change.

## Why a new top-level `features/profile/`, not `shared/components/`

Today's `profile-dialog.component.ts` lives under `shared/components/`,
which `docs/architecture.md` §1 reserves for **dialogs/widgets used by
2+ features**. The promoted page is a routed feature with its own URL,
its own guard, and (today) exactly one entry point — the topbar avatar —
matching the routing pattern used by `features/auth/`,
`features/admin/`, `features/home/`, `features/dashboard/` (each is a
single-route `features/<name>/` folder with a top-level
`<name>.component.ts`). Putting it under `features/profile/` aligns with
`docs/architecture.md`'s "one folder per business area" rule. The
co-located `unsaved-changes-dialog.component.ts` lives in the same folder
because it has exactly one consumer (`ProfileComponent`) — extracting it
to `shared/` would violate `docs/conventions.md` Reusability's "don't
build a generic abstraction for a concern that's genuinely one-off" line.

## `ProfileComponent` skeleton

```ts
// src/app/features/profile/profile.component.ts
import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { UnsavedChangesDialogComponent } from './unsaved-changes-dialog.component';

export const DEFAULT_NOTIFICATION_TEMPLATE =
  'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.';

export interface AvatarPreset { id: string; icon: string; color: string; }

export const AVATAR_PRESETS: AvatarPreset[] = [ /* unchanged from today */ ];

export function resolveAvatarPreset(avatarUrl: string | null | undefined): AvatarPreset | null { /* unchanged */ }

interface Me {
  fullName: string | null;
  email: string | null;
  notificationTemplate: string | null;
  avatarUrl: string | null;
  title: string | null;
  signatureLabel: string | null;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  styles: [ /* shared .section / .section-title / .placeholders / .ph-chip / .preset-grid / .preset-btn / .current-avatar / page-header styles */ ],
  template: ` <div class="page-header"><h1 class="page-title">Mi perfil</h1></div> ... five sections ... `
})
export class ProfileComponent implements OnInit {
  // ... same inject(AuthService), inject(HttpClient), inject(NotificationService),
  //     inject(MatDialog), field declarations, save methods as today ...
}
```

The five sections' markup is copied verbatim from
`profile-dialog.component.ts`'s `<mat-dialog-content>` body, with three
adaptations:

1. `<mat-dialog-title>Mi perfil</mat-dialog-title>` becomes a
   `<div class="page-header"><h1 class="page-title">Mi perfil</h1></div>`
   page header (matching the established page-header pattern from
   `admin.component.ts:96-105` and `home.component.ts`'s greeting block).
2. The dialog's closing `<mat-dialog-actions align="end"><button mat-button
   (click)="dialogRef.close()">Cerrar</button></mat-dialog-actions>` is
   removed — there's no dialog to close; the user navigates away via the
   topbar / sidebar / browser-back and the `canDeactivate` guard (R11–R13)
   handles unsaved changes.
3. Width constraint is gone (the dialog's `width: '520px'` was an
   `MatDialog` config option, not a CSS width on `.section`); the
   container naturally fills the layout's `.content` area.

### Field tracking and the `template` binding

The dialog's `template: signal<string>` was a signal because
`(ngModel)]="template"` doesn't work on a signal directly. The page
component uses the same workaround: keep a writable backing field
(`template = ''`) and assign-through on read, OR bind to a getter/setter
pair — but the cleanest path that preserves the dialog's exact UI is to
keep `template` as a `signal<string>` and bind via
`[ngModel]="template()" (ngModelChange)="template.set($event)"` instead
of `[(ngModel)]`. R5 explicitly permits this — it says "textarea bound to
the current template value, two-way" — and it keeps the existing
`saveTemplate()` (`this.template()` read, `this.savingTemplate.set(true)`,
etc.) working without refactoring every save method.

The plain-class fields (`fullName`, `email`, `title`, `signatureLabel`,
`currentPassword`, `newPassword`, `confirmPassword`) keep the existing
`[(ngModel)]="fullName"` shape — same as today, no signal conversion —
because they're written to only through `[(ngModel)]` (per
`docs/architecture.md` §4's signal rule, which exempts ngModel-bound
fields).

### Dirty-field tracking (R11)

Initial values are snapshotted in `ngOnInit` after `GET /api/auth/me`
resolves, into a single private record:

```ts
private initial: Pick<Me, 'fullName' | 'email' | 'title' | 'signatureLabel'
                          | 'notificationTemplate' | 'avatarUrl'> = {
  fullName: '', email: '', title: '', signatureLabel: '',
  notificationTemplate: '', avatarUrl: null,
};
```

After the HTTP call resolves, each tracked field is compared against its
snapshot via a single `hasDirty()` method:

```ts
hasDirty(): boolean {
  const i = this.initial;
  return this.fullName    !== (i.fullName    ?? '')
      || this.email       !== (i.email       ?? '')
      || this.title       !== (i.title       ?? '')
      || this.signatureLabel !== (i.signatureLabel ?? '')
      || this.template()  !== (i.notificationTemplate ?? '')
      || this.avatarUrl() !== (i.avatarUrl ?? null)
      || this.currentPassword !== ''
      || this.newPassword     !== ''
      || this.confirmPassword !== ''
      || this.selectedPreset() !== resolveAvatarPreset(i.avatarUrl ?? null)?.id;
}
```

The password fields and the avatar preset are tracked as "dirty if
non-default" — `currentPassword`/`newPassword`/`confirmPassword` are
cleared after a successful save (matching today's `savePassword` final
block), and `selectedPreset` is re-synced after `choosePreset` /
`onAvatarFile` (today these call `this.selectedPreset.set(...)`
unconditionally on success). R5 preserves those exact behaviors.

After every successful save (`saveProfile`, `saveSignature`,
`savePassword`, `saveTemplate`, `choosePreset`, `onAvatarFile`), the
relevant slice of `this.initial` is refreshed in place so a re-read of
`hasDirty()` immediately after the save returns `false`. For
`savePassword`, all three password slices are zeroed in `initial` (the
local fields are zeroed too, so they match). For `choosePreset` /
`onAvatarFile`, the `avatarUrl` and `selectedPreset` slices are
refreshed. This makes the dirty-field guard's no-dirty fast path
deterministic and matches the user's mental model: "I clicked Save, so
the form is no longer dirty."

### `canDeactivate()` and the guard (R12, R13)

```ts
// ProfileComponent
async canDeactivate(): Promise<boolean> {
  if (!this.hasDirty()) return true;
  const choice = await firstValueFrom(
    this.dialog.open(UnsavedChangesDialogComponent, { width: '420px' })
      .afterClosed()
  );
  if (choice === 'discard') return true;
  if (choice === 'save') {
    // Trigger only the dirty sections in parallel; mirror saveProfile /
    // saveSignature / saveTemplate / savePassword. Sections whose
    // pre-save validation fails (blank password, mismatched new/confirm,
    // blank template) already short-circuit and emit a
    // NotificationService.warning themselves; canDeactivate should treat
    // that as "save failed → stay on page."
    const results = await Promise.allSettled([
      this.fullName    !== (this.initial.fullName ?? '')
          || this.email !== (this.initial.email    ?? '') ? this.saveProfile()    : null,
      this.title       !== (this.initial.title ?? '')
          || this.signatureLabel !== (this.initial.signatureLabel ?? '') ? this.saveSignature() : null,
      this.template()  !== (this.initial.notificationTemplate ?? '') ? this.saveTemplate() : null,
      this.currentPassword || this.newPassword || this.confirmPassword ? this.savePassword() : null,
    ].filter(Boolean) as Promise<void>[]);
    return results.every(r => r.status === 'fulfilled');
  }
  return false; // Cancel / dialog dismissed
}
```

```ts
// src/app/core/guards/profile-can-deactivate.guard.ts
import { CanDeactivateFn } from '@angular/router';
import { ProfileComponent } from '../../features/profile/profile.component';

export const profileCanDeactivateGuard: CanDeactivateFn<ProfileComponent> = (component) => {
  return component.canDeactivate();
};
```

`CanDeactivateFn<T>` returns `Observable<boolean> | Promise<boolean> |
boolean`; `Promise<boolean>` is the established pattern in this codebase
(Angular's router natively awaits it — no `from(...)` wrapping needed).
`MatDialog` is `inject`ed into `ProfileComponent` solely for this guard
flow — no other consumer in the page — and its import is local to this
file.

## `UnsavedChangesDialogComponent` (R15)

Co-located with `profile.component.ts`. `standalone: true`, inline
`template`/`styles` per `docs/conventions.md`, `changeDetection:
ChangeDetectionStrategy.OnPush`. Three buttons:

- `Guardar y salir` (primary) → `dialogRef.close('save')`.
- `Descartar cambios` (warn / `color="warn"`) → `dialogRef.close('discard')`.
- `Cancelar` (`mat-button`) → `dialogRef.close(false)`.

The dialog itself is form-agnostic (no `MAT_DIALOG_DATA` shape required —
the title/message are hardcoded because there's exactly one call site).
If a second call site ever needs custom copy, the title/message can move
into `MAT_DIALOG_DATA` then.

## Routing (R1, R2)

`src/app/app.routes.ts` gets a single new entry inside the existing
authenticated-shell children block, alongside the `calendar` and `admin`
single-route entries:

```ts
{
  path: 'profile',
  loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
  canDeactivate: [profileCanDeactivateGuard],
},
```

No `canActivate: [moduleGuard]` block, no `data: { module: ... }` — the
parent route's `canActivate: [authGuard]` already gates on "must be
logged in," which matches today's dialog accessibility (every
authenticated user, regardless of role). The `/profile` URL is reachable
via `routerLink` and direct URL entry; the existing wildcard `**` →
`home` redirect already covers any unknown sub-path, so no extra
wildcard handling is needed.

## `LayoutComponent` change (R7, R8)

`openProfile()` body swaps from `dialog.open(...)` to
`router.navigate(['/profile'])`. `Router` is already injected today (line
318), so no new inject is needed. `MatDialog` import becomes removable
only if `openProfile` was its sole consumer — verified by reading
`layout.component.ts` end-to-end before deletion; if any other
`this.dialog.*` call is present, keep `MatDialog` injected.

The topbar button's visual is unchanged:
`<button mat-icon-button class="logout-btn" (click)="openProfile()"
matTooltip="Mi perfil"><mat-icon>settings</mat-icon></button>` — only
`openProfile()`'s body changes, nothing else.

## `AbsencesComponent` change (R10)

One-line import path update. No behavior change; `DEFAULT_NOTIFICATION_TEMPLATE`
is still exported from the same module-level `const` in
`profile.component.ts` as today. This spec does **not** introduce
`NotificationTemplateService` / per-action templates — that's a separate
feature (`notification_templates_settings_ui`, already spec'd / approved
in this project, not yet merged for the frontend in this branch). When
that feature is eventually implemented, its first task will be the same
one-line import update — the symbol's location is already on its new
home, so the import path stays put.

## Discarded alternatives

1. **Keep `ProfileDialogComponent` alongside the new routed page for a
   deprecation window (route opens both, dialog menu button opens the
   dialog, etc.).** Rejected: the dialog's per-section `MatDialog` close
   semantics (`dialogRef.close()` is the only way to dismiss) make it
   fundamentally incompatible with the canDeactivate-on-navigation
   pattern required by the form-state guard (R11–R13). A migration
   period where both exist would mean two different "edit your profile"
   UXs in production simultaneously — the dialog's `Cerrar` button would
   silently bypass the dirty-field guard, defeating its purpose, while
   the routed page enforces it. Keeping the dialog as a "fallback" for
   users who bookmark the old URL is a non-issue: the dialog isn't
   URL-addressable today, so there are no bookmarks to preserve. Cut
   cleanly.
2. **Promote to `/admin/profile` (or `/settings/profile`) so the
   `admin`-module guard gates it.** Rejected: today's
   `ProfileDialogComponent` is opened from the topbar unconditionally —
   any authenticated user, including teachers, inspectors, and students
   (where applicable), can edit their own profile. Gating the page
   behind `moduleGuard` would hide a feature every user already has,
   behind a role check that doesn't apply. The acceptance criterion
   "no `moduleGuard`" (R1) is the same rejection, formalized.
3. **Replace the canDeactivate-on-navigation guard with a blocking
   reactive form (`FormGroup.dirty`) and require the user to click
   `Guardar todo` before leaving.** Rejected: the feature description
   explicitly rejects this — "blocking router guard would force save
   even when they want to discard." The Save / Discard / Cancel choice
   is the whole point; a blocking guard removes the discard path.
4. **Silent autosave on every `ngModelChange` (debounced), no
   navigation guard.** Rejected: same feature-description rejection
   ("silent autosave would surprise users"), plus it would change the
   per-section save-button UX the user already has muscle memory for,
   and it would need a backend contract change to support it
   (today's endpoints are explicit-save, not patch-on-write). Out of
   scope.

## Spec deltas (user-accepted)

### R5 — WhatsApp template read/write endpoint

**Original spec:** R5 and the local `Me` interface (`design.md` lines
71–78 above; `requirements.md` R5) say the WhatsApp template is read from
`GET /api/auth/me` (`me.notificationTemplate`) and persisted via
`PUT /api/auth/me { notificationTemplate: ... }`.

**Implementation reality:** `ProfileComponent` reads the template via
`GET /api/notification-templates?actionKey=absences` and persists it via
`PUT /api/notification-templates { actionKey: 'absences', template }`.
The fallback to `DEFAULT_NOTIFICATION_TEMPLATE` when the user has never
saved one is unchanged.

**Why the spec text and the implementation diverge:**

- `backend/src/services/auth.service.ts`'s `updateMe` controller uses an
  explicit allowlist for `PUT /api/auth/me`; a `notificationTemplate`
  key in the body is silently dropped, so writing through `/api/auth/me`
  would never persist.
- `GET /api/auth/me`'s response shape does not include a
  `notificationTemplate` field, so reading through `/api/auth/me` would
  always return `null` and the page would render `DEFAULT_NOTIFICATION_TEMPLATE`
  even for users who have saved a custom message.
- The original `ProfileDialogComponent` routed its template read/write
  through `NotificationTemplateService`, which is itself a wrapper over
  `/api/notification-templates`. The dialog's `me.notificationTemplate`
  field was already template-service-backed in practice — not
  `/api/auth/me`-backed — so the new page preserves the dialog's runtime
  behavior verbatim.

**What this preserves:**

- R5's functional identity: the page section reads, writes, post-save
  notification toast, and `AuthService.updateLocalUser` side-effects (where
  applicable) behave identically to the deleted dialog.
- R11/R14 and the rest of the spec's field-snapshot / dirty-tracking
  contract — `template()` participates in `hasDirty()`, `canDeactivate()`'s
  `'save'` branch, and `initial.notificationTemplate` refresh after
  `saveTemplate()`.
- R10's relocation of `DEFAULT_NOTIFICATION_TEMPLATE` to
  `profile.component.ts`.

**What this does NOT affect:**

- R10's `DEFAULT_NOTIFICATION_TEMPLATE` constant still moves to
  `profile.component.ts` as the spec requires.
- No other requirement is impacted. The five-section layout, the
  dirty-field guard, the password change flow, the avatar flow, and the
  signature flow all remain on `/api/auth/me` / `/api/auth/me/password` /
  `/api/auth/me/avatar{,/upload}` as the spec specifies.

**Status:** user-accepted 2026-09-05. Do **not** "fix" by reverting to
`/api/auth/me` for the template path without first landing a backend
change to `updateMe` (allowlist the `notificationTemplate` key) and to
`/api/auth/me` (return `notificationTemplate` in the response) — that
work is out of scope for this feature.

## Verification

No automated test suite exists in this project (`docs/verification.md`
"Current state"). Verification is `pnpm run build` (R16) plus the
manual smoke scenario in R17 (R17 step 1–10), run against
`docker compose up -d --build frontend` (Level 1 + Level 3 per
`docs/verification.md`).

This feature touches `template:` / `styles:` in a brand-new component
(`profile.component.ts`) and the `unsaved-changes-dialog.component.ts`
dialog, so the `frontend-design` skill applies per
`docs/architecture.md` Design Workflow — the visual direction
(sticky-feeling form layout, five-section vertical rhythm, page-header
in place of dialog title) should be drafted with the `design` canvas
skill before any markup is written, and the implementation must follow
the established `<div class="page-header"><h1 class="page-title">…`
convention used by `admin.component.ts`/`home.component.ts` rather
than re-deriving a header look.

Level 4 visual smoke (`scripts/visual-smoke.mjs`) is recommended —
extend its `mockApi` function with a `GET /api/auth/me` fixture if one
isn't already present (the file already mocks this endpoint per
`docs/verification.md` §Level 4), and capture a screenshot of `/profile`
for reviewer's session log.