# Design — Warn when an absence type conflicts with one already registered for the same day

## Scope of the change

Frontend-only. One existing file (`src/app/features/absences/absences.component.ts`) is modified
across three flow call-sites; one new file is added.

| File | Change |
|---|---|
| `src/app/features/absences/absences.component.ts` | (1) Widen the `http.post<...>()` generic on line 919 (and the equivalent in the Photo / Voice flows) to the new `{ created; skipped; skippedDetails }` shape (R1). (2) Add `partitionSkipped(response)` helper (R3). (3) Replace the inline toast construction in three flows (`saveAbsenceRange` lines 923–933, `confirmPhotoAbsences` lines 867–896, `confirmVoiceAbsence` lines 1061–1088) with the same scenario branch. (4) Add `pendingHighlight` signal + `applyHighlight()` method (R16). |
| `src/app/features/absences/absence-save-result-dialog.component.ts` (new) | Standalone dialog that renders the three sections defined in R10, the explanatory line from R7, and an optional "Enviar WhatsApp" header action from R11. Inline template + styles, `OnPush`, `inject()` only — same conventions as the rest of this codebase. |

No new service is needed: the dialog receives the parsed inputs as constructor data and uses
`MatDialogRef.close()` only — no outbound HTTP. No new shared component is added under
`shared/` because no other feature uses this surface (per `docs/conventions.md` "Reusability" — this
is a one-off concern, not a generic abstraction).

## Branching logic

The helper `partitionSkipped(...)` lives as a private method on `AbsencesComponent` and is the only
place that knows about the three cases. Each flow calls it identically and then branches:

```
const partition = this.partitionSkipped(response);
if (partition.conflicts.length === 0) {
  // R2 / R5 / R9 — preserved toast, with or without WhatsApp action
  const msg = response.skipped > 0
    ? `${response.created} registro(s) creado(s), ${response.skipped} ya existían`
    : `${response.created} registro(s) creado(s)`;
  this.notify.success(msg, { ...whatsappOpts });  // same options as today
} else {
  // R6 / R10 — result dialog; no toast
  const dialogRef = this.dialog.open(AbsenceSaveResultDialogComponent, {
    width: '480px',
    data: { created, createdDates, conflicts, idempotents, whatsappLink, fullName, dateLabel, type, course, onWhatsapp },
  });
  this.pendingHighlight.set({ enrollmentId, dates: partition.conflicts.map(c => c.date) });
  dialogRef.afterClosed().subscribe(() => this.applyHighlight());
}
```

The Manual flow (`saveAbsenceRange`) then calls `await Promise.all([loadTodayAbsences(),
loadAbsences()])` exactly as today (line 934) regardless of branch — the refresh must happen in
both cases. The Photo and Voice flows have their own existing refresh logic, which the implementer
preserves (the implementer just inserts the branch above the refresh).

## Cross-flow wiring (Photo + Voice)

`confirmPhotoAbsences()` (lines 867–896) and `confirmVoiceAbsence()` (lines 1061–1088) currently
show the same generic toast. After R12 / R14 / R15, they use the same `partitionSkipped` +
`AbsenceSaveResultDialogComponent` branch as Manual, with one important difference: each flow
opens the dialog with its own enrollment context (the student that was confirmed in the photo
preview; the student matched in the voice transcript), so the WhatsApp header action fires the
flow-specific `notifyGuardian(...)` call.

The Photo flow's preview UI (selectable matches, confidence percentages) and the Voice flow's
transcript UI (confidence display, "confirmar" button) are NOT modified — only the post-confirm
feedback is unified.

## Why a dialog, not an enriched toast

`ToastComponent` (`shared/components/toast/toast.component.ts`) is a single-line component: its
template renders `data.message` through a single `<span class="message">` interpolation (line 58),
and the host has no `white-space: pre-wrap` rule, so newlines in the message string do NOT render
as line breaks. Listing more than one conflicting date therefore needs a multi-element surface. The
project already uses `MatDialog` (via `MatDialog` injected on line 661) and `ConfirmDialogComponent`
(`shared/components/confirm-dialog/confirm-dialog.component.ts`) is the established
"explanatory-dialog" pattern — the new dialog lives next to the feature that owns it (per
`docs/architecture.md` §1, "dialogs that only that feature uses" sit inside the feature folder),
not under `shared/`.

## New component contract

`AbsenceSaveResultDialogComponent` is a standalone component with one `MAT_DIALOG_DATA` injection:

```ts
interface AbsenceSaveResultDialogData {
  created: number;
  createdDates: string[];                                            // pre-derived by the parent (T7/T9/T10) so the
                                                                    // dialog never has to recompute business days
  conflicts: Array<{ date: string; existingType: 'F' | 'AT' }>;   // already filtered to conflict === true
  idempotents: number;                                              // count only, per R10 §3
  whatsappLink: string | null;
  fullName: string;
  dateLabel: string;
  type: 'F' | 'AT';
  course: string;
  onWhatsapp: () => void;                                           // invoked by the header action (T4)
}
```

It renders:

- Header: title `"Inasistencias registradas"` with a leading `check_circle` mat-icon (success green).
  When `data.created > 0 && data.whatsappLink`, the existing `WhatsappIconComponent` plus a
  `"Enviar WhatsApp"` label is rendered as a button in the same row, calling `notifyGuardian(...)`
  the same way the toast does today, then closing the dialog via `MatDialogRef.close()`.
- Section 1 (always shown when `created > 0`): `"Creadas (N)"` heading, then `<dateLabel>` line, then
  a `<ul>` of created dates formatted via `dateToDateString`.
