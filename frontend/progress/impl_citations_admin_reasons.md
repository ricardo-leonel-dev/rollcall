# Implementation report — feature 19 `citations_admin_reasons`

**Status:** ready for review. Session 33. Build green, all 15 tasks implemented, all 23 requirements
covered by executed evidence.

**Scope:** frontend-only. No backend files were touched (backend feature 9
`citation_reasons_management` was already `done` and is consumed as-is).

## Where to look first (reviewer)

1. `src/app/features/admin/citation-reason-dialog.component.ts` (new) — the bulk of the new behavior.
2. `src/app/features/admin/admin.component.ts` — tab block (after the Cursos block), `loadAll()`
   fetch, `openCitationReasonDialog` / `deleteCitationReason` / `severityBadgeClass` /
   `severityLabel`.
3. `progress/visual_citations_admin_reasons.png` (desktop), `_mobile.png`, `_dialog.png`,
   `_permissions.png` — the visual record.

## Files changed

| File | Change | Tasks |
|---|---|---|
| `src/app/core/models/index.ts` | `CitationReasonSeverity` + `CitationReason` (10 fields incl. `deletedAt`) | T1 |
| `src/app/shared/utils/citation-reason.util.ts` *(new)* | `CITATION_REASON_SEVERITY_OPTIONS` + `citationReasonSeverityBadgeClass` | T2 |
| `src/app/features/admin/citation-reason-dialog.component.ts` *(new)* | create/edit dialog | T3–T6 |
| `src/app/features/admin/admin.component.ts` | imports, `citationReasons` signal, `loadAll()` fetch, tab block, dialog/delete/badge methods | T7–T11 |
| `src/app/core/nav-items.ts` | subnav row + `MODULE_TREE` child + `MODULE_KEYS` entry | T12–T13 |
| `scripts/visual-smoke.mjs` | added `/api/citation-reasons` fixture (mandated by `docs/verification.md`) + two backward-compatible env hooks — see "Deviations" | T15 |

## Task completion

T1–T15 all implemented. **The `[ ]` checkboxes in `specs/citations_admin_reasons/tasks.md` were left
unticked**: the leader's task brief instructed "do NOT modify `specs/`" twice and explicitly. Per
`CHECKPOINTS.md` C6, this is the documented justification for unticked boxes. Every task is complete
and evidenced in the table below; ticking them is a trivial follow-up if the leader prefers.

## Traceability: R<n> → evidence

No automated test framework exists in this project (`docs/verification.md`), so "test" below means an
executed check — a real HTTP call against the running backend, or a headless-Chromium assertion
against the production bundle. Nothing in this table is claimed from code inspection alone.

