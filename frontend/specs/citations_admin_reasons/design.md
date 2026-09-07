# Design — citations_admin_reasons

> Companion to `requirements.md` for feature 19. Backend
> `citation_reasons_management` is already shipped; this frontend feature is a
> pure CRUD UI on top of `GET / POST / PUT / DELETE /api/citation-reasons`.
> Conventions referenced in this document live in `docs/architecture.md` and
> `docs/conventions.md`; this design explains only what's specific to *this*
> feature within those boundaries.

## Files to touch

| File | Change |
|---|---|
| `src/app/core/models/index.ts` | Add `CitationReasonSeverity` type alias and `CitationReason` interface (lines ~32–44). |
| `src/app/shared/utils/citation-reason.util.ts` | **New.** Exports `CitationReasonSeverityOption`, `CITATION_REASON_SEVERITY_OPTIONS`, `citationReasonSeverityBadgeClass()`. |
| `src/app/features/admin/citation-reason-dialog.component.ts` | **New.** Standalone `MatDialog` form mirroring `CourseDialogComponent`'s shape. |
| `src/app/features/admin/admin.component.ts` | Add `citationReasons` signal; include `GET /api/citation-reasons` in `loadAll()`; add the `citation-reasons` tab block; add `openCitationReasonDialog()`, `severityBadgeClass()`, `severityLabel()`, `deleteCitationReason()`. |
| `src/app/core/nav-items.ts` | Add subnav row under `Administración`; add `admin:citation-reasons` entry under `MODULE_TREE` and `MODULE_KEYS`. |

No changes to `app.routes.ts` — `/admin` is already gated by `moduleGuard` with
`data: { module: 'admin' }` (see `docs/architecture.md` §Frontend Architecture),
which covers the citation-reasons tab identically.

## Signatures / new exports

```ts
// src/app/core/models/index.ts
export type CitationReasonSeverity = 'low' | 'medium' | 'high';

export interface CitationReason {
  id: number;
  institutionId: number;
  name: string;
  severity: CitationReasonSeverity;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// src/app/shared/utils/citation-reason.util.ts
export interface CitationReasonSeverityOption {
  value: CitationReasonSeverity;
  label: string;
  badgeClass: string;
}

export const CITATION_REASON_SEVERITY_OPTIONS: readonly CitationReasonSeverityOption[] = [
  { value: 'low',    label: 'Bajo',  badgeClass: 'badge-J' },
  { value: 'medium', label: 'Medio', badgeClass: 'badge-AT' },
  { value: 'high',   label: 'Alto',  badgeClass: 'badge-F' },
] as const;

export function citationReasonSeverityBadgeClass(severity: string): string;

// src/app/features/admin/citation-reason-dialog.component.ts
export interface CitationReasonDialogData {
  mode: 'create' | 'edit';
  reason?: CitationReason;
}

export class CitationReasonDialogComponent { /* standalone */ }
```

```ts
// admin.component.ts additions
readonly citationReasons = signal<CitationReason[]>([]);
openCitationReasonDialog(reason?: CitationReason): void;
deleteCitationReason(id: number): void;
severityBadgeClass(severity: string): string;
severityLabel(severity: string): string;
```

## Wire contract

| Verb | Path | Body / response |
|---|---|---|
| `GET` | `/api/citation-reasons` | `200` → `CitationReason[]` (soft-deleted rows excluded by backend) |
| `POST` | `/api/citation-reasons` | `{ name: string, severity: 'low'\|'medium'\|'high', description: string\|null }` → `201` |
| `PUT` | `/api/citation-reasons/:id` | same body → `200` |
| `DELETE` | `/api/citation-reasons/:id` | `204` |

Error codes the dialog/admin tab must handle:
- `409 Conflict` — duplicate `name` for the institution.
- `400 Bad Request` — invalid `severity` value, name too long, etc.
- `404 Not Found` — `id` no longer exists (after a concurrent delete, on PUT or DELETE).
- `500` — generic backend failure.

