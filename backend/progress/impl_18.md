# Implementer handoff — feature 18: `message_template_catalog`

Session 33, implementer, 2026-10-05. Spec approved by Ricardo Aguilar (recorded in
`harness.db` before this session opened — feature was `in_progress` but had no
open session, so this session's `claim` was a `RESUMED` of a previous session that
the leader cancelled by mistake). Implementation walked T1 → T24 in order; no
spec deviations.

## Outcome

T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19,
T20, T21, T22, T23, T24 are all marked `[x]` in `specs/message_template_catalog/tasks.md`.

## Scope

| Path | Change |
|---|---|
| `/home/rileo/ai-personal-wt/message-template-catalog/postgres/24_message_template_actions.sql` | New — create `message_template_actions`, seed `absences`/`citations`, add FK `fk_user_message_templates_action` (T1, T2) |
| `/home/rileo/ai-personal-wt/message-template-catalog/backend/src/entities/MessageTemplateAction.ts` | New — entity + `MessageTemplatePlaceholder` interface (T3) |
| `/home/rileo/ai-personal-wt/message-template-catalog/backend/src/data-source.ts` | Registered `MessageTemplateAction` entity |
| `/home/rileo/ai-personal-wt/message-template-catalog/backend/src/services/notification-template.service.ts` | Rewritten — catalog-backed `findAllForUser`, catalog-validated `upsert`, new `restoreDefault` (T4, T5, T6) |
| `/home/rileo/ai-personal-wt/message-template-catalog/backend/src/controllers/notification-template.controller.ts` | Added `DELETE /:actionKey` route (T6) |
| `/home/rileo/ai-personal-wt/message-template-catalog/backend/src/services/user.service.ts` | Removed `NOTIFICATION_ACTION_KEYS` export (T7) |
| `/home/rileo/ai-personal-wt/message-template-catalog/backend/tests/helpers/test-template-actions.ts` | New — `createTestAction`, `deleteTestActions` (T8) |
| `/home/rileo/ai-personal-wt/message-template-catalog/backend/tests/message-template-catalog.test.ts` | New — 13 tests for T10–T23 |
| `/home/rileo/ai-personal-wt/message-template-catalog/backend/tests/notification-templates.test.ts` | Updated shape assertions for new GET/PUT body (T13) |
| `/home/rileo/ai-personal-wt/message-template-catalog/backend/tests/run.sh` | Compiles and runs both test files with `--test-concurrency=1` (T9) |
| `/home/rileo/ai-personal-wt/message-template-catalog/backend/specs/message_template_catalog/tasks.md` | All tasks checked off |

`grep -rn NOTIFICATION_ACTION_KEYS src/` returns no results — R6 is verified
mechanically.

## Verification

### Migration pre-check + apply

```
docker exec postgres psql -U attendance -d attendance \
  -c "SELECT DISTINCT action_key FROM user_message_templates \
          WHERE action_key NOT IN ('absences','citations');"
 action_key
------------
(0 rows)

docker exec -i postgres psql -U attendance -d attendance \
  < postgres/24_message_template_actions.sql
SET
CREATE TABLE
INSERT 0 2
NOTICE:  constraint "fk_user_message_templates_action" of relation "user_message_templates" does not exist, skipping
ALTER TABLE
ALTER TABLE
```

Pre-check returned 0 rows (safe to add FK). Migration applied cleanly: table
created, two seeded rows inserted, FK `fk_user_message_templates_action`
added.

### TypeScript build

```
pnpm run build
$ tsc          # no output, exit 0
```

### Test run

```
DATABASE_URL="postgresql://attendance:asistencia_local_2026@localhost:5432/attendance" \
  bash tests/run.sh

# tests 24
# suites 0
# pass 24
# fail 0
# duration_ms ~3.5s
```

All 24 tests pass:

| File | Tests | What |
|---|---|---|
| `tests/message-template-catalog.test.ts` | T10, T11, T12, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23 | New feature |
| `tests/notification-templates.test.ts` | T9.a, T9.b, T9.c, T10, T11, T12.a, T12.b, T13, T14, T15.a, T15.b | Existing feature 8 (updated shape) |

### Lint

`bash scripts/lint_test_fingerprints.sh tests` → `[OK] No byte-level fingerprints detected`.

### `init.sh`

```
── 4. Running verification command ─────────────────────
[WARN]  No verify_command configured in .harness.json — skipping
[OK] Environment ready.
```

Expected `[WARN]` (verify_command is empty in `.harness.json` — the project-level
test script is `tests/run.sh`, run explicitly above).

## R<n> → test traceability

