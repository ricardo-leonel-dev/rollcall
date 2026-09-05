# Review — feature 22 (`profile_to_route_promotion`)

**Verdict (re-review):** APPROVED

## Re-review verdict

APPROVED. The implementer addressed both findings from the prior CHANGES_REQUESTED. Fix #1
(`hasDirty()` email comparison) is in place in the exact shape the spec calls for, with no
collateral changes to surrounding fields. Fix #2 (the design.md "Spec deltas" stamp) is
present, comprehensive, neutral in tone, traceable, and placed before the Verification
section. `requirements.md` and `tasks.md` are untouched — the user-accepted delta is
recorded only in `design.md`, as the documented pattern requires. Production build still
exits 0 with only the pre-existing style-budget warnings. Both fixes are recorded in the
session log (entries dated 2026-09-05T13:14:59Z and 2026-09-05T13:15:07Z).

## Fix #1 verification — PASS

**File / line / evidence:**

- `src/app/features/profile/profile.component.ts:300-312` — `hasDirty()` now reads:

  ```ts
  hasDirty(): boolean {
    const i = this.initial;
    return this.fullName       !== (i.fullName ?? '')
        || this.email          !== (i.email ?? '')
        || this.title          !== (i.title ?? '')
        || this.signatureLabel !== (i.signatureLabel ?? '')
        || this.template()    !== (i.notificationTemplate ?? '')
        || this.avatarUrlSig() !== (i.avatarUrl ?? null)
        || this.currentPassword !== ''
        || this.newPassword     !== ''
        || this.confirmPassword !== ''
        || this.selectedPreset() !== resolveAvatarPreset(i.avatarUrl ?? null)?.id;
  }
  ```

- Line 303 (`this.email !== (i.email ?? '')`) is inserted in the same position the
  spec's `hasDirty()` template at `design.md` lines 150–161 places it (second clause,
  after `fullName`, before `title`).
- Surrounding clauses (`fullName`, `title`, `signatureLabel`, `template()`,
  `avatarUrlSig()`, the three password fields, `selectedPreset()`) are byte-identical
  to the prior pass — no accidental edits.
- `canDeactivate()`'s `'save'` branch (line 323) still compares email against
  `this.initial.email`, so save-on-navigate is consistent with the now-fixed
  dirty-detection path.

**Build regression check:** `./node_modules/.bin/ng build --configuration production`
exits 0. Output: "Application bundle generation complete. [12.060 seconds] - 2026-09-
05T13:17:36.247Z". Warnings are the same pre-existing style-budget overages (login,
calendar, layout, absences, citations, justifications, profile, student-report,
export-config-dialog) reported on the prior pass — not a regression.

## Fix #2 verification — PASS

**File / section / evidence:**

- `specs/profile_to_route_promotion/design.md` lines 330–387 — a new section titled
  `## Spec deltas (user-accepted)` sits between `## Discarded alternatives` (line 293)
  and `## Verification` (line 389). The section is dedicated to the R5 WhatsApp
  template endpoint delta and covers all six required items:
  1. **What the spec said** — lines 334–337 cite R5 + the `Me` interface shape (lines
     71–78 of design.md) and the literal `GET /api/auth/me` / `PUT /api/auth/me`
     endpoints.
  2. **What the implementation does** — lines 339–343 name the actual endpoints
     (`GET /api/notification-templates?actionKey=absences` and
     `PUT /api/notification-templates { actionKey: 'absences', template }`) and
     confirm the `DEFAULT_NOTIFICATION_TEMPLATE` fallback is unchanged.
  3. **Why** — lines 345–360 give three concrete reasons (backend `updateMe`
     allowlist drops `notificationTemplate`; `/api/auth/me` doesn't return
     `notificationTemplate`; the original dialog was already template-service-
     backed via `NotificationTemplateService`).
  4. **What this preserves** — lines 362–372 enumerate R5 functional identity, the
     R11/R14 dirty-tracking contract, and R10's `DEFAULT_NOTIFICATION_TEMPLATE`
     relocation.
  5. **What this does NOT affect** — lines 374–381 list the unaffected requirements
     (R10 still moves the constant; the other four sections still use
     `/api/auth/me{,/password,/avatar{,/upload}}`).
  6. **Status** — lines 383–387 record `user-accepted 2026-09-05` and the explicit
     caveat: "Do **not** 'fix' by reverting to `/api/auth/me` for the template path
     without first landing a backend change to `updateMe` (allowlist the
     `notificationTemplate` key) and to `/api/auth/me` (return `notificationTemplate`
     in the response) — that work is out of scope for this feature."
- **Placement**: section appears before `## Verification` — consistent with the
  document's existing section ordering (spec narrative → deltas → verification).
- **Tone**: neutral and traceable; a future reader can read the original spec text
  (the inline references to lines 71–78 and `requirements.md` R5) and the deviation
  side-by-side without needing the session log.
- **`requirements.md` integrity check**: `git diff` shows the spec files
  (`specs/profile_to_route_promotion/{requirements.md,tasks.md}`) are untouched since
  the approved baseline — the delta is documented only in `design.md`, as the
  documented pattern requires.
- **Log spot check**: `sqlite3 harness.db "SELECT entry, created_at FROM
  session_log_entries WHERE session_id=37 ORDER BY created_at DESC LIMIT 4;"` returns:
  - `Fix #2: design.md 'Spec deltas (user-accepted)' section added documenting
    /api/notification-templates template path; user-accepted 2026-09-05.|2026-09-05T13:15:07.000Z`
  - `Fix #1: hasDirty() now tracks email (R11 compliance); build re-verified green.|2026-09-05T13:14:59.000Z`
  - `REVIEW (changes-requested): hasDirty() omits email (R11) — one-line fix
    required; spec delta on /api/notification-templates persistence needs explicit
    user acknowledgment|2026-09-05T09:39:42.000Z`
  - (older log entries below)

## New findings

None. Reading the touched files (`profile.component.ts`, `design.md`) and re-running the
production build surfaced no regressions introduced by either fix. The `hasDirty()`
edit is a single inserted clause; the design.md insertion is purely additive (one
section between `Discarded alternatives` and `Verification`).

## Final reviewer verdict

verdict: APPROVED