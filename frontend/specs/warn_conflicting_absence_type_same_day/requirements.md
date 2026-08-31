# Requirements — Warn when an absence type conflicts with one already registered for the same day

Scope: frontend-only (`attendance_frontend`). One feature file is affected
(`src/app/features/absences/absences.component.ts`), with three flow call-sites unified through
the same conflict-aware feedback: `saveAbsenceRange` (lines 917–938), `confirmPhotoAbsences`
(lines 867–896), and `confirmVoiceAbsence` (lines 1061–1088). The backend already ships the
contract this feature relies on (`POST /api/absences` now returns `{ created, skipped,
skippedDetails: Array<{ date: string; existingType: 'F' | 'AT'; conflict: boolean }> }` —
backend feature `report_conflicting_absence_type_on_create`, merged at commit `ae9a7e5`); no
backend or `excel-service` change is in scope.

Acceptance-criterion mapping (every bullet from the harness feature description —
`state/features/012-warn_conflicting_absence_type_same_day.md` — is satisfied by at least one `R<n>`
below; every `R<n>` cites the bullet it satisfies):

- AC1: "Cuando todas las fechas omitidas son por conflicto de tipo distinto, se muestra un mensaje
  claro listando esas fechas y el tipo ya registrado, indicando que hay que eliminarlo primero"
  → **R1, R6, R7, R8**
- AC2: "Cuando la fecha omitida es por el mismo tipo (idempotente), se conserva el mensaje actual sin
  alarmar al usuario" → **R2, R9**
- AC3: "Si hay una mezcla de creadas + conflictos + idempotentes en el mismo request, el mensaje
  refleja los tres grupos sin perder información" → **R3, R10**
- AC4: "El botón/acción de WhatsApp existente (link, dateLabel) sigue funcionando igual para las
  fechas que sí se crearon" → **R4, R11**
- Build & verification (implicit in every feature, same convention as `require_full_dates_on_quarters`
  R8/R9) → **R13**
- Cross-flow consistency: Photo (`confirmPhotoAbsences`) and Voice (`confirmVoiceAbsence`)
  adopt the same R3 partitioning + R6/R10 dialog → **R12, R14, R15**
- Highlight visual on Listado after dialog closes with conflicts → **R16**

## Response contract

## R1 [AC1]
WHEN the client receives the response of `POST /api/absences` from `saveAbsenceRange()`, the system
SHALL treat the response as `{ created: number; skipped: number; skippedDetails: Array<{ date: string;
existingType: 'F' | 'AT'; conflict: boolean }> }` — exactly the type the backend ships today
(verified against the live file at `backend/src/services/absence.service.ts` post-commit `ae9a7e5`) —
and SHALL NOT assume the response is the legacy `{ created; skipped }` only. The `http.post<...>()`
generic on line 919 of `absences.component.ts` SHALL be widened to that three-field shape.

## R2 [AC2]
WHEN every entry of `skippedDetails` has `conflict === false`, the system SHALL treat the response as
the "all-idempotent" case and SHALL preserve today's behaviour verbatim: a single success toast of the
form `"<created> registro(s) creado(s), <skipped> ya existían"` (or the no-skipped variant `"<created>
registro(s) creado(s)"` when `skipped === 0`), with the WhatsApp action attached to that toast only
when `created > 0 && whatsappLink` is truthy — identical to lines 923–933 today. No dialog SHALL be
opened in this case.

## Partitioning

## R3 [AC3]
WHEN `saveAbsenceRange()` parses the response, the system SHALL compute, in order, three arrays:

1. `created` — implicitly represented by the response `created` count (no per-date list is shipped by
   the backend; the date range is what the user originally selected, so the created dates are
   `<dateFrom>..<dateTo>` minus the dates in `skippedDetails`).
2. `conflicts` — the subset of `skippedDetails` whose `conflict === true`, ordered ascending by
   `date` (the backend already returns `skippedDetails` sorted ascending; the system SHALL rely on
   this ordering without re-sorting, matching how `absences.service.ts`'s `findAll` is consumed
   without further ordering on the frontend).
