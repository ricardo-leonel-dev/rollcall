# Implementer handoff — feature 19: `citation_template_separate_hora_placeholder`

Session 34, implementer, 2026-10-08. `sdd=0` feature (no spec file); the
acceptance contract was delivered by the leader in the task brief. No
spec deviations.

## Outcome

- [x] New migration `postgres/25_citation_template_hora.sql` created
  (acceptance A, B, C, D).
- [x] `tests/message-template-catalog.test.ts`:
  - [x] `CITATIONS_DEFAULT` constant updated to the new default text.
  - [x] T10 placeholders assertion updated from `['nombre', 'fecha']` to
    `['nombre', 'fecha', 'hora']`.
  - [x] Generalized `migrationPath()` helper to take a filename (was
    hardcoded to migration 24) so T10 + T24–T27 share the same
    `tests/<file>.ts → ../../postgres/<file>.sql` candidate pattern.
  - [x] T24 (acceptance A, B, D) — migration 25 applies twice cleanly;
        citations catalog state is correct; absences row is byte-identical
        before vs. after.
  - [x] T25 (acceptance C) — legacy citations user row is rewritten
        (`{{fecha}}` → `{{fecha}} a las {{hora}}`); absences user rows
        are not touched.
  - [x] T26 (acceptance C idempotency / D) — a citations row that
        already uses `{{hora}}` is preserved verbatim; a second apply
        does not re-modify any row.
  - [x] T27 (acceptance E) — `GET /api/notification-templates` returns
        the new citations shape (`placeholders` keys in order, new
        `defaultTemplate` / `template`, `isCustom=false` for a fresh
        user).
- [x] `tests/notification-templates.test.ts` — no edits required.
  That file does not contain a `CITATIONS_DEFAULT` constant (its T9.b
  derives the active catalog keys from the DB and T9.c only checks
  per-user isolation, so it does not hardcode the citations text).
  Verified by re-reading the file end-to-end; the leader's brief
  mentioned a constant at line ~29 but that constant lives only in
  `message-template-catalog.test.ts`.

## Scope

| Path | Change |
|---|---|
| `/home/rileo/ai-personal-wt/citation-template-hora/postgres/25_citation_template_hora.sql` | New — UPDATEs `message_template_actions` row `action_key='citations'` to new placeholders + default, then UPDATEs legacy `user_message_templates` rows to inject ` a las {{hora}}` after `{{fecha}}`. Idempotent: catalog UPDATE is by PK, user-row UPDATE is guarded by `template NOT LIKE '%{{hora}}%'`. |
| `/home/rileo/ai-personal-wt/citation-template-hora/backend/tests/message-template-catalog.test.ts` | Modified — updated `CITATIONS_DEFAULT`, T10 placeholders assertion, generalized `migrationPath()` helper, added T24–T27. |
| `/home/rileo/ai-personal-wt/citation-template-hora/progress/impl_citation_template_separate_hora_placeholder.md` | New — this handoff. |

## Verification

### Pre-check (dev DB before migration)

```
$ docker exec postgres psql -U attendance -d attendance \
    -c "SELECT action_key, COUNT(*) FROM message_template_actions GROUP BY action_key"
 action_key | count
------------+-------
 citations  |     1
 absences   |     1
(2 rows)

$ docker exec postgres psql -U attendance -d attendance \
    -c "SELECT COUNT(*) FROM user_message_templates WHERE action_key NOT IN ('absences','citations')"
 count
-------
     0
(1 row)

$ docker exec postgres psql -U attendance -d attendance \
    -c "SELECT action_key, template FROM user_message_templates WHERE action_key='citations' LIMIT 5"
 action_key | template
------------+----------
(0 rows)
```

Catalog seeded by feature 18 (1 row per key, no duplicates). No
non-canonical user rows. No legacy citations user rows in this dev
instance — fine, T25 and T26 seed their own.

### Apply (twice — first run + idempotency re-run)

```
$ docker exec -i postgres psql -U attendance -d attendance \
    < postgres/25_citation_template_hora.sql
SET
UPDATE 1
UPDATE 0
$ docker exec -i postgres psql -U attendance -d attendance \
    < postgres/25_citation_template_hora.sql
SET
UPDATE 1
UPDATE 0
```

First run: catalog `UPDATE 1` (citations row rewritten); user rows
`UPDATE 0` (no legacy citations rows present in dev DB — T25 / T26
exercise this in the test suite).
Second run: catalog `UPDATE 1` is a no-op overwrite with the same
values; user rows `UPDATE 0` because no row matches `{{fecha}}` without
`{{hora}}` anymore.

### Catalog state after migration

```
$ docker exec postgres psql -U attendance -d attendance \
    -c "SELECT action_key, default_template, jsonb_array_length(placeholders) FROM message_template_actions ORDER BY action_key"
 action_key |                                                                               default_template                                                                                | jsonb_array_length
------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+--------------------
 absences   | Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información. |                  4
 citations  | Estimado representante, se le cita a la institución el {{fecha}} a las {{hora}} para tratar un asunto relacionado con {{nombre}}. Por favor confirmar asistencia.             |                  3
(2 rows)
```

absences row is byte-identical to its pre-state (verified in T24 by
snapshotting the row before applying and `assert.equal`ing after).

### TypeScript build

```
$ pnpm run build
$ tsc          # no output, exit 0
```

