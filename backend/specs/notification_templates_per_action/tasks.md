# Tasks — Per-action WhatsApp notification templates

- [ ] T1 (R1, R2, R3) Write `postgres/20_notification_templates_per_action.sql`:
      create `user_message_templates` (with `UNIQUE(user_id, action_key)`
      and an index on `user_id`), backfill from
      `users.notification_template` under `action_key = 'absences'` (only
      non-null/non-blank values), then drop the `users.notification_template`
      column.
- [ ] T2 (R13) Add `src/entities/UserMessageTemplate.ts` (TypeORM entity,
      camelCase properties, `@Unique(['userId', 'actionKey'])`).
- [ ] T3 (R1, R13) Remove the `notificationTemplate` column from
      `src/entities/User.ts`.
- [ ] T4 (R4) Add `NOTIFICATION_ACTION_KEYS` (`['absences', 'citations']`)
      to `src/services/user.service.ts`, next to `MODULE_KEYS`.
- [ ] T5 (R5, R6, R7, R8, R10, R11) Add `src/services/notification-template.service.ts`
      with `findAllForUser(userId)` and `upsert(userId, actionKey, template)`
      (validates `actionKey` against `NOTIFICATION_ACTION_KEYS` and
      `template` non-blank, both as `Object.assign(new Error(...), { status: 400 })`;
      upserts in place keyed on `(userId, actionKey)`).
- [ ] T6 (R5, R6, R9, R10) Add `src/controllers/notification-template.controller.ts`
      (`GET /` → `findAllForUser(req.user!.id)`, `PUT /` →
      `upsert(req.user!.id, req.body.actionKey, req.body.template)`; no
      `requireInstitution`/`requirePermission`, mirroring `/auth/me`).
- [ ] T7 (R5, R6, R9) Mount the new controller at `/notification-templates`
      in `src/routes/index.ts`, in the standard authenticated block.
- [ ] T8 (R12) Remove `notificationTemplate` from `getMe`'s response and
      from `updateMe`'s accepted fields in `src/services/auth.service.ts`.
- [ ] T9 (R5, R9) Add a test covering `GET /api/notification-templates`:
      401 without a token; 200 with `[]` for a user with no saved
      templates; 200 with only that user's own rows when other users have
      templates too.
- [ ] T10 (R6, R11) Add a test covering `PUT /api/notification-templates`
      happy path: first call creates a row (`200`, echoes
      `{ actionKey, template }`); a second call with the same `actionKey`
      updates it in place (subsequent `GET` still returns exactly one entry
      for that `actionKey`, with the latest `template`).
- [ ] T11 (R7) Add a test asserting `PUT /api/notification-templates` with
      an `actionKey` outside `NOTIFICATION_ACTION_KEYS` responds `400` and
      leaves the table unchanged (no row created).
- [ ] T12 (R8) Add a test asserting `PUT /api/notification-templates` with
      a missing/blank `template` responds `400` and leaves the table
      unchanged.
- [ ] T13 (R10) Add a test asserting a `userId`/`id` field in the `PUT`
      body is ignored — the row is created/updated for the authenticated
      requester, not the client-supplied id.
- [ ] T14 (R2, R3) Add a migration-level test/check: after running
      `20_notification_templates_per_action.sql` against a seeded user with
      a non-blank `notification_template`, `user_message_templates`
      contains a matching `action_key = 'absences'` row and
      `users.notification_template` no longer exists as a column.
- [ ] T15 (R12) Add a test asserting `GET /api/auth/me`'s response body has
      no `notificationTemplate` key, and that `PUT /api/auth/me` with a
      `notificationTemplate` field in the body does not error but also has
      no persisted effect (field is simply ignored, same as any other
      unrecognized field already is).