3. `idempotents` — the subset of `skippedDetails` whose `conflict === false`, ordered ascending by
   `date`.

## R4 [AC4]
WHILE constructing the WhatsApp message for the post-save action, the system SHALL continue to use
`dateLabel` built from `f.dateFrom` / `f.dateTo` exactly as today (`f.dateFrom === f.dateTo ?
f.dateFrom : \`${f.dateFrom} al ${f.dateTo}\``, line 927) — and SHALL keep calling
`notifyGuardian(link, enrollment.fullName, dateLabel, type, enrollment.course)` (line 932) with the
same arguments. The change in surface (toast → dialog) does NOT change the WhatsApp call site: the
dialog's WhatsApp action runs the same function with the same arguments.

## Scenarios

## R5 (new, derived from description)
WHEN `conflicts.length === 0`, `idempotents.length === 0`, and `created > 0`, the system SHALL show
exactly today's success toast (no dialog) — preserving AC2 and the "happy path" UX for the no-conflict
case.

## R6 [AC1]
WHEN `conflicts.length > 0`, `created === 0`, and `idempotents.length === 0` (the "all-conflict"
case), the system SHALL open a single Material dialog (via `MatDialog`, the same injector used at
line 661) whose body lists every conflicting date with its `existingType` translated through the
existing `typeLabel()` helper (line 904: `'F' → 'Falta'`, `'AT' → 'Atrasado'`), and SHALL include an
explanatory line telling the user they must delete the existing absence on that date first before they
can register the other type. The system SHALL NOT show a success toast in this case (no dates were
created).

## R7 [AC1]
WHILE rendering the all-conflict dialog, the system SHALL render the explanatory line so it reads
(verbatim, Spanish neutral per `feedback_spanish_neutral.md`): "Elimina primero la inasistencia
existente en esa fecha para poder registrar la otra." — no soft phrasing, no alarms, no icons beyond
the dialog's own chrome.

## R8 [AC1]
WHEN the all-conflict dialog lists the conflicting dates, the system SHALL format each `date` (an
ISO `YYYY-MM-DD` string from the backend) using the existing `dateToDateString` utility from
`src/app/shared/utils/date.util.ts` (already imported on line 18 of `absences.component.ts` and used
in `loadAbsences`/`loadTodayAbsences`) — never the raw ISO string. The list SHALL be ascending by
`date` (R3 ordering) and SHALL render each row as `<formatted-date> — ya registrado como <typeLabel
(existingType)>`.

## R9 [AC2]
WHEN `conflicts.length === 0` (so neither R6 nor R10 applies), the system SHALL preserve today's
behaviour — R2's toast for the all-idempotent case, R5's toast for the all-created case — without
ever opening a result dialog and without surfacing `idempotents` count separately.

## R10 [AC3]
WHEN `conflicts.length > 0` AND (`created > 0` OR `idempotents.length > 0`) (the "mixed" case), the
system SHALL open a single Material dialog (same injector, same chrome style as R6) whose body has
three labelled sections, in this order, no section dropped:

1. **Creadas** — `<created>` formatted with the date range label from `f.dateFrom`/`f.dateTo` (R4),
   followed by a bullet list of the actual created dates (each formatted via `dateToDateString` per
   R8) — derived as `<dateFrom>..<dateTo>` minus `skippedDetails.map(s => s.date)`, ascending.
