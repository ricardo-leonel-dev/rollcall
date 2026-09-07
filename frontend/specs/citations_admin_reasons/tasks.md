# Tasks — citations_admin_reasons

> All tasks are checked because the feature is `done`. Each task cites the
> `R<n>` requirement(s) it satisfies; this map is what the `reviewer` walks
> through for `CHECKPOINTS.md` C6 traceability. Source-of-truth for what
> shipped: `state/sessions/2026-09-05-33-citations_admin_reasons.md` and the
> files listed in `design.md`.

---

- [x] T1 (R22) Create `src/app/shared/utils/citation-reason.util.ts` exporting
  `CitationReasonSeverityOption`, `CITATION_REASON_SEVERITY_OPTIONS`
  (`low`/`medium`/`high` → `Bajo`/`Medio`/`Alto` + `badge-J`/`badge-AT`/`badge-F`),
  and `citationReasonSeverityBadgeClass(severity)` returning `badge-gray` for
  unknown values.

- [x] T2 (R12) Add `CitationReasonSeverity` type alias and `CitationReason`
  interface (with `id`, `institutionId`, `name`, `severity`, `description`,
  `isActive`, `createdAt`, `updatedAt`, `deletedAt`) to
  `src/app/core/models/index.ts` so the dialog and the tab share one shape.

- [x] T3 (R13) Scaffold `src/app/features/admin/citation-reason-dialog.component.ts`
  as a standalone `MatDialog` form with `mode: 'create' | 'edit'`,
  `name`/`severity`/`description` `[(ngModel)]` inputs, the
  `CITATION_REASON_SEVERITY_OPTIONS`-fed `mat-select`, and
  `maxlength="150"` on the name input.

- [x] T4 (R13, R14) Wire the Save button's `[disabled]` rule
  (`!name.trim() || name.trim().length > 150 || saving()`) and the
  `description.trim() || null` payload normalization so the dialog never
  submits blank names, oversized names, or empty-string descriptions.

- [x] T5 (R10, R11) Implement `save()` — branch on `data.mode`, `POST
  /api/citation-reasons` for create, `PUT /api/citation-reasons/:id` for
  edit — using `firstValueFrom(this.http.{post,put}(...))`.

- [x] T6 (R15, R16) Handle the save outcome — `notify.success('Motivo
  creado' / 'Motivo actualizado')` + `dialogRef.close(true)` on success;
  `notify.error(err?.error?.error ?? 'Error al guardar')` and leave the
  dialog open on any non-2xx response.

- [x] T7 (R3) Add `readonly citationReasons = signal<CitationReason[]>([])`
  to `admin.component.ts` and include
  `GET /api/citation-reasons` in `loadAll()`'s `Promise.all` (with
  `.catch(() => [])` so a transient backend failure doesn't blank the tab).

- [x] T8 (R1, R2, R4, R8) Add the `citation-reasons` tab block in
  `admin.component.ts`: desktop `data-table` (Nombre / Severidad /
  Descripción / actions), mobile `admin-row` cards, and the top-right
  `Agregar motivo` button — gated by the existing `admin` module key via
  `moduleGuard` on `/admin`, identical to the Cursos / Años lectivos /
  Permisos / Importar nómina sub-tabs.

- [x] T9 (R5, R6, R7) Render each row's severity badge via
  `severityBadgeClass(r.severity)` + `severityLabel(r.severity)` (thin
  wrappers around the shared util) and render the `—` em-dash fallback for
  null/empty `description` in both the desktop `<td>` and the mobile card
  body.

- [x] T10 (R9) Implement `openCitationReasonDialog(reason?: CitationReason)`
  — opens `CitationReasonDialogComponent` with `{ mode: reason ? 'edit' :
  'create', reason }`; on `afterClosed` truthy result, runs `loadAll()` to
  refresh the list.

- [x] T11 (R17, R18) Implement `deleteCitationReason(id)` — opens
  `ConfirmDialogComponent` with title `Eliminar motivo de citación` /
  body `¿Eliminar este motivo de citación? Esta acción no se puede
  deshacer.`; on confirmation, `DELETE /api/citation-reasons/:id`; on
  failure, `notify.error(err?.error?.error ?? 'Error al eliminar')` and
  do not reload the list.

- [x] T12 (R16, R19) After any successful create / edit (T10's
  `afterClosed`) or delete (T11), call `loadAll()` so soft-deleted rows
  (`deletedAt` set by backend) disappear from the next paint and the new
  or updated row appears in place.

- [x] T13 (R20) Add a subnav row under the `Administración` section in
  `src/app/core/nav-items.ts`:
  `{ route: '/admin', icon: 'rule', label: 'Motivos de citación',
  moduleKey: 'admin', queryParams: { tab: 'citation-reasons' } }`, placed
  between the `Permisos` and `Importar nómina` rows.

- [x] T14 (R21) Add `admin:citation-reasons` to `MODULE_TREE` (under the
  `admin` node, between `admin:permissions` and `admin:roster`, label
  `Motivos de citación`) and to `MODULE_KEYS` (label
  `↳ Motivos de citación`), mirroring the existing `admin:courses` /
  `admin:years` / `admin:permissions` entries.

- [x] T15 (R3, R10, R11, R15, R17, R18, R19) Verification:
  `pnpm build` (production) exits 0; live backend exercised via curl with
  status `200/201/204/400/404/409` on GET/POST/PUT/DELETE; headless
  Chromium smoke covering the desktop table, mobile cards, the dialog
  (both modes + em-dash placeholder), the confirm-before-delete path, and
  the 409/500 error toasts — screenshots captured at
  `progress/visual_citations_admin_reasons*.png`.