# Design — Require full dates on quarters

See `docs/architecture.md` (signal-based state, `computed()`, `OnPush`, inline template/styles)
and `docs/conventions.md` (Comments section — no comment unless it explains a non-obvious *why*)
for the baseline this design builds on. See `docs/specs.md` for the EARS/`R<n>`/`T<n>` contract
this design satisfies. See `specs/flexible_quarter_admin_ui/design.md` for the pre-existing shape
of `QuartersDialogComponent` this feature extends — in particular its "Dialog CRUD mechanics"
section describing `QuarterDraft`, `validationErrors()`, and the `onDraftFieldChange` reactivity
fix.

This is a single-file, single-method change: one new `if` branch inside the existing
`validationErrors()` computed in `src/app/features/admin/quarters-dialog.component.ts`. No new
files, no new component inputs/outputs. **The backend now also enforces this rule at the wire
boundary** (`backend/src/controllers/quarter.controller.ts` `POST /` and `PUT /:id`, plus
`backend/src/services/quarter.service.ts#assertValidDates` in `create`/`update`) returning HTTP
400 with the same Spanish string the dialog displays
(`El período debe tener fecha de inicio y fecha de fin.`); historical null-dated rows were
soft-deleted by migration `postgres/19_quarters_softdelete_legacy_null_dates.sql`. The frontend
change in this spec is the **client-side mirror** of that backend rule — the dialog is the
user-facing line of defense (error shows before the request leaves the browser), and the backend
is the wire-boundary line of defense (rejects the same case if a request ever slips past the
client, e.g. a stale build). Both copies of the message must stay identical; see "Source-of-truth
alignment" below.

## File to touch

| File | Change | Requirements |
|---|---|---|
| `src/app/features/admin/quarters-dialog.component.ts` | Insert a missing-date check inside the `validationErrors()` computed's per-draft loop, positioned immediately after the name-length check and before the start-before-end check. | R1, R2, R3, R4, R5, R6, R7 |

No other file changes. `buildDrafts()`, `dateStringToDate`, `isValid()`, `onDraftFieldChange()`,
`save()`, the template's `@if (validationErrors().get(draft.localId); as err)` block, and the
`.invalid-msg` CSS class are all reused as-is — R3/R4/R5/R7 require no code changes at all; they
are existing mechanisms that already compose correctly with the new check once it participates in
the same `errs` map and the same `continue`-per-row loop.

## Exact change

Current loop body (`quarters-dialog.component.ts`, `validationErrors()`), for reference:

```ts
for (const q of items) {
  if (q.deleted) continue;
  if (!q.name.trim()) {
    errs.set(q.localId, 'El nombre del período no puede estar vacío.');
    continue;
  }
  if (q.name.trim().length > 60) {
    errs.set(q.localId, 'El nombre del período no puede superar 60 caracteres.');
    continue;
  }
  // <-- new check inserted here (R1) -->
  if (q.startDate && q.endDate && q.startDate.getTime() > q.endDate.getTime()) {
    ...
```

New branch inserted right after the name-length check and before the start-before-end check:

```ts
  if (!q.startDate || !q.endDate) {
    errs.set(q.localId, 'El período debe tener fecha de inicio y fecha de fin.');
    continue;
  }
```

Rationale for this exact position (not "anywhere in the loop"):
- It must come **after** the two name checks, so an empty-name row still shows the name error
  first — matching every other check's "first applicable error wins" pattern (R1) rather than
  introducing a second, independent error surface.
- It must come **before** start-before-end/range checks, because those checks are only
  meaningful once both dates are known to be present; putting the date-presence check first makes
  the downstream `if (start && end)` guards structurally redundant-but-safe rather than
  load-bearing for *this* new check (they remain load-bearing for the transient mid-edit case in
  R7 — see "Why the `if (start && end)` guards are not removed" below).
- No wording changes to any existing message, no reordering of the existing checks — this is a
  pure insertion.

Message text `El período debe tener fecha de inicio y fecha de fin.` matches the register of the
sibling checks already in the file (third-person declarative, `debe`/`no puede` phrasing, ends
with a period — e.g. `La fecha de inicio debe ser anterior a la fecha de fin.`). It intentionally
does not distinguish "missing start" from "missing end" from "missing both" with three separate
messages: the business rule is "both are required", a single message describing the requirement is
clearer than three near-duplicate messages, and it keeps the check a single `if` matching the
file's existing one-message-per-check style.

## Why the `if (start && end)` guards are not removed (R7)

`docs/conventions.md`'s Comments section only sanctions a comment for a non-obvious *why*; this is
one of those cases, so the implementer should add a short comment at the site of the new check (or
reuse/extend the block comment already present on `onDraftFieldChange`) noting that the
`if (start && end)` guards on the checks below remain intentional: a draft can be transiently
missing one date mid-edit (user cleared a field before retyping), and `validationErrors()` is a
`computed()` that reruns on every `onDraftFieldChange` poke — including the poke that fires the
instant a field is cleared, before the user has typed a replacement. Without those guards,
`q.startDate.getTime()` would throw on `null` during that transient state. The new R1 check
returns early (`continue`) for that same transient state today, so in practice the new check makes
the `if (start && end)` guards not required *before* the R1 check runs — but a future reader must
not read "not required to reach this line" as "safe to delete", because the guards are also what
keep those checks safe in a hypothetical future reordering, and deleting defensive `null` guards
purely because current call order happens to prevent the crash is exactly the kind of drift this
spec exists to head off. `tasks.md` calls this out as an explicit non-goal (do not touch those
guards).

