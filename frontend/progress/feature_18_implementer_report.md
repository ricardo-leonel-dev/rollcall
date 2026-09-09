# Feature 18 implementer report — `notification_templates_settings_ui`

## Status
Implementation complete. Build green. Ready for reviewer.

## Files touched
- `src/app/core/models/index.ts`
- `src/app/core/services/notification-template.service.ts` (new)
- `src/app/shared/components/profile-dialog/profile-dialog.component.ts`
- `src/app/features/absences/absences.component.ts`
- `progress/impl_notification_templates_settings_ui.md` (handoff)

## T<n> → files → R<n> covered

| T | File(s) | R<n> |
|---|---|---|
| T1 | `core/models/index.ts` | R1 |
| T2 | `core/services/notification-template.service.ts` | R5 |
| T3 | `core/services/notification-template.service.ts` | R2, R3, R4 |
| T4 | `core/services/notification-template.service.ts` | R6 |
| T5 | `core/services/notification-template.service.ts` | R7, R8 |
| T6 | `shared/components/profile-dialog/profile-dialog.component.ts` | R19, R21 |
| T7 | `shared/components/profile-dialog/profile-dialog.component.ts` | R10, R11 |
| T8 | `shared/components/profile-dialog/profile-dialog.component.ts` | (state shape) |
| T9 | `shared/components/profile-dialog/profile-dialog.component.ts` | R9, R12 |
| T10 | `shared/components/profile-dialog/profile-dialog.component.ts` | (preview/insert) |
| T11 | `shared/components/profile-dialog/profile-dialog.component.ts` | R13, R14, R15 |
| T12 | `shared/components/profile-dialog/profile-dialog.component.ts` | R10, R11 |
| T13 | `shared/components/profile-dialog/profile-dialog.component.ts` | R19 |
| T14 | `features/absences/absences.component.ts` | R20 |
| T15 | `features/absences/absences.component.ts` | R16, R21 |
| T16 | `features/absences/absences.component.ts` | R17 |
| T17 | `features/absences/absences.component.ts` | R18 |
| T18 | (build only) | R22 |
| T19 | `progress/impl_notification_templates_settings_ui.md` | R23 |

Full R<n> → verification map: `progress/impl_notification_templates_settings_ui.md` §"R<n> →
verification mapping".

## Verification evidence

- `./node_modules/.bin/ng build --configuration production` — exit `0`,
  `Application bundle generation complete`, output in `dist/frontend/browser/`.
- `./init.sh` — exits with `[OK] Environment ready. You can start working.` Two `[WARN]` lines
  printed, both pre-existing & expected:
  1. `No verify_command configured in .harness.json — skipping` (per `docs/verification.md`,
     intentional until a test framework is added).
  2. `$SUPABASE_URL / $SUPABASE_ANON_KEY not set — skipping mirror sync` (pre-existing harness
     mirror config).
  Neither blocks the feature.
- `grep -rn "DEFAULT_NOTIFICATION_TEMPLATE" src/` → empty.
- `grep -rn "notificationTemplate" src/` → empty.
- No `docker compose` run from this environment; the full manual smoke (R23) is the reviewer's
  call against the running stack. The procedure is documented in
  `progress/impl_notification_templates_settings_ui.md` §"Manual smoke procedure (R23)" with
  explicit pass-criteria for each requirement.

## Deviations from spec
None. Implementation follows `design.md`'s reference code for the service verbatim, and the
profile-dialog restructuring matches the design exactly (one `'absences'` entry; no citations
entry, per the scope note in `requirements.md`).

## Reviewer-facing summary — where to look first
1. `core/services/notification-template.service.ts` — new file, ~55 lines.
2. `shared/components/profile-dialog/profile-dialog.component.ts` — meat of the change.
3. `features/absences/absences.component.ts` — 4 small surgical edits.
4. `core/models/index.ts` — 5-line addition at the end.

No backend, no routing, no `*.spec.ts`, no `package.json` changes were needed.

## Anti-Telephone
Full handoff in `progress/impl_notification_templates_settings_ui.md`. This file is the
orchestrator's pointer — keep responses short.
