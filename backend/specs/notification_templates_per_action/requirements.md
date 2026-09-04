# Requirements — Per-action WhatsApp notification templates

Context: `users.notification_template` (single TEXT column, added in
`postgres/02_auth_schema.sql`, read/written today only through
`GET/PUT /api/auth/me`) hardcodes exactly one WhatsApp message template per
user, always implicitly for the absences flow (`frontend/.../absences.component.ts`
builds the WhatsApp message from it). This feature replaces it with a
generic `(user_id, action_key) -> template` table so a second module
(citations) can get its own configurable template without another schema
change.

## R1
The system SHALL persist per-user, per-action WhatsApp message templates in
a `user_message_templates` table with columns `user_id`, `action_key`,
`template`, uniquely constrained on `(user_id, action_key)`.

## R2
WHEN the `user_message_templates` backfill migration runs, the system SHALL
insert exactly one row per user whose existing `users.notification_template`
value is non-null and non-blank (after trimming), with `action_key =
'absences'` and `template` equal to that user's existing
`notification_template` value.

## R3
The system SHALL drop the `users.notification_template` column as part of
the same migration, after the backfill insert has run.

## R4
The system SHALL expose a `NOTIFICATION_ACTION_KEYS` whitelist constant in
`src/services/user.service.ts`, containing at least `'absences'` and
`'citations'`, following the same pattern as the existing `MODULE_KEYS`
constant in that file.

## R5
WHEN an authenticated user sends `GET /api/notification-templates`, the
system SHALL respond `200` with a JSON array of that user's own saved
templates (each item shaped `{ actionKey, template }`), scoped strictly to
`req.user.id`, and SHALL respond with an empty array if the user has no
saved templates.

## R6
WHEN an authenticated user sends `PUT /api/notification-templates` with a
body `{ actionKey, template }` where `actionKey` is a member of
`NOTIFICATION_ACTION_KEYS` and `template` is a non-empty string, the system
SHALL create the row for that user/`actionKey` if none exists, or update the
existing row's `template` if one does, and SHALL respond `200` with the
saved `{ actionKey, template }`.

## R7
IF `PUT /api/notification-templates` is sent with an `actionKey` that is not
a member of `NOTIFICATION_ACTION_KEYS` THEN the system SHALL respond `400`
and SHALL NOT create or modify any `user_message_templates` row.

## R8
IF `PUT /api/notification-templates` is sent with a missing, non-string, or
blank (after trimming) `template` THEN the system SHALL respond `400` and
SHALL NOT create or modify any `user_message_templates` row.

## R9
IF `GET /api/notification-templates` or `PUT /api/notification-templates`
is called without a valid JWT THEN the system SHALL respond `401` and SHALL
NOT read or write any `user_message_templates` row.

## R10
IF a `PUT /api/notification-templates` request body includes a `userId`
and/or `id` field THEN the system SHALL ignore both and SHALL always target
the row for `req.user.id`, never a client-supplied user id.

## R11
WHEN `PUT /api/notification-templates` is called twice for the same
authenticated user with the same `actionKey`, the system SHALL update the
existing `user_message_templates` row in place (no duplicate row), such
that a subsequent `GET /api/notification-templates` returns exactly one
entry for that `actionKey`.

## R12
The system SHALL NOT reference `notificationTemplate` in the request or
response bodies of `GET /api/auth/me` or `PUT /api/auth/me`.

## R13
The system SHALL define a `UserMessageTemplate` TypeORM entity mapped to
the `user_message_templates` table, exposing camelCase properties
(`userId`, `actionKey`, `template`, `createdAt`, `updatedAt`) per this
project's entity naming convention (`docs/conventions.md`).