## Legacy data (R5, R6)

*Scope note (2026-08-29 re-amend):* the only null-dated rows that can reach the dialog in
production today are the 3 quarters `seedQuarters()` (called from
`academic-year.service.ts#create`) inserts for a **freshly-created academic year** — those rows
are persisted with `startDate: null, endDate: null` for `sequenceNumber in {1, 2, 3}` and remain
so until the user opens the dialog and completes them. Historical null-dated rows from before
migration `postgres/19_quarters_softdelete_legacy_null_dates.sql` were soft-deleted
(`deleted_at = NOW()`, `is_active = false`) and therefore no longer surface in
`GET /api/quarters` listings, so they cannot reach the dialog. A user can repair a seeded
null-dated row with a single `PUT /api/quarters/:id` supplying both dates (verified end-to-end
with curl) — there is no need for a separate "fill the date, then save twice" dance.

No change needed to `buildDrafts()`: it already maps `q.startDate ? dateStringToDate(q.startDate)
: null` (and the same for `endDate`), so a freshly-seeded quarter with `null` dates already
produces a draft with `startDate: null, endDate: null` today — this already satisfies R5 (no
crash on load) without any code change. `validationErrors()` is a `computed()` that evaluates
eagerly against `drafts()`'s initial value, so the moment the new R1 branch exists, a
null-dated draft shows its error and a disabled save button on the dialog's very first render —
this already satisfies R6 without any extra eager-evaluation trigger; the requirement is stated
explicitly in `requirements.md` only so the reviewer has something concrete to check against, not
because it requires new plumbing.

## Source-of-truth alignment (2026-08-29 re-amend)

The Spanish string `El período debe tener fecha de inicio y fecha de fin.` now exists in two
places — the dialog's `validationErrors()` map (per R1) and the backend's HTTP 400 body for
`POST /api/quarters` and `PUT /api/quarters/:id` (see `backend/src/controllers/quarter.controller.ts:25,31`
and `backend/src/services/quarter.service.ts:57`). Both copies are byte-for-byte identical today
and must stay that way. `tasks.md` T8 makes this an explicit verification step (a `grep` across
both repos plus a re-validate after any future string change). If they ever drift, the user will
see one message on screen and a different one from the backend's 400 response — confusing for
the user and breaking the "validation parity" guarantee this spec is now built on.

## Error handling (2026-08-29 re-amend)

No new server-error handling is required in the dialog for the "missing dates" case. The dialog's
existing R1 client-side check fires before any HTTP request is sent; the backend uses the
**same** Spanish string for the same case; therefore the user cannot observe a backend
"missing-dates" 400 with a different message through this dialog. The implementer should not
add an `errorInterceptor` branch, a `save()` catch, or a `result-error` mapping for this
case — it adds complexity for a scenario that is unreachable when the client-side check is in
place. Existing general-purpose 4xx/5xx handling (toast via `NotificationService`) continues to
catch every other backend error unchanged.

## Discarded alternatives

1. **Enforce required dates via Angular template-driven form validators (`Validators.required` /
   `required` attribute on the two `matDatepicker` inputs, reading `NgModel.invalid` in the
   template) instead of extending the `validationErrors()` computed.** Rejected: this file's
   entire validation model is a single centralized `Map<localId, string>` computed from
   `drafts()`, feeding both the inline `@if` error block and the `isValid()` save-button gate.
   Adding a second, independent validity source (template-driven `NgModel` state) would mean two
   systems could disagree — e.g. a row could be `NgModel`-invalid but missing from `errs`, or vice
   versa — and the save button would need to be gated on the conjunction of both, doubling the
   surface a future change has to keep in sync. It would also fight the already-fixed
   `onDraftFieldChange` reactivity model (`docs/specs.md`'s traceability convention and this
   dialog's own commit history exist specifically because keeping validation state and template
   state in sync here was previously buggy) by reintroducing a second, framework-owned state to
   keep in sync, instead of composing with the fix already in place.
2. **Three separate messages for "missing start", "missing end", "missing both".** Rejected: adds
   branching for no behavioral benefit (the save button is disabled in all three cases either way)
   and produces near-duplicate strings that increase the chance of an inconsistent edit `later.
   The business rule this feature encodes is symmetric ("both required"), so the message is
   symmetric too.
3. **Extract the new check into a standalone pure function (e.g. `hasCompleteDates(draft):
   boolean`) in `shared/utils/date.util.ts` for reuse.** Rejected per `docs/conventions.md`'s
   Reusability section: there is currently exactly one caller (this dialog); every other date
   check in this same computed (start-before-end, range, overlap) is already inlined directly in
   the loop rather than extracted, so inlining the new check keeps it consistent with its
   immediate neighbors. If a second, unrelated screen later needs the same "both dates required"
   rule, extract then — not preemptively for a single call site.