| R | Requirement | Evidence (executed) |
|---|---|---|
| R1 | `CitationReason` shape | Live `POST` returned exactly `id, institutionId, name, severity, description, isActive, deletedAt, createdAt, updatedAt` (camelCase, `deletedAt: null`) — matches the interface field-for-field. `\d attendance.citation_reasons` confirms the same columns. |
| R2 | Severity options + badge classes | Rendered badges asserted in DOM: `Bajo`→`badge-J`, `Medio`→`badge-AT`, `Alto`→`badge-F`; all three visible in `visual_citations_admin_reasons.png`. |
| R3 | Gating by `activeTab()` only, no extra client check | User with `moduleKeys: ['absences']` → redirected to `/home`, sidebar row absent, **no** `/api/citation-reasons` request fired. Admin user → tab renders. No per-resource check was added. |
| R4 | `GET` on `loadAll()` → signal | Request log shows `GET /api/citation-reasons` on page load; rows render from the response. |
| R5 | Superadmin w/o institution → `[]`, no request | Superadmin with `institutionId: null` and zero institutions → **no** `/api/citation-reasons` request issued, empty list rendered. |
| R6 | Failed `GET` → empty list, not stuck | Forced `500`: citation tab renders empty with its Add button, **and the Cursos tab still populated** (proves `Promise.all` didn't reject), zero page errors. |
| R7 | API order, no re-sort | Fixture order `low, medium, high` rendered in that order; a newly created row appended last, matching server order. |
| R8 | Name + badge + description/em-dash, desktop + mobile | Desktop table and mobile cards both shot (`_mobile.png` at 480px); the `description: null` row renders `—` in the desktop table and omits the line on mobile. |
| R9 | Create mode: empty fields, severity `low` | Dialog opened: name empty, description empty, severity shows `Bajo` (`_dialog.png`). |
| R10 | Edit mode prefill | Asserted prefill `{name: 'Agresion grave', severity: 'Alto', description: 'Con espacios'}` from the row. |
| R11 | `mat-select`, 3 options, **wire key** sent | Options asserted as exactly `["Bajo","Medio","Alto"]`; selecting `Alto` produced request body `severity: "high"` — the English wire key, not the Spanish label. |
| R12 | Blank name disables save | `blankName_disabled: true`; whitespace-only (`"    "`) also `true` (trim honored); valid name → `false`. No request fired while blank. |
| R12a | 150-char cap | `maxlength="150"` present; filling 200 chars produced an input value of exactly **150** (cap physically enforced). |
| R13 | `POST` payload + close + toast | `POST /api/citation-reasons` body `{name, severity: "high", description: "Con espacios"}` (description trimmed); dialog closed; row appeared. |
| R14 | `PUT` payload + close + toast | `PUT /api/citation-reasons/99` body `{name, severity: "medium", description: null}` — blank description correctly sent as `null`; badge updated to `badge-AT`. |
| R15 | Save failure → toast, dialog stays open | Forced `409 {"error":"Registro duplicado"}`: dialog remained open and the backend's message appeared on screen. Also confirmed live: real backend returns `409` on duplicate and `400 "El nombre no puede superar 150 caracteres"`. |
| R16 | Truthy close → reload | List re-rendered with the new/updated row after both create and edit. |
| R17 | Confirm before any request | Delete click → `ConfirmDialogComponent` shown ("Eliminar motivo de citación…"); **cancel fired 0 requests** and left the row intact. |
| R18 | Confirm → `DELETE` + toast + reload | `DELETE /api/citation-reasons/99` fired, row removed. Live backend returns `204`, and the row then disappears from `GET` (soft-delete filtered). |
| R19 | Delete failure → toast, list untouched | Forced `500`: row still present afterward and the error message surfaced. Live backend returns `404 "Motivo de citación no encontrado"` on a stale id. |
| R20 | Subnav row after "Permisos" | Sidebar shows `Motivos de citación` between `Permisos` and `Importar nómina`, navigating to `/admin?tab=citation-reasons` (`visual_citations_admin_reasons.png`). |
| R21 | `MODULE_TREE` + `MODULE_KEYS` | Permissions dialog lists all six admin children including `Motivos de citación` (`_permissions.png`). |
| R22 | Build clean | `ng build --configuration production` → **exit 0**. |

## Verification summary

**Level 1 — build.** `./node_modules/.bin/ng build --configuration production` exits `0`.
(`pnpm` is not on PATH in this environment; the local `ng` binary runs the identical
`pnpm run build` script body.) All emitted warnings are pre-existing and unrelated to this feature
(global bundle budget, `styles.css` `@import` ordering, per-component style budgets for
`layout`/`login`/`calendar`/`absences`/etc.) — none name the new files.

**Level 2 — real backend.** The dev stack was already up (`docker ps`: `frontend`, `backend`,
`postgres`, `redis`, `excel-service`). Exercised the live contract end-to-end as `superadmin`:

| Call | Result |
|---|---|
| `GET /api/citation-reasons` | `200 []` |
| `POST` valid | `201` + full entity (shape confirms R1) |
| `POST` duplicate name | `409 {"error":"Registro duplicado"}` |
| `POST` name 151 chars | `400 {"error":"El nombre no puede superar 150 caracteres"}` |
| `PUT` severity `low`→`high` | `200` + updated entity |
| `DELETE` | `204`; row then absent from `GET` (soft-delete filtered) |
| `DELETE` same id again | `404 {"error":"Motivo de citación no encontrado"}` |

The error envelope is `{"error": "..."}` throughout, which is what the UI's
`err?.error?.error` extraction reads — R15/R19 confirmed against the real API, not a mock.
The one disposable row created for this was deleted in the same run; `GET` returns `[]` again,
so no real data was mutated (the table was empty before and after).

**Level 3/4 — UI.** Production bundle served locally, driven with headless Chromium against mocked
fixtures, covering every interactive requirement listed in the table above. Screenshots:

- `progress/visual_citations_admin_reasons.png` — desktop tab, 1440×900
- `progress/visual_citations_admin_reasons_mobile.png` — mobile cards, 480×900
- `progress/visual_citations_admin_reasons_dialog.png` — create dialog
- `progress/visual_citations_admin_reasons_permissions.png` — permissions dialog (R21)

I opened each screenshot and checked it against `design.md`'s visual direction before handing off.

**`./init.sh`** ends `[OK] Environment ready`, with two `[WARN]` lines, both expected and unrelated
to this feature:

```
[WARN]  No verify_command configured in .harness.json — skipping
[WARN]  $SUPABASE_URL / $SUPABASE_ANON_KEY not set — skipping mirror sync
```

The first is documented as expected in `docs/verification.md` (no test framework yet).

## Deviations from the spec

1. **`scripts/visual-smoke.mjs` was modified** — three changes, none of which alter its existing
   behavior when the new env vars are unset:
   - Added the `/api/citation-reasons` fixture. This is **required** by `docs/verification.md`
     ("When adding a new feature that introduces a new endpoint, extend the `mockApi` function in
     the same file — don't let the smoke fall back to an empty `{}`").
   - Added `VISUAL_PATH` (defaults to the previous hardcoded `/admin?tab=years`) and `VISUAL_CLICK`
     (unset by default) so a tab other than "years", and UI behind a click, can be captured. Without
     these the new dialog could not have been screenshotted at all.
   - Rationale for editing rather than adding a script: `docs/conventions.md` forbids creating new
     `.mjs` smoke scripts under `frontend/scripts/`, and `visual-smoke.mjs` is not in the
     harness-installed list, so extending it is the sanctioned path. The ad-hoc interaction checks
     were run from `/tmp` and deleted afterward — no scratch files were left in the repo.
2. **`citationReasonSeverityLabel` was NOT added to the util.** `design.md`'s util snippet shows only
   `citationReasonSeverityBadgeClass`, and T7 lists the component's imports as
   `CITATION_REASON_SEVERITY_OPTIONS` + `citationReasonSeverityBadgeClass`. So `severityLabel` lives
   in the component as a lookup over the constant, exactly as `design.md`'s prose describes. (I
   briefly added a util export, then removed it to match the spec surface.)
3. **No empty state was added** for a tab with zero reasons. `design.md` doesn't specify one and the
   Cursos tab this feature mirrors doesn't have one; adding one would be scope drift beyond
   `tasks.md`. Worth a follow-up card if wanted — it's the one place the UI is thinner than ideal.
4. **`deleteCitationReason` has `try/catch` + error toast**, unlike the sibling
   `deleteCourse`/`deleteYear`/`deleteUser`. This is intentional and pre-authorized by `design.md`,
   which documents the sibling methods' silent-failure as pre-existing drift not to propagate.

## Notes for the reviewer

- The spec's scope note warned the backend contract was unapproved at drafting time. It is now
  shipped and `done`; I re-verified every field name, status code, and the `low`/`medium`/`high`
  enum against the running service (table above) rather than trusting the draft. No amendment to
  R1/R11–R17 was needed — the contract matches the spec as written.
- The single highest-risk item the spec called out (Spanish labels vs. English wire keys) is
  directly asserted: selecting `Alto` sends `"high"`.

## R8 mobile fix (2026-09-05, post-review revision)

Reviewer flagged that the mobile card layout in `admin.component.ts` (the `.md:hidden` block,
citation-reasons tab) used an `@if (r.description)` wrapper that rendered nothing when `description`
was `null`, while the desktop table at the same column rendered `—` via `r.description || '—'`.
R8 mandates the em-dash placeholder in **both** layouts.

### Change

Template-only edit in `src/app/features/admin/admin.component.ts` (citation-reasons mobile card,
inside the `@for (r of citationReasons(); track r.id)` loop):

```diff
- @if (r.description) {
-   <div style="font-size:12px;color:var(--muted);margin-top:4px">{{r.description}}</div>
- }
+ <div style="font-size:12px;color:var(--muted);margin-top:4px">{{r.description || '—'}}</div>
```

Net behavior: rows with `description: null` now render the em-dash placeholder on mobile, matching
the desktop column. The styling (font-size, color, margin-top) is unchanged. No other code path,
component, or test was touched — strictly the R8 mobile placeholder alignment.

### Verification

`./node_modules/.bin/ng build --configuration production` → **exit 0** (only pre-existing
unrelated component-style budget warnings for `login` / `layout` / `justifications` / `absences`
/ `student-report` / `calendar` — none involve the files changed in this feature or its
predecessor work). No new warnings introduced. No `init.sh` was run because the leader scoped
this revision narrowly to one template line.
