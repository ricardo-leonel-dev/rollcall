# Tasks — Message template action catalog

- [x] T1 (R1, R2, R3, R4, R5) Write `postgres/24_message_template_actions.sql`
      exactly as in `design.md`: `CREATE TABLE IF NOT EXISTS
      message_template_actions` (`action_key` PK, `label`, `description`,
      `placeholders jsonb`, `default_template`, `sort_order`, `active`) and
      seed `absences` (sort 10) + `citations` (sort 20) with the verbatim
      frontend defaults and placeholders, `ON CONFLICT (action_key) DO NOTHING`.
- [x] T2 (R23) In the same file, after the seed, add the FK
      `fk_user_message_templates_action` (`DROP CONSTRAINT IF EXISTS` +
      `ADD CONSTRAINT ... REFERENCES message_template_actions(action_key)`).
      Apply it to the local DB (`psql $DATABASE_URL -f ...`) before running
      tests.
- [x] T3 (R22) Add `src/entities/MessageTemplateAction.ts` (with the
      exported `MessageTemplatePlaceholder` interface) per `design.md`.
- [x] T4 (R7, R8, R9, R10, R11, R12) Rewrite `findAllForUser` in
      `src/services/notification-template.service.ts`: active catalog rows
      ordered by `sortOrder`, `actionKey`; merge the user's own rows via
      `toItem` (custom → `isCustom: true`, else default).
- [x] T5 (R13, R14, R15, R16) Change `upsert` to validate `actionKey`
      against an active catalog row (`findActiveAction`, 400 otherwise),
      keep the blank-template 400, and return `toItem(action, saved.template)`.
- [x] T6 (R17, R18, R19, R20) Add `restoreDefault(userId, actionKey)` to the
      service (404 for unknown/inactive key; deletes only the requester's
      row; idempotent) and `router.delete('/:actionKey', ...)` to
      `src/controllers/notification-template.controller.ts`.
- [x] T7 (R6) Delete the `NOTIFICATION_ACTION_KEYS` export from
      `src/services/user.service.ts` and its import from
      `notification-template.service.ts`; `grep -rn NOTIFICATION_ACTION_KEYS src`
      returns nothing.
- [x] T8 (R8, R12, R15, R19, R23) Add `tests/helpers/test-template-actions.ts`
      (`createTestAction`, `deleteTestActions`) per `design.md` —
      `deleteTestActions` removes referencing `user_message_templates` rows
      before the catalog rows.
- [x] T9 (R7, R8, R12) Update `tests/run.sh`: compile `tests/message-template-catalog.test.ts`
      and `tests/helpers/test-template-actions.ts` too, and run both
      compiled test files with `node --test --test-concurrency=1`.
- [x] T10 (R1, R2, R3, R4, R5) Test: run
      `postgres/24_message_template_actions.sql` twice via
      `AppDataSource.query` (no error), then assert exactly one row each
      for `absences`/`citations`, `active = true`, `default_template` equal
      to the verbatim strings in `design.md`, and `placeholders` keys equal
      to `['nombre','fecha','tipo','curso']` / `['nombre','fecha']` with a
      string `label` on every element.
- [x] T11 (R6) Test: recursively read every `.ts` file under `src/` and
      assert none contains `NOTIFICATION_ACTION_KEYS`.
- [x] T12 (R21) Test: `GET /api/notification-templates`,
      `PUT /api/notification-templates`, and
      `DELETE /api/notification-templates/absences` each return `401`
      without a token, and the `PUT`/`DELETE` leave
      `user_message_templates` unchanged for an existing test user's row.
- [x] T13 (R7, R9, R13) Update `tests/notification-templates.test.ts` for
      the new shape: T9.b expects one item per active catalog row (all
      `isCustom: false`) instead of `[]`; T9.c compares only items with
      `isCustom: true`; T10/T13 assert `actionKey`/`template`/`isCustom`
      fields instead of `deepEqual` against the old two-field body. Keep
      every other assertion as is.
- [x] T14 (R7, R10) Test: a fresh user's `GET` returns exactly the active
      catalog keys (queried from the DB), each with all seven fields, and
      for `absences`/`citations` `template === defaultTemplate` and
      `isCustom === false`.
- [x] T15 (R8) Test: create `testaction_b` and `testaction_a` both with
      `sortOrder: -100`, and `testaction_c` with `sortOrder: 15`; assert in
      the `GET` order `testaction_a` < `testaction_b` < `absences` <
      `testaction_c` < `citations`.
- [x] T16 (R9, R11) Test: user A `PUT`s a custom `absences` template; A's
      `GET` returns it with `isCustom: true` and `citations` still default;
      user B's `GET` returns `absences` as default with `isCustom: false`.
- [x] T17 (R12) Test: create an inactive `testaction_off`, insert a
      `user_message_templates` row for it directly via the repository for a
      test user; that user's `GET` contains no item with that `actionKey`.
- [x] T18 (R13) Test: `PUT` creates then updates in place for
      `citations` (one row in the table after two calls); the response is
      the full item with `isCustom: true`, `template` the new text, and
      `defaultTemplate` unchanged.
- [x] T19 (R14, R15, R16) Test: `PUT` with `actionKey: 'nope'`, with an
      inactive `testaction_off`, and with a blank `template` for
      `absences` each return `400`, and the user has zero
      `user_message_templates` rows afterwards.
- [x] T20 (R17, R18, R20) Test: users A and B both `PUT` a custom
      `absences`; A sends `DELETE /api/notification-templates/absences` →
      `200`, body `isCustom: false`, `template === defaultTemplate`; A has
      no `absences` row; B's row is untouched; a second identical `DELETE`
      from A also returns `200` with the same body.
- [x] T21 (R19) Test: `DELETE /api/notification-templates/nope` and
      `DELETE /api/notification-templates/testaction_off` (inactive, with a
      seeded row for the requester) both return `404`, and the seeded row
      still exists.
- [x] T22 (R22) Test: `AppDataSource.getMetadata(MessageTemplateAction)`
      has table name `message_template_actions` and maps `actionKey →
      action_key`, `defaultTemplate → default_template`,
      `sortOrder → sort_order`, plus `label`, `description`,
      `placeholders`, `active`.
- [x] T23 (R23) Test: inserting a `user_message_templates` row for a test
      user with `action_key = 'nope'` directly via the repository rejects
      with a foreign-key violation, and no row is persisted; the FK
      `fk_user_message_templates_action` exists in `information_schema`
      after running the migration twice (also re-checks R5).
- [x] T24 (R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23) Run `bash tests/run.sh`; all tests in both files pass.