### Test run

```
$ DATABASE_URL="postgresql://attendance:asistencia_local_2026@localhost:5432/attendance" \
    bash tests/run.sh
# tests 28
# suites 0
# pass 28
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4724.252421
```

All 28 tests pass. The 4 new tests for feature 19:

| Test | What |
|---|---|
| T24 | migration 25 applies twice cleanly; citations placeholders = `[nombre, fecha, hora]`, default = new text, labels per spec; absences row is byte-identical before vs. after. |
| T25 | legacy citations user row `'Estimado apoderado, {{nombre}} el {{fecha}}.'` is rewritten to `'Estimado apoderado, {{nombre}} el {{fecha}} a las {{hora}}.'`; absences user row is byte-identical. |
| T26 | citations row that already uses `{{hora}}` is preserved verbatim; a second apply does not re-write any row; final `LIKE '%{{fecha}}%' AND NOT LIKE '%{{hora}}%'` count = 0 across the table. |
| T27 | `GET /api/notification-templates` for a fresh user returns the citations item with `placeholders` keys in order, `defaultTemplate === template === CITATIONS_DEFAULT`, `isCustom: false`. |

The 24 prior tests (T9.a/b/c, T10–T23) all still pass with the new
catalog state — no fixture in the pre-existing test suite pinned the
old citations default.

## Acceptance traceability

| Acceptance criterion | Covered by |
|---|---|
| A — new file `postgres/25_citation_template_hora.sql`, no `_supabase` variant (only UPDATE, no DDL Supabase can't run) | The file itself exists; only UPDATEs, no DDL. |
| B — citations `placeholders` becomes `[nombre, fecha, hora]` with the spec'd labels, `default_template` is the new text, absences row untouched | T24 asserts all four. |
| C — `user_message_templates` rows with `action_key='citations'` containing `{{fecha}}` but not `{{hora}}` get `{{fecha}}` rewritten to `{{fecha}} a las {{hora}}` | T25 asserts the literal rewrite; T26 asserts the already-modern row is preserved (same guard). |
| D — migration is idempotent (running twice produces no further diff) | T24 applies the SQL twice; T26 applies it twice and asserts the row state is identical between applies. The catalog UPDATE 1 / UPDATE 1 from `psql` is a no-op overwrite with the same values; user UPDATE 0 is the `NOT LIKE '%{{hora}}%'` guard. |
| E — `GET /api/notification-templates` reflects the new catalog state | T27 hits the live endpoint and asserts the new shape. |

## Notes for reviewer

- **No service / controller code change.** The catalog is the source of
  truth and `notification-template.service.ts::findAllForUser` returns
  `defaultTemplate` and `placeholders` straight from the row. Updating
  the row in the migration makes `GET /api/notification-templates`
  serve the new values automatically. Frontend's `citation_template_hora_placeholder_and_preview`
  should now see `[nombre, fecha, hora]` in `placeholders` and the new
  default text — the catalog is the contract.
- **Idempotency contract.** Two independent guards:
  1. The catalog UPDATE targets a single PK row, so re-running simply
     overwrites with the same values (`UPDATE 1, UPDATE 1` is correct
     — both are the citations row).
  2. The user-template UPDATE is guarded by `template NOT LIKE '%{{hora}}%'`,
     so a second run matches zero rows (`UPDATE 0, UPDATE 0`).
  Both verified by the `psql` output and by T24 / T26.
- **`absences` is byte-identical.** T24 snapshots the absences row
  before the migration and `assert.equal`s `defaultTemplate` and
  `JSON.stringify(placeholders)` after — the row is not touched by
  either UPDATE (both have `action_key='citations'` in the WHERE).
- **Users who already edited the citations template are preserved.**
  T26 seeds a row that already contains `{{hora}}` and asserts it is
  preserved verbatim — the `NOT LIKE '%{{hora}}%'` guard means a user
  who has already adapted to the new placeholder is not
  double-rewritten (e.g. a row containing `{{fecha}} a las {{hora}}`
  is not touched; only the case `{{fecha}}` without `{{hora}}` is
  rewritten).
- **`testaction_*` rows unaffected.** The user-template UPDATE has
  `action_key='citations'` in the WHERE, so catalog `testaction_*`
  rows from other tests cannot be hit. The catalog UPDATE is also
  pinned to `action_key='citations'`, so test actions stay intact.
- **Multi-occurrence `{{fecha}}`.** `REPLACE(template, '{{fecha}}',
  '{{fecha}} a las {{hora}}')` replaces *every* occurrence in the
  legacy row. That matches the spec ("replacing `{{fecha}}` with
  `'{{fecha}} a las {{hora}}'`"). The pre-existing seed catalog default
  had only one `{{fecha}}`; if a real user template had multiple
  occurrences (e.g. quoting the field name) the rewrite would expand
  all of them — this is the documented semantic of the migration, not
  a bug, but worth noting if a user reports an oddly-expanded message.
  The guard `template NOT LIKE '%{{hora}}%'` means a user who has
  already converted any one occurrence is left alone, which is the
  right behaviour for the "I've already updated this" case.
- **`harness.db` shows as untracked** at the worktree root after
  changes. That is the harness's own state file (managed by
  `install.sh`'s `.git/info/exclude`); it is not part of the change set
  and will not be committed.
