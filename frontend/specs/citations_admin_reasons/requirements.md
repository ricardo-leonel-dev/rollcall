# Requirements — citations_admin_reasons

> Feature 19 — Admin tab: citation reasons (motivos) management.
> Source intent: `state/features/019-citations_admin_reasons.md`. Backend surface:
> GET / POST / PUT / DELETE on `/api/citation-reasons` (already shipped by backend
> feature `citation_reasons_management`).

All requirements are EARS-strict: one verifiable `SHALL` clause per requirement.

---

## R1
The admin tab group SHALL include a `Motivos de citación` tab identified by the query
parameter `tab=citation-reasons`.

## R2
The `Motivos de citación` tab SHALL be gated by the existing `admin` module key — the
same module that currently gates the Usuarios / Cursos / Años lectivos / Permisos /
Importar nómina sub-tabs — so users without that module cannot reach the tab.

## R3
WHEN the user navigates to `/admin` with `tab=citation-reasons`, the system SHALL
issue `GET /api/citation-reasons` for the active institution and render the returned
rows in the tab body.

## R4
Each rendered row SHALL display `name`, a severity badge, and `description`.

## R5
The severity badge SHALL apply one of three CSS classes — `badge-J`, `badge-AT`,
`badge-F` — corresponding to the `low`, `medium`, `high` severity levels respectively.

## R6
The severity badge SHALL render the Spanish label — `Bajo`, `Medio`, `Alto` —
corresponding to the `low`, `medium`, `high` severity levels respectively.

## R7
WHEN a row's `description` is `null` or an empty string, the system SHALL render the
em-dash glyph `—` in both the desktop table cell and the mobile card body.

## R8
The tab body SHALL display an `Agregar motivo` primary button in the top-right
corner that opens the citation-reason create dialog.

## R9
WHEN the user clicks the edit icon on an existing row, the system SHALL open the
same citation-reason dialog in `mode: 'edit'` with the row's `name`, `severity`, and
`description` pre-populated.

## R10
WHEN the user submits the dialog in `create` mode, the system SHALL issue `POST
/api/citation-reasons` with a JSON body of `{ name, severity, description }`.

## R11
WHEN the user submits the dialog in `edit` mode, the system SHALL issue `PUT
/api/citation-reasons/:id` with a JSON body of `{ name, severity, description }`.

## R12
The wire payload's `severity` value SHALL be one of the English keys `low`,
`medium`, `high` — never the Spanish display labels.

## R13
The dialog's name input SHALL enforce `maxlength="150"` and the Save button SHALL be
disabled while `name.trim()` is empty or while `name.trim().length > 150`.

## R14
The dialog SHALL send `description: null` to the backend when the trimmed description
is empty, and SHALL send the trimmed string otherwise (never an empty string).

## R15
IF the backend returns a non-2xx response to the dialog's POST or PUT, the system
SHALL display the error message via `NotificationService.error` and SHALL keep the
dialog open so the user can correct the input.

## R16
WHEN a create or edit succeeds, the system SHALL close the dialog, display a success
toast (`Motivo creado` / `Motivo actualizado`), and reload the citation-reasons
list.

## R17
WHEN the user clicks the delete icon on an existing row, the system SHALL open
`ConfirmDialogComponent` with the title `Eliminar motivo de citación` and the body
`¿Eliminar este motivo de citación? Esta acción no se puede deshacer.`

## R18
WHEN the user confirms the delete dialog, the system SHALL issue `DELETE
/api/citation-reasons/:id`; IF the call fails, the system SHALL surface the error
message via `NotificationService.error` and SHALL NOT reload the list.

## R19
After a successful create, edit, or delete, the system SHALL call `loadAll()` so
that soft-deleted rows (backend sets `deletedAt`) disappear from the rendered list
on the next paint.

## R20
`frontend/src/app/core/nav-items.ts` SHALL include a subnav row under the
`Administración` section with `label: 'Motivos de citación'`, `icon: 'rule'`,
`moduleKey: 'admin'`, and `queryParams: { tab: 'citation-reasons' }` — placed
between the `Permisos` and `Importar nómina` rows.

## R21
`frontend/src/app/core/nav-items.ts` SHALL include `admin:citation-reasons` in both
the `MODULE_TREE` children (under the `admin` node, between `admin:permissions` and
`admin:roster`) and the `MODULE_KEYS` flat list (with label `↳ Motivos de citación`).

## R22
`frontend/src/app/shared/utils/citation-reason.util.ts` SHALL export
`CITATION_REASON_SEVERITY_OPTIONS` — a `readonly` array of
`{ value: 'low' | 'medium' | 'high', label: 'Bajo' | 'Medio' | 'Alto', badgeClass:
'badge-J' | 'badge-AT' | 'badge-F' }` — and a
`citationReasonSeverityBadgeClass(severity: string): string` helper that returns
the matching badge class for known values and the fallback `badge-gray` for any
unknown value.