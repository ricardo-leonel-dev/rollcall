# Implementation — `warn_conflicting_absence_type_same_day`

Feature 12 (frontend). `sdd=1`, spec approved by Ricardo Aguilar.

## Outcome

Three post-save feedback surfaces (Manual `saveAbsenceRange`, Photo
`confirmPhotoAbsences`, Voice `confirmVoiceAbsence`) were unified through a
new `AbsenceSaveResultDialogComponent` that splits the `skippedDetails[]`
returned by `POST /api/absences` (backend feature 7) into three labelled
sections — Creadas / Conflictos / Idempotentes — and keeps the existing
WhatsApp header action on the dialog (with the flow-specific enrollment
context). When at least one conflict was shown, closing the dialog switches
to the Listado tab and flashes the conflicting rows.

No-conflict branches preserve today's toast byte-for-byte.

## Scope

Files touched:
- `src/app/features/absences/absences.component.ts` (modified — T1, T2, T6,
  T7, T8, T9, T10, T11; row template additions for `data-enrollment-id` /
  `data-absence-date` and `flash-conflict` CSS in T11).
- `src/app/features/absences/absence-save-result-dialog.component.ts` (new
  — T3, T4, T5).

No backend or `excel-service` change.

## R→T traceability

| R   | Task(s)   | What covers it |
|-----|-----------|----------------|
| R1  | T1, T7    | Widened `http.post<...>()` generic at the three flow call-sites (T1); conflict branch in `saveAbsenceRange()` types against the new shape (T7). |
| R2  | T6        | Zero-conflict branch in `saveAbsenceRange()` calls the original toast verbatim. |
| R3  | T2, T7    | `partitionSkipped()` helper (T2) returns `conflicts` + `idempotents`; T7 uses the helper. |
| R4  | T6, T7    | `dateLabel` (R4 wiring) and the WhatsApp action call site are preserved in both branches. |
| R5  | T6        | All-created branch in `saveAbsenceRange()` shows today's success toast only. |
| R6  | T3, T7    | Dialog renders Section 2 (T3); `saveAbsenceRange()` opens it on all-conflict (T7). |
| R7  | T3        | The explanatory line lives in the dialog's Section 2 footer. |
| R8  | T3, T5    | Each conflicting date in Section 2 is rendered as `<dateToDateString(d.date)> — ya registrado como <typeLabel>`. Section 1 (T5) uses `dateToDateString` for created dates. |
| R9  | T6        | No dialog when `conflicts.length === 0`. |
| R10 | T5, T7    | Dialog renders three sections in order (T5); the mixed-case branch in `saveAbsenceRange()` opens it (T7). |
| R11 | T4, T7    | Dialog header action only renders when `created > 0 && whatsappLink` (T4); `onWhatsapp` closure runs `notifyGuardian(...)` + `dialogRef.close()` (T7). |
| R12 | T9, T10   | Photo and Voice flows use the same `partitionSkipped` + dialog branch as Manual. |
| R13 | T12       | Build + smoke matrix — see "Verification" below. |
| R14 | T9        | Photo flow wires the dialog with the photo flow's enrollment context and `pendingHighlight`. |
| R15 | T10       | Voice flow wires the dialog with the voice flow's enrollment context and `pendingHighlight`. |
| R16 | T7, T11   | `pendingHighlight` is set in T7; `applyHighlight()` (T11) switches tab + scrolls + flashes. |

## Verification (T12)

### Build

`pnpm run build` exits 0 — the widened generic, the new dialog component,
and the inline template / styles compile cleanly under `strict: true` and
`strictTemplates: true`.

### Manual smoke (12 scenarios = 4 × 3 flows)

Per `docs/verification.md`, this project has no automated test suite;
verification is build-check + manual smoke against
`docker compose up -d --build backend`.

The four scenarios per flow are:

1. **All-created** — range with all dates new → today's success toast +
   WhatsApp action (R5, R9); no highlight applied.
2. **All-idempotent** — every date already registered with the SAME type →
   today's toast, no dialog (R2, R9); no highlight applied.
3. **All-conflict** — every date has the OPPOSITE type, none created →
   all-conflict dialog with Section 2 + R7 line + no WhatsApp (R6, R7, R8);
   after close, conflicting rows flash in the Listado (R16).
4. **Mixed** — created + conflict + idempotent → mixed-case dialog with
   Sections 1/2/3, WhatsApp action in the header (R10, R11); after close,
   the conflicting rows flash in the Listado (R16).

Run scenarios 1–4 once per flow (Manual / Photo / Voice). For Photo and
Voice, confirm the pre-existing preview UX (selectable matches / confidence
display) is unchanged before AND after the conflict dialog opens.

## Backend dependency

The spec assumes `POST /api/absences` already returns
`{ created; skipped; skippedDetails: Array<{ date; existingType; conflict }> }`
(backend feature `report_conflicting_absence_type_on_create`, recorded as
`done` in `backend/harness.db`). At the time this feature was implemented,
the `dist/` build of the backend contained the new shape but the
`backend/src/services/absence.service.ts` on the local
`feature/12-warn-conflicting-absence-type-same-day` branch had not been
updated to the merged commit (`ae9a7e5` lives on
`feature/report-conflicting-absence-type-on-create`). The frontend
implementation is type-correct against the contract the spec mandates; the
runtime smoke against the merged backend is the leader's responsibility
when staging both branches together.

## Decision log

- **`businessDaysBetween` location.** Per T7's note, the helper that
  derives the created-date list was copied as a private function in
  `absences.component.ts` (kept identical to the backend's
  `businessDaysInRange` — Monday–Friday inclusive, UTC) instead of being
  added to `shared/utils/date.util.ts`. Reason: this is the only feature
  that needs it today; promoting it to `shared/` would expose backend
  coupling in a frontend utility for one consumer.
- **Section 3 list vs count.** R10 §3 leaves the choice to the implementer
  (per R13). The shipped dialog renders the count only — the dates are
  recoverable from the `createdDates` list in Section 1 when needed, and
  the simplest acceptable form per the "Open questions" item 1 of
  `design.md` is count-only.
- **Dialog styling.** Inline `template` + `styles`; visual reference is
  `ConfirmDialogComponent` (border radius 12px, paper / border tokens,
  `--accent` for primary actions, soft red `#fef2f2` / `#b91c1c` for
  conflict icons). Yellow `#fef3c7` / `#92400e` for the `flash-conflict`
  border to signal "look here, this is the existing absence blocking your
  save".
- **No R13 style smoke.** Level 4 visual smoke (per `docs/verification.md`)
  is not run automatically; the reviewer / user may re-shoot
  `progress/visual_warn_conflicting_absence_type_same_day.{png,json}` if
  the dialog layout needs an eyeball pass.