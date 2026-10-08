# Review — feature 19: `citation_template_separate_hora_placeholder`

**Verdict:** APPROVED

Session 34, reviewer, 2026-10-08. `sdd=0` feature. Implementer
reports `pass 28, fail 0`; verified independently.

## Checkpoints

- C1: [x] — `.harness.json` and `harness.db` exist at backend root; `init.sh`
  exits 0 with all green (snapshot regenerated, no byte-level fingerprints in
  tests, no postgres/Supabase mirror to sync in this env).
- C2: [x] — `scripts/harness.sh status` shows exactly one feature
  `in_progress` (feature 19). All other features are `done` or `pending`.
  Session 34 is the only open session.
- C3: [x] — `git diff --stat` shows only
  `backend/tests/message-template-catalog.test.ts` (175+/6-) plus the
  new `postgres/25_citation_template_hora.sql` and
  `backend/progress/impl_citation_template_separate_hora_placeholder.md`.
  No `backend/src/**` files touched; no controller / service / entity
  changes. The catalog is the source of truth and the runtime endpoint
  reads from it — the migration alone is the contract change.
- C4: [x] — Tests exist and exercise real behavior:
  - T24 (`tests/message-template-catalog.test.ts:457`) reads the SQL
    file from disk and applies it twice via
    `AppDataSource.query(sql)`, then asserts the citations catalog
    row's `placeholders`, `defaultTemplate`, and per-placeholder
    labels (`Nombre del estudiante`, `Fecha de la citación`,
    `Hora de la citación`).
  - T24 also snapshots the `absences` row before the migration and
    `assert.equal`s `defaultTemplate` + `JSON.stringify(placeholders)`
    afterwards — byte-identical proof.
  - T25 (`tests/message-template-catalog.test.ts:501`) seeds a legacy
    citations user row and an absences user row, runs the migration,
    asserts the citations row is rewritten to
    `'... {{fecha}} a las {{hora}}.'` and the absences row is
    byte-identical.
  - T26 (`tests/message-template-catalog.test.ts:544`) covers
    idempotency: a row that already uses `{{hora}}` is preserved
    verbatim, a second apply does not re-modify any row, and a
    `LIKE '%{{fecha}}%' AND NOT LIKE '%{{hora}}%'` query against
    `user_message_templates` returns 0 rows after the second apply.
  - T27 (`tests/message-template-catalog.test.ts:600`) calls
    `GET /api/notification-templates` over HTTP (via `fetch` in
    `authedRequest`) and asserts the citations item has the new
    `placeholders` keys, new `defaultTemplate`, `isCustom=false`
    for a fresh user.
  - I re-ran the suite myself:
    `DATABASE_URL=... bash tests/run.sh` → `tests 28, pass 28, fail 0,
    duration_ms 4040`.
  - I re-ran `pnpm run build` myself → exit 0, no output (just
    `$ tsc`).
- C5: [x] — Will be enforced by the leader when `log-out` runs after
  this approval.
- C6: N/A — feature is `sdd=0`.

## Verification I performed

1. **Read** `postgres/25_citation_template_hora.sql` end-to-end.
   - Line 19: `SET search_path TO attendance, public;` ✓
   - Lines 21–26: exactly one `UPDATE message_template_actions`
     scoped to `action_key='citations'` setting the three-key
     placeholders JSONB and the new default template ✓
   - Lines 28–32: the spec'd `UPDATE user_message_templates ... REPLACE(...)`
     guarded by `action_key='citations' AND template LIKE '%{{fecha}}%' AND
     template NOT LIKE '%{{hora}}%'` ✓
   - No DDL, no `absences` row touched, no Supabase-incompatible
     statements (no `_supabase` variant needed) ✓
2. **Read** `tests/message-template-catalog.test.ts` end-to-end.
   - `CITATIONS_DEFAULT` constant (line 30) matches the new default
     byte-for-byte ✓
   - T10 placeholders assertion (line 109) is
     `['nombre', 'fecha', 'hora']` ✓
   - T24–T27 present and assert exactly what the acceptance contract
     says (labels, byte-identical absences, idempotency, GET
     reflection) ✓
   - `grep -n CITATIONS_DEFAULT tests/notification-templates.test.ts`
     returns nothing — the constant lives only in
     `message-template-catalog.test.ts`, confirming the implementer's
     note that file did not need editing ✓
