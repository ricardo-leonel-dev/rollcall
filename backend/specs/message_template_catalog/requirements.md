# Requirements — Message template action catalog

Context: feature `notification_templates_per_action` (feature 8) introduced
`user_message_templates` (`user_id`, `action_key`, `template`) and validated
`action_key` against a hardcoded `NOTIFICATION_ACTION_KEYS` constant in
`src/services/user.service.ts`. Everything else about an action — its
human-readable label, which placeholders it supports, and its default
template — lives only in the frontend (`DEFAULT_TEMPLATES` in
`frontend/src/app/core/services/notification-template.service.ts`, and the
placeholder chips hardcoded in `profile.component.ts`). This feature moves
that knowledge into a DB-backed catalog, `message_template_actions`, so the
backend is the single source of truth for which actions exist, what they
look like, and what their default template is; and adds a way for a user to
restore an action's default.

The `GET /api/notification-templates` response shape changes (see R7) —
coordinated with frontend feature 43 (`profile_whatsapp_templates_tab`); see
`design.md` "Breaking change / coordination".

## R1
The system SHALL persist the catalog of notifiable actions in a
`message_template_actions` table with columns `action_key` (primary key),
`label`, `description`, `placeholders` (`jsonb`), `default_template`,
`sort_order`, and `active`.

## R2
WHEN the `message_template_actions` migration runs, the system SHALL ensure
a row exists with `action_key = 'absences'`, `active = true`, and
`default_template` equal to the frontend's current `DEFAULT_TEMPLATES.absences`
string (quoted verbatim in `design.md`).

## R3
WHEN the `message_template_actions` migration runs, the system SHALL ensure
a row exists with `action_key = 'citations'`, `active = true`, and
`default_template` equal to the frontend's current `DEFAULT_TEMPLATES.citations`
string (quoted verbatim in `design.md`).

## R4
WHEN the `message_template_actions` migration runs, the system SHALL seed
`placeholders` for `'absences'` as exactly the keys `nombre`, `fecha`,
`tipo`, `curso` (in that order) and for `'citations'` as exactly the keys
`nombre`, `fecha` (in that order), each element shaped
`{ "key": <string>, "label": <string> }`.

## R5
WHEN the `message_template_actions` migration is run a second time against
a database where it already ran, the system SHALL complete without error and
SHALL leave exactly one row per seeded `action_key`.

## R6
The system SHALL NOT export or reference a `NOTIFICATION_ACTION_KEYS`
constant anywhere under `src/`.

## R7
WHEN an authenticated user sends `GET /api/notification-templates`, the
system SHALL respond `200` with a JSON array containing exactly one item per
`message_template_actions` row with `active = true`, each item shaped
`{ actionKey, label, description, placeholders, defaultTemplate, template, isCustom }`.

## R8
WHEN an authenticated user sends `GET /api/notification-templates`, the
system SHALL order the returned items by `sort_order` ascending, breaking
ties by `action_key` ascending.

## R9
WHILE the requesting user has a `user_message_templates` row for an active
action, the system SHALL return that action's item from
`GET /api/notification-templates` with `template` equal to the user's saved
template and `isCustom = true`.

## R10
WHILE the requesting user has no `user_message_templates` row for an active
action, the system SHALL return that action's item from
`GET /api/notification-templates` with `template` equal to the catalog's
`default_template` and `isCustom = false`.

## R11
The system SHALL compute `template`/`isCustom` in
`GET /api/notification-templates` exclusively from the requesting user's
(`req.user.id`) own `user_message_templates` rows, never another user's.

## R12
IF an action's catalog row has `active = false` THEN the system SHALL omit
that action from `GET /api/notification-templates`, even when the
requesting user has a saved template for it.

## R13
WHEN an authenticated user sends `PUT /api/notification-templates` with
`{ actionKey, template }` where `actionKey` matches an active catalog row
and `template` is a non-blank string, the system SHALL create or update (in
place, no duplicate) that user's row for `actionKey`, and SHALL respond
`200` with that action's item in the R7 shape, with `isCustom = true`.

## R14
IF `PUT /api/notification-templates` is sent with an `actionKey` that does
not match any `message_template_actions` row THEN the system SHALL respond
`400` and SHALL NOT create or modify any `user_message_templates` row.

## R15
IF `PUT /api/notification-templates` is sent with an `actionKey` whose
catalog row has `active = false` THEN the system SHALL respond `400` and
SHALL NOT create or modify any `user_message_templates` row.

## R16
IF `PUT /api/notification-templates` is sent with a missing, non-string, or
blank (after trimming) `template` THEN the system SHALL respond `400` and
SHALL NOT create or modify any `user_message_templates` row.

## R17
WHEN an authenticated user sends `DELETE /api/notification-templates/:actionKey`
for an active catalog action, the system SHALL delete that user's
`user_message_templates` row for `actionKey` if one exists, and SHALL
respond `200` with that action's item in the R7 shape, with `template`
equal to `default_template` and `isCustom = false`.

## R18
WHEN an authenticated user sends `DELETE /api/notification-templates/:actionKey`
for an active catalog action for which the user has no saved row, the
system SHALL respond `200` with the R17 body (idempotent restore).

## R19
IF `DELETE /api/notification-templates/:actionKey` is sent with an
`actionKey` that does not match an active `message_template_actions` row
THEN the system SHALL respond `404` and SHALL NOT delete any
`user_message_templates` row.

## R20
The system SHALL scope `DELETE /api/notification-templates/:actionKey` to
`req.user.id` only, never deleting another user's `user_message_templates`
row.

## R21
IF `GET`, `PUT`, or `DELETE` on `/api/notification-templates` is called
without a valid JWT THEN the system SHALL respond `401` and SHALL NOT read
or write any `user_message_templates` row.

## R22
The system SHALL define a `MessageTemplateAction` TypeORM entity mapped to
the `message_template_actions` table, exposing camelCase properties
(`actionKey`, `label`, `description`, `placeholders`, `defaultTemplate`,
`sortOrder`, `active`) per `docs/conventions.md`.

## R23
IF a `user_message_templates` row is inserted or updated with an
`action_key` that does not exist in `message_template_actions` THEN the
database SHALL reject the write with a foreign-key violation.
