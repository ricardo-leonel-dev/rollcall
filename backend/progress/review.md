# Review — feature 18

**Verdict:** APPROVED

## Checkpoints

- C1: [x]
- C2: [x]
- C3: [x]
- C4: [x]
- C5: [x]
- C6: [x]

## Verification performed

- **Test suite (`bash tests/run.sh`)**: 24/24 pass, 0 fail. Run after setting
  `DATABASE_URL` (the project's local Postgres) — the implementer's handoff
  reported the same count under the same conditions.
- **`pnpm run build`**: clean (`tsc`, exit 0).
- **`bash init.sh`**: green. Only acceptable `[WARN]` is
  "No verify_command configured in .harness.json"; Supabase mirror sync is
  a known best-effort warn that is unrelated to this feature.
- **Lint**: `bash scripts/lint_test_fingerprints.sh tests` → `[OK]`.
- **Direct DB checks** (against the local Postgres):
  - `message_template_actions` table seeded with `absences` (sort_order=10)
    and `citations` (sort_order=20), both `active=t`.
  - FK `fk_user_message_templates_action` exists in
    `information_schema.table_constraints` with constraint_type=FOREIGN KEY.
  - Direct `INSERT … action_key='nope'` into `user_message_templates`
    rejected with `violates foreign key constraint
    "fk_user_message_templates_action"` — R23 verified at the DB layer.

## Files modified (vs `origin/staging`)

- `backend/src/controllers/notification-template.controller.ts` (M) —
  adds `DELETE /:actionKey` (T6).
- `backend/src/data-source.ts` (M) — registers `MessageTemplateAction`
  entity (T3).
- `backend/src/services/notification-template.service.ts` (M) — rewritten
  to be catalog-backed (`findAllForUser`, `upsert`, new `restoreDefault`)
  (T4, T5, T6).
- `backend/src/services/user.service.ts` (M) — removes
  `NOTIFICATION_ACTION_KEYS` export (T7).
- `backend/tests/notification-templates.test.ts` (M) — updates shape
  assertions for the new GET/PUT body (T13).
- `backend/tests/run.sh` (M) — compiles and runs the new test file with
  `--test-concurrency=1` (T9).

## Files added

- `postgres/24_message_template_actions.sql` (T1, T2).
- `backend/src/entities/MessageTemplateAction.ts` (T3).
- `backend/tests/helpers/test-template-actions.ts` (T8).
- `backend/tests/message-template-catalog.test.ts` (T10–T23).

The 10/10 file claims in the implementer's Scope table cross-check against
`git diff origin/staging --name-only` + untracked entries.

## sdd=1 R<n> traceability (verified by reading code + tests, not just prose)

- **R1** (table shape) → `postgres/24_message_template_actions.sql`
  `CREATE TABLE message_template_actions` + T10 reads the columns back.
  Verified directly in DB (above).
- **R2** (absences row seeded verbatim) → T10
  `assert.equal(absences!.defaultTemplate, ABSENCES_DEFAULT)` — the literal
  in the test matches the verbatim string in `design.md` exactly.
- **R3** (citations row seeded verbatim) → T10 (same shape).
- **R4** (placeholder keys + labels) → T10
  `placeholders.map(p => p.key) === ['nombre','fecha','tipo','curso']` /
  `['nombre','fecha']` plus a string-label check on every element.
- **R5** (idempotent re-run) → T10 runs the SQL twice and asserts
  exactly-one-row-per-key via `COUNT(*)`.
- **R6** (no `NOTIFICATION_ACTION_KEYS` under `src/`) → T11 walks `src/`
  recursively and asserts zero offenders; `grep -rn NOTIFICATION_ACTION_KEYS
  backend/src` returns nothing.
- **R7** (GET response shape `{actionKey, label, description, placeholders,
  defaultTemplate, template, isCustom}`) → `toItem` in
  `notification-template.service.ts:9-19` returns exactly these 7 fields.
  T14 (catalog) and T9.b (notification-templates) both verify
  per-field presence on every returned item.
- **R8** (ordering `sort_order ASC, action_key ASC`) →
  `findAllForUser` uses
  `order: { sortOrder: 'ASC', actionKey: 'ASC' }`. T15 creates
  `testaction_a`/`b` (sortOrder=-100) and `testaction_c` (sortOrder=15)
  and asserts the order
  `['testaction_a','testaction_b','absences','testaction_c','citations']`.
- **R9** (saved template surfaces `isCustom=true`) → T16 (catalog) and
  T9.c (notification-templates).
- **R10** (no saved row → `template === defaultTemplate`, `isCustom=false`)
  → T14 and T16.
- **R11** (`req.user.id` only) → T16 (catalog, two users) and T9.c
  (notification-templates).
- **R12** (inactive action omitted even with saved row) →
  `findAllForUser` filters `actions` by `active: true` and limits the
  user-rows lookup to `In(actions.map(a => a.actionKey))`, so user rows
  for inactive actions never reach the merge. T17 verifies directly.
- **R13** (PUT creates/updates in place, returns full item, `isCustom=true`,
  `defaultTemplate` unchanged) → T18 (catalog) and T10/T13
  (notification-templates).
- **R14** (unknown `actionKey` → 400, no write) → T19 (catalog) and T11
  (notification-templates).
- **R15** (inactive `actionKey` → 400, no write) → T19 (catalog).
- **R16** (missing/non-string/blank `template` → 400, no write) → T19
  (catalog: missing + blank) and T12.a/T12.b (notification-templates:
  missing + blank).
- **R17** (DELETE restores default, returns item with `isCustom=false`,
  `template === defaultTemplate`) → T20 first DELETE.
- **R18** (DELETE idempotent on second call) → T20 second DELETE returns
  the same body.
- **R19** (DELETE on unknown/inactive `actionKey` → 404, no deletion) →
  T21 hits both `/nope` and `/testaction_off` and asserts the seeded row
  survives.
- **R20** (DELETE scoped to `req.user.id` only) → T20 verifies B's row is
  untouched after A's DELETE.
- **R21** (401 without token on GET/PUT/DELETE, no read/write) → T12
  (catalog: all three methods + pre-seeded row survives) and T9.a
  (notification-templates: GET 401).
- **R22** (entity metadata column mapping) → T22 walks
  `AppDataSource.getMetadata(MessageTemplateAction)` and asserts
  `actionKey → action_key`, `defaultTemplate → default_template`,
  `sortOrder → sort_order`, plus `label`, `description`, `placeholders`,
  `active`.
- **R23** (FK rejects unknown `action_key`) → T23 attempts a direct insert
  via the repository and asserts a foreign-key error, then queries
  `information_schema.table_constraints` for the constraint name.
  Verified directly against the DB (above).

## t<n> traceability

Every `[x]` checkbox in `tasks.md` has a matching diff/added file (T1 → SQL,
T2 → SQL FK clause, T3 → entity, T4 → `findAllForUser`, T5 → `upsert`,
T6 → `restoreDefault` + DELETE route, T7 → `user.service.ts` removal,
T8 → helper, T9 → `tests/run.sh`, T10–T23 → catalog test cases,
T24 → full suite green).

## Notes

- No deviations from the spec detected.
- The frontend-pre-43 semantic break called out in `design.md` "Breaking
  change / coordination" is the documented contract, not an undocumented
  scope drift; coordinated with frontend feature 43 per spec.
- `MODULE_KEYS` is intentionally retained in `user.service.ts` (per
  `design.md` "Edited" — `MODULE_KEYS` stays).

## Required Changes (if applicable)

None.