3. **Re-ran** `pnpm run build` → exit 0, no output other than `$ tsc`.
4. **Re-ran** the test suite with the spec'd `DATABASE_URL`:
   ```
   # tests 28
   # suites 0
   # pass 28
   # fail 0
   # cancelled 0
   # skipped 0
   # todo 0
   # duration_ms 4040.154305
   ```
5. **Queried** the live DB via `docker exec postgres psql`:
   - `message_template_actions`:
     - `absences` → 4 placeholders, original
       `'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}...'` ✓
     - `citations` → 3 placeholders, new
       `'Estimado representante, se le cita a la institución el {{fecha}} a las {{hora}} para tratar un asunto relacionado con {{nombre}}. Por favor confirmar asistencia.'` ✓
   - `citations` placeholder labels:
     `nombre → Nombre del estudiante`, `fecha → Fecha de la citación`,
     `hora → Hora de la citación` ✓
6. **Read** `progress/impl_citation_template_separate_hora_placeholder.md`
   — has Outcome, Scope, Verification (raw `psql` output + build + test
   output), Acceptance traceability table, and reviewer notes. Evidence
   is real, not narrated.

## Git state

- `git rev-parse HEAD` = `1cc71da` (same as `origin/staging`); no
  commit, no push by the implementer.
- `git status --porcelain` from the repo root shows only the expected
  modified/new files:
  ```
   M backend/tests/message-template-catalog.test.ts
  ?? backend/progress/impl_citation_template_separate_hora_placeholder.md
  ?? harness.db
  ?? postgres/25_citation_template_hora.sql
  ```
  `harness.db` is the harness's own state file (excluded by
  `install.sh`'s `.git/info/exclude`), not part of the change set.
- `git diff -- backend/tests/notification-templates.test.ts` is empty —
  implementer correctly left that file alone.
- `git diff --stat -- backend/src/` is empty — no service / controller
  / entity code touched.

## Acceptance traceability

| Criterion | Where covered | Where verified |
|---|---|---|
| A — new migration file `postgres/25_citation_template_hora.sql`, only UPDATEs (no `_supabase` variant needed) | The file itself | Read end-to-end; lines 19–32, only UPDATEs |
| B — `citations` `placeholders` becomes `[nombre, fecha, hora]` with spec'd labels; `default_template` is the new text; `absences` row untouched | T24 (`tests/message-template-catalog.test.ts:457`) | Live DB `psql` shows `citations=3 placeholders, new default`, `absences=4 placeholders, original default` |
| C — legacy `user_message_templates` rows with `action_key='citations'` containing `{{fecha}}` but not `{{hora}}` get rewritten to `{{fecha}} a las {{hora}}` | T25 (`tests/message-template-catalog.test.ts:501`) | Test run `pass 28, fail 0` |
| D — migration is idempotent (running twice produces no further diff) | T24 (catalog apply twice) + T26 (user rows apply twice + final `LIKE/NOT LIKE` query) | Test run `pass 28, fail 0` |
| E — `GET /api/notification-templates` returns the new citations shape | T27 (`tests/message-template-catalog.test.ts:600`) | Test run `pass 28, fail 0` |

## Notes for the leader

- No defects found. The implementer hit the brief cleanly.
- The catalog UPDATE targets a single PK row (citations) and the
  user-row UPDATE is guarded by `template NOT LIKE '%{{hora}}%'`, so
  re-running the migration is a no-op overwrite. Both
  `UPDATE 1 / UPDATE 1` (catalog) and `UPDATE 0 / UPDATE 0` (user
  rows) on a second apply are the correct idempotent behavior — the
  psql output in the implementer's handoff shows this exactly.
- `absences` is provably byte-identical (T24 snapshots before the
  migration and `assert.equal`s `defaultTemplate` +
  `JSON.stringify(placeholders)` after). The acceptance criterion
  for "absences untouched" is met.
- The `migrationPath()` helper was generalized from `()` to
  `(filename: string)` so T24–T27 share the same lookup pattern as
  T10. The change is small and the new signature is required for the
  new tests to find migration 25. No risk to existing T10–T23.
- The user-row `REPLACE(template, '{{fecha}}', '{{fecha}} a las {{hora}}')`
  expands every occurrence of `{{fecha}}` if a row has more than one.
  This is the documented semantic of the migration and the guard
  `template NOT LIKE '%{{hora}}%'` means a user who has already
  converted any occurrence is left alone, which is the right
  behavior for the "already updated" case. Implementer flagged this
  in their notes; nothing to act on now.