In every error case the dialog/admin tab surfaces the backend's
`err.error.error` message via `NotificationService.error` (falling back to a
generic Spanish message). The dialog stays open on POST/PUT failures so the
user can correct and retry; the tab does not reload the list on DELETE
failures.

## Dialog behavior

- Standalone Angular component (`ChangeDetectionStrategy.OnPush`).
- Three `mat-form-field` inputs (name, severity `mat-select`, description
  `textarea`) bound with `[(ngModel)]`.
- Save button uses `[disabled]="!name.trim() || name.trim().length > 150 || saving()"`
  to prevent blank or oversized submits and double-clicks.
- The create/edit branch is selected from `data.mode`. The HTTP verb is
  `POST` for create and `PUT /:id` for edit.
- Description is sent as `description.trim() || null` (never an empty string).
- On success: success toast, `dialogRef.close(true)`. On failure: error toast,
  dialog stays open.
- `severity` default is `'low'` for create mode; pre-populated from the row
  for edit mode.

## Tab behavior

- Tab body is rendered only when `activeTab() === 'citation-reasons'`. The
  `activeTab` signal is derived from the `tab` query param
  (`route.queryParamMap.pipe(map(p => p.get('tab') ?? 'users'))`), so
  navigating to `/admin?tab=citation-reasons` is sufficient to land on the
  tab — no extra routing work needed.
- `loadAll()` fetches `/api/citation-reasons` alongside the other admin
  resources (`courses`, `users`, `roles`, `quarters`) in the same
  `Promise.all`, with a `.catch(() => [])` fallback to keep the tab usable
  if the endpoint is temporarily unavailable.
- After any successful create, edit, or delete, `loadAll()` is called again
  so that soft-deleted rows disappear from the rendered list (backend marks
  them `deletedAt` and excludes them from `GET`).
- Desktop view: `data-table` (4 columns: Nombre, Severidad, Descripción, actions).
- Mobile view: stacked `admin-row` cards with name / severity badge /
  description (`—` fallback) and edit + delete icon buttons.

## Discarded alternatives

1. **Per-resource client-side permission check on the tab.** The current
   `admin.component.ts` has no per-tab permission gate inside the component —
   all admin sub-tabs are gated solely by the `admin` module key at the route
   level (`moduleGuard`). Adding a new client-side permission system just for
   this tab would have required either extending the `role_permissions` model
   with a `tab` dimension or building a per-resource client guard. Rejected:
   out of scope for this feature and inconsistent with how the existing
   `Cursos` / `Años lectivos` / `Permisos` / `Importar nómina` tabs are
   gated. The `admin` module key is sufficient.

2. **Inline edit form (no dialog).** Considered a row-expanding edit form to
   keep everything in the tab body. Rejected: the `CourseDialogComponent`
   already establishes the dialog pattern in the same file, and the
   description field can grow to several lines of prose that would crowd the
   table. Mirroring the dialog shape keeps the UX consistent and keeps the
   validation rules (maxlength, disabled save button) in one place.

3. **Reusable `severity` badge component.** A shared `<app-severity-badge>`
   component would be DRY if other resources (justifications, future
   incident reports) also pick up severity. Rejected for this feature:
   no other resource currently uses severity, so the abstraction would be
   premature. The util file already centralizes the mapping so extracting a
   component later is mechanical if a second consumer appears.

4. **Editing name and severity but treating description as immutable on
   update.** Rejected: backend allows updating description (it's a regular
   field on `PUT`), and the dialog is already the only entry point — adding
   a partial-update path would split the truth between client and server.

## Cross-project dependency

This feature consumes backend feature `citation_reasons_management`. That
backend feature must be `done` (its `/api/citation-reasons` endpoints
returning the documented status codes) before this frontend feature can be
verified end-to-end. The frontend build itself (`pnpm build`) does not
require the backend to be running — only the live-stack verification step
does.