| `R<n>` | Covered by | Test file / name |
|---|---|---|
| R1 (table shape: `action_key` PK, `label`, `description`, `placeholders` jsonb, `default_template`, `sort_order`, `active`) | T1, T2 | `tests/message-template-catalog.test.ts` — T10 |
| R2 (`absences` row seeded with verbatim default + `active=true`) | T1, T2 | T10 |
| R3 (`citations` row seeded with verbatim default + `active=true`) | T1, T2 | T10 |
| R4 (`placeholders` keys `nombre,fecha,tipo,curso` / `nombre,fecha` with string `label`) | T1, T2 | T10 |
| R5 (migration runs twice without error, one row per seeded key) | T1, T2 | T10 |
| R6 (no `NOTIFICATION_ACTION_KEYS` under `src/`) | T7 | `tests/message-template-catalog.test.ts` — T11 |
| R7 (GET returns one item per active catalog row with full shape) | T4 | `tests/message-template-catalog.test.ts` — T14; `tests/notification-templates.test.ts` — T9.b |
| R8 (GET ordering by `sort_order` ASC, `action_key` ASC tie-break) | T4 | `tests/message-template-catalog.test.ts` — T15 |
| R9 (saved template surfaces with `isCustom=true`) | T4 | `tests/message-template-catalog.test.ts` — T16; `tests/notification-templates.test.ts` — T9.c |
| R10 (no saved row → `template === default_template`, `isCustom=false`) | T4 | `tests/message-template-catalog.test.ts` — T14, T16; `tests/notification-templates.test.ts` — T9.b |
| R11 (per-user, `req.user.id` only) | T4 | `tests/message-template-catalog.test.ts` — T16 |
| R12 (inactive actions omitted even with saved row) | T4 | `tests/message-template-catalog.test.ts` — T17 |
| R13 (PUT creates/updates in place, returns full item, `isCustom=true`, `defaultTemplate` unchanged) | T5 | `tests/message-template-catalog.test.ts` — T18; `tests/notification-templates.test.ts` — T10, T13 |
| R14 (unknown `actionKey` → 400, no write) | T5 | `tests/message-template-catalog.test.ts` — T19; `tests/notification-templates.test.ts` — T11 |
| R15 (inactive `actionKey` → 400, no write) | T5 | `tests/message-template-catalog.test.ts` — T19 |
| R16 (missing/non-string/blank `template` → 400, no write) | T5 | `tests/message-template-catalog.test.ts` — T19; `tests/notification-templates.test.ts` — T12.a, T12.b |
| R17 (DELETE on active action restores default, returns item with `isCustom=false`, `template === default_template`) | T6 | `tests/message-template-catalog.test.ts` — T20 |
| R18 (DELETE idempotent: 200 on second call, same body) | T6 | `tests/message-template-catalog.test.ts` — T20 |
| R19 (DELETE on unknown/inactive action → 404, no deletion) | T6 | `tests/message-template-catalog.test.ts` — T21 |
| R20 (DELETE scoped to `req.user.id` only) | T6 | `tests/message-template-catalog.test.ts` — T20 |
| R21 (no JWT → 401 on GET/PUT/DELETE, no read/write) | T4, T5, T6 | `tests/message-template-catalog.test.ts` — T12; `tests/notification-templates.test.ts` — T9.a |
| R22 (`MessageTemplateAction` entity metadata) | T3 | `tests/message-template-catalog.test.ts` — T22 |
| R23 (FK rejects unknown `action_key`; constraint exists in `information_schema`) | T2 | `tests/message-template-catalog.test.ts` — T23 |

## Notes for reviewer

- Migration FK constraint name is `fk_user_message_templates_action` per
  `design.md`. Verified via `information_schema.table_constraints` in T23.
- `NOTIFICATION_ACTION_KEYS` was a constant exported from `user.service.ts`;
  removed cleanly. `MODULE_KEYS` (an unrelated whitelist for user module
  assignments) is untouched per `design.md` "Edited" section.
- `notification-template.service.ts`'s `upsert` validates `actionKey` before
  `template` (matches feature 8's behaviour) — messages are
  `Acción inválida: <key>` and `template es requerido` unchanged.
- `restoreDefault` is idempotent because `repo().delete` on zero matching
  rows is a no-op (no `.delete` throw when nothing matches).
- `tests/run.sh` runs with `--test-concurrency=1` per `design.md`
  "Test isolation" so the two test files don't interleave their
  `testaction_*` insert/delete cycles.
- The frontend pre-43 (which does
  `templates.find(t => t.actionKey === 'absences')` without checking
  `isCustom`) will display the default as if it were the user's own
  template — this is the documented semantic break in `design.md`
  "Breaking change / coordination", coordinated with frontend feature 43.