# Requirements — Require full dates on quarters

Scope: frontend-only (`asistencia-frontend`), one file:
`src/app/features/admin/quarters-dialog.component.ts` (the same dialog rewritten by the sibling
feature `flexible_quarter_admin_ui` — see
`specs/flexible_quarter_admin_ui/{requirements,design}.md` for the full pre-existing
`validationErrors()`/`isValid()`/`onDraftFieldChange()` reactive model this feature extends, not
replaces).

The user decided an "open-ended" period (missing `startDate` and/or `endDate`) is no longer a
valid state to save. Backend enforcement of the same rule shipped first (see
`backend/state/features/005-backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados.md`
in the sibling backend repo — the backend's `POST /api/quarters` and `PUT /api/quarters/:id` now
reject partial-date bodies with HTTP 400 and the Spanish message
`El período debe tener fecha de inicio y fecha de fin.`; historical null-dated rows were
soft-deleted by migration `postgres/19_quarters_softdelete_legacy_null_dates.sql`). This feature
adds the matching **client-side** required-dates check to the dialog so the user sees the error
inline **before** hitting the wire, using the exact same inline-error mechanism already used for
the empty-name check. The dialog's error string in R1 below is therefore a **second source of the
same message** as the backend's HTTP 400 body — they must stay byte-for-byte identical (see T8).
No server-error fallback for "missing dates" is required in the dialog: the backend never produces
a different string for that case, and the client-side check fires first anyway.

Acceptance-criterion mapping (every bullet from the feature description is satisfied by at least
one `R<n>` below; every `R<n>` below cites the acceptance bullet it satisfies):

- A1: "A draft (new or existing) with `startDate` or `endDate` empty shows an inline error and
  keeps 'Guardar períodos' disabled" → **R1, R2, R3**
- A2: "The error clears as soon as the missing date is filled in (same reactivity already fixed
  for the rest of `validationErrors()`)" → **R4**
- A3: "Already-persisted quarters with incomplete dates can be opened and edited in the dialog
  without crashing; saving requires completing them first" → **R5, R6, R7**
  *(scope narrowed in 2026-08-29 re-amend: the only null-dated rows reachable in production are
  the 3 quarters `seedQuarters()` inserts for a freshly-created academic year —
  `isActive && sequenceNumber in {1, 2, 3} && !startDate && !endDate`; historical legacy rows
  were soft-deleted by migration 19)*
- A4: "`pnpm run build` returns 0 with no new warnings" → **R8**
- A5: "Manual smoke test documented, same as T17 of `flexible_quarter_admin_ui`" → **R9**

## Validation

## R1 [A1]
WHEN `validationErrors()` evaluates a draft that is not marked `deleted` and whose `name` has
already passed the existing empty-name and length checks, IF that draft's `startDate` is `null` OR
its `endDate` is `null`, THEN the system SHALL set that draft's error message (keyed by
`draft.localId`, same map used by every other check) to `El período debe tener fecha de inicio y
fecha de fin.` and SHALL skip the remaining checks for that draft (`continue`), matching the
existing "first applicable error wins" pattern used by every other per-row check in this computed.

**Source-of-truth alignment (2026-08-29 re-amend):** the string `El período debe tener fecha de
inicio y fecha de fin.` is **also** the exact body of the HTTP 400 the backend now returns for the
same case (see `backend/src/controllers/quarter.controller.ts:25,31` and
`backend/src/services/quarter.service.ts:57`). It is treated as a single shared user-facing
message between the dialog and the wire — R1, R8 (T8), and any future edit must keep the two copies
identical. If the backend string ever changes, both must change in the same commit, otherwise the
inline error and the backend's 400 body will diverge and the user will see two different messages
for the same condition.

## R2 [A1]
IF a draft is marked `deleted` THEN the system SHALL NOT apply the R1 check to that draft — the
same `if (q.deleted) continue;` guard already skipping every other check at the top of the
`validationErrors()` loop SHALL also skip this one (no separate mechanism).

## R3 [A1]
WHILE any non-deleted draft in `drafts()` has a missing-date error (per R1) or any other existing
validation error, the system SHALL keep the "Guardar períodos" button disabled — the existing
`isValid()` computed (`validationErrors().size === 0`) already implements this gate and requires
no changes; this requirement pins that the new R1 error participates in that same `size` count.

## R4 [A2]
WHEN the user fills in the previously-missing `startDate` or `endDate` on a draft that carried the
R1 error, the system SHALL clear that draft's error entry on the next recompute of
`validationErrors()` — triggered by the existing `onDraftFieldChange(draft)` handler already wired
to `(ngModelChange)` on the date inputs (the `this.drafts.update(list => [...list])` poke), with no
new wiring added for this feature.

## Legacy data

## R5 [A3]
WHEN `QuartersDialogComponent` is opened with `data.existing` containing a quarter whose
`startDate` and/or `endDate` is `null`, the system SHALL build the corresponding draft via the
existing `buildDrafts()`/`dateStringToDate` mapping (`startDate`/`endDate` set to `null`) without
throwing a runtime error. *Scope note (2026-08-29 re-amend):* in production today the only such
rows reachable in the dialog are the 3 quarters `seedQuarters()` (called from
`academic-year.service.ts#create`) inserts for a **freshly-created academic year** — those rows
are persisted with `startDate: null, endDate: null` for `sequenceNumber in {1, 2, 3}`, until the
user opens the dialog and completes them via the datepicker. Historical null-dated rows from
before migration `postgres/19_quarters_softdelete_legacy_null_dates.sql` were soft-deleted
(`deleted_at = NOW()`, `is_active = false`) and therefore no longer surface in `GET /api/quarters`
listings, so they cannot reach the dialog.

## R6 [A3]
WHEN `validationErrors()` computes its initial value for the `drafts()` produced by R5 — i.e.
before any user interaction with the dialog — the system SHALL include the R1 missing-date error
for that legacy draft immediately, since the eager `computed()` already evaluates on the dialog's
first render; the user SHALL see the inline error and a disabled "Guardar períodos" button without
having touched any field first.

## R7 [A3]
IF a draft is missing exactly one date value (a transient state reachable mid-edit, e.g. the user
just cleared a field before retyping it) THEN the system SHALL NOT evaluate the start-before-end,
within-academic-year-range, or pairwise-overlap checks against that draft — the existing `if
(start && end)` guards on those checks (and the `.filter(q => !q.deleted && q.startDate &&
q.endDate)` guard before the overlap pass) remain unchanged and SHALL continue to prevent a
runtime error from calling `.getTime()` on a `null` date during that transient state. This is
intentional defensive code carried over unmodified from `flexible_quarter_admin_ui`, not dead code
introduced or left over by this feature.

## Build & verification

## R8 [A4]
WHEN the implementation is complete, the system SHALL compile under `pnpm run build` with exit
code 0 and SHALL introduce no new build warnings attributable to the modified file (modulo the
pre-existing infra warnings logged by `./init.sh` for an empty `verify_command` and an unset
`SUPABASE_URL`, which are unchanged by this feature).

## R9 [A5]
WHEN the implementation is complete, the system SHALL be verified by the manual smoke test
described in `docs/verification.md` Level 3 against a running stack, covering at minimum: opening
the dialog on a **freshly-created academic year** (whose 3 seeded quarters from
`seedQuarters()` are still null-dated) and confirming the inline R1 error shows immediately on
all 3 rows and the save button is disabled (R6); clearing a date on an otherwise-valid draft and
confirming the error appears and the save button disables (R1, R3); filling the missing date
back in and confirming the error clears and the save button re-enables (R4); and confirming a
normal save (all drafts with both dates) still succeeds unaffected. The result SHALL be documented
in `progress/impl_require_full_dates_on_quarters.md`'s Traceability section, same convention as
T17 of `flexible_quarter_admin_ui`.