2. **Conflictos** — every entry from `conflicts` formatted exactly per R8's `<date> — ya registrado
   como <typeLabel>` pattern, plus the R7 explanatory line at the bottom of the section.
3. **Idempotentes** — `<idempotents.length> ya estaban registradas con el mismo tipo` plus an
   optional collapsed bullet list of dates (the implementer SHALL decide per R13 whether to render
   the full date list here or only the count; either choice is acceptable, but the count alone is
   sufficient for AC3, which requires the group to be reflected, not every individual date).

The dialog SHALL be the only feedback surface in this case — no success toast, no warning toast.

## R11 [AC4]
WHEN the mixed-case dialog (R10) is open AND `created > 0` AND `enrollment.whatsappLink` is truthy,
the system SHALL render a "Enviar WhatsApp" action button in the dialog header (or footer, same
visual treatment as `ToastComponent`'s action button — `docs/conventions.md` says templates are
inline, so this SHALL be inline in the new dialog component) that, on click, calls
`notifyGuardian(link, enrollment.fullName, dateLabel, type, enrollment.course)` with the arguments
defined in R4 and closes the dialog. WHEN `created === 0` OR `whatsappLink` is falsy, the dialog
SHALL NOT expose a WhatsApp action.

## Scope

## R12 (cross-flow consistency)
WHEN any of the three flows `saveAbsenceRange()`, `confirmPhotoAbsences()`, or
`confirmVoiceAbsence()` calls `POST /api/absences` and receives the response, the system SHALL
apply the same R3 partitioning (compute `conflicts` and `idempotents` from
`response.skippedDetails`) and the same scenario branching (R5/R6/R9/R10) before opening feedback.
The flow's own pre-existing UX surface (photo preview with selectable matches in
`confirmPhotoAbsences`; voice transcript with confidence in `confirmVoiceAbsence`) is preserved
— only the post-save feedback surface is unified through `AbsenceSaveResultDialogComponent` when
`conflicts.length > 0`.

## Build & verification

## R13 (build & manual smoke across all three flows)
The implementer SHALL run `pnpm run build` (or `./node_modules/.bin/tsc` if `pnpm` is not on PATH,
as documented in `progress/impl_api_configure_academic_quarters_trimestres_per_academic_year.md`'s
"Verification" section) and confirm it exits 0, since `tsconfig.json` is `strict: true` and the
widened response type on R1 will be checked end-to-end. Per `docs/conventions.md` "Tests", this
project has no automated test suite — verification SHALL be manual against the running stack
(`docker compose up -d --build backend`), covering each of the three flows independently:
1. Manual (`saveAbsenceRange`): the 4 scenarios in T12.
2. Photo (`confirmPhotoAbsences`): the same 4 scenarios plus the photo-preview UX remains intact.
3. Voice (`confirmVoiceAbsence`): the same 4 scenarios plus the voice-transcript UX remains intact.

## R14 (Photo flow wiring)
WHEN `confirmPhotoAbsences()` (lines 867–896) completes the `POST /api/absences` and receives the
response, the system SHALL apply R12 (partition + branch) and open
`AbsenceSaveResultDialogComponent` whenever `conflicts.length > 0` (R6/R10). The dialog's
WhatsApp header action SHALL fire using the photo flow's own enrollment context (the student
that was confirmed in the preview), not the manual save's `enrollment`. The photo preview UI
(selectable matches, confidence percentages) is preserved unchanged.

## R15 (Voice flow wiring)
WHEN `confirmVoiceAbsence()` (lines 1061–1088) completes the `POST /api/absences` and receives
the response, the system SHALL apply R12 (partition + branch) and open
`AbsenceSaveResultDialogComponent` whenever `conflicts.length > 0` (R6/R10). The dialog's
WhatsApp header action SHALL fire using the voice flow's own enrollment context. The voice
transcript UX (confidence display, "confirmar" button) is preserved unchanged.

## R16 (Listado highlight after conflict dialog closes)
WHEN the user closes `AbsenceSaveResultDialogComponent` after at least one conflict was shown
AND the parent flow is one of `saveAbsenceRange` / `confirmPhotoAbsences` /
`confirmVoiceAbsence`, the system SHALL apply a transient visual highlight (CSS class +
`scrollIntoView`) to the row in the Listado tab that corresponds to each conflicting date. The
highlight SHALL auto-clear after a few seconds (T11 specifies the duration) and SHALL NOT mutate
data — it is a purely visual cue pointing the user to the existing absence they need to delete
before re-saving. WHEN no conflicts were shown (idempotent-only or all-created flows), no
highlight is applied.