- Section 2 (always shown when `conflicts.length > 0`): `"Conflictos (N)"` heading, then a `<ul>` of
  `<dateToDateString(d.date)> — ya registrado como <typeLabel(d.existingType)>` rows, followed by
  the R7 explanatory line in a softer colour.
- Section 3 (always shown when `idempotents > 0`): `"Idempotentes"` heading with the line
  `"<idempotents> ya estaban registradas con el mismo tipo"`. The optional date list from R10 §3 is
  NOT rendered in this draft — R13 leaves that choice to the implementer (acceptable to ship count-only).
- Footer: a single `Cerrar` button (`mat-stroked-button`) bound to `MatDialogRef.close()`. No
  destructive actions, no `confirm` — this is a read-only summary, not a confirmation dialog.

Visual treatment matches the surrounding feature: same `--paper` / `--border` tokens, same border
radius (12px), same padding as `ConfirmDialogComponent` — the implementer reads that file as the
reference style and applies the same shape. Per `docs/architecture.md` "Design Workflow", the
implementer SHALL load the `frontend-design` skill before writing the inline `template:`/`styles:`
blocks.

## Highlight mechanism (R16)

When the dialog closes with `conflicts.length > 0`, the parent flow sets
`pendingHighlight = { enrollmentId, dates: [...] }` before `dialogRef.afterClosed()` fires. The
`afterClosed` subscription calls `applyHighlight()`, which:

1. Switches the active tab to the Listado tab (via `MatTabGroup.selectedIndex`, the index of
   which is determined by reading the current template).
2. Awaits `loadAbsences()` so the Listado has fresh data for the currently-selected quarter.
3. For each `dates[i]`, finds the rendered Listado row whose `data-enrollment-id` and
   `data-absence-date` attributes match (these are added by the implementer to the row template
   in this same PR), adds the `flash-conflict` CSS class (defined inline in the component's
   `styles:` block — yellow border + 2-second pulse animation), and calls
   `scrollIntoView({ behavior: 'smooth', block: 'center' })`. After 2 seconds (or
   `animationend`), removes the class.

If `pendingHighlight` is null when `applyHighlight()` is called, the method is a no-op — it only
acts after a conflict-bearing dialog close.

The `flash-conflict` CSS is purely visual and SHALL NOT mutate data. It is a UX cue pointing the
user to the existing absence they need to delete before re-saving.

## Discarded alternatives

1. **Enrich `ToastComponent` to accept an array of detail lines / a structured payload.**
   Rejected because `ToastComponent` is shared under `src/app/shared/components/toast/` and used by
   every success / warning / error toast in the app. Adding list-rendering to it would change its
   public contract for one feature's benefit — the project convention (`docs/conventions.md`
   "Reusability") is "no host-specific assumptions baked into a shared component's public
   contract." A feature-scoped dialog is correct.

2. **Show a warning toast INSTEAD of a dialog when there are conflicts, and keep the success toast
   separately when there are also creates.**
   Rejected because AC3 explicitly requires "el mensaje refleja los tres grupos sin perder
   información" — a toast-and-toast pair would (a) require either two competing toasts (one of
   which the snackbar dismisses) or a chained timing dance, and (b) split the WhatsApp action
   across two surfaces. One dialog with a header action is one place to read everything and one
   place to act.

3. **Compute `created` dates by calling `GET /api/absences?date_from=…&date_to=…` after the POST
   and diffing.**
   Rejected because the backend already tells us which dates were skipped via `skippedDetails`
   and the date range is bounded by the user's original `f.dateFrom` / `f.dateTo`. A follow-up
   GET would add latency and an extra point of failure (e.g. course-scope mismatch on the second
   call) for information the response already implies. The
   `<dateFrom>..<dateTo> minus skippedDetails` derivation is closed-form and synchronous.

4. **Filter the `created` toast's WhatsApp action so it only fires when `conflicts.length === 0`,
   keeping today's WhatsApp-button-on-toast UX untouched.**
   Rejected because AC4 says "el botón/acción de WhatsApp existente sigue funcionando igual para
   las fechas que sí se crearon" — when some dates were created and some conflicted, the user
   must still be able to notify about the dates that DID get created, and putting the WhatsApp
   action on a toast that the dialog overrides would either suppress it entirely or create a
   confusing two-surface state. Moving the WhatsApp action into the dialog header (R11) keeps the
   action exactly one click away for the dates the user actually got.

5. **Open the Listado tab from inside the dialog (an "Ir al Listado" button).**
   Rejected in favor of the auto-highlight (R16). An extra button would force the user to make a
   decision ("should I jump now?"), while the highlight makes the next step obvious without
   requiring input. The implementer MAY add an explicit "Ir al Listado" button later if user
   testing shows the auto-jump + highlight is missed; this is not in scope today.

## Conventions reaffirmed

- Standalone component, `OnPush`, `inject()` only — `docs/architecture.md` §1 / §4.
- Inline `template:` and `styles:`, no `.html`/`.css` siblings — `docs/conventions.md` "Names".
- Spanish neutral per `feedback_spanish_neutral.md`; no `Co-Authored-By` in any commit message
  (`feedback_commits.md`).
- The new dialog lives at `src/app/features/absences/absence-save-result-dialog.component.ts`,
  matching `absence-dialog.component.ts` and `absence-range-dialog.component.ts` — sibling
  dialogs to the feature's own component.

## Open questions for the user approval pass

1. **R7 explanatory line wording.** Drafted as "Elimina primero la inasistencia existente en
   esa fecha para poder registrar la otra." — short, neutral. If the user wants a softer
   phrasing (e.g. "Para cambiar el tipo, primero elimina la inasistencia actual en esa fecha."),
   this is the moment to amend R7; after implementation it would be a follow-up.
