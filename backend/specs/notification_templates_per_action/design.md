# Design — Per-action WhatsApp notification templates

## Files to touch

### New
- `postgres/20_notification_templates_per_action.sql` — migration: create
  `user_message_templates`, backfill from `users.notification_template`,
  drop that column. Continues the existing numbering (`19_...` is the
  current highest file in `postgres/`).
- `src/entities/UserMessageTemplate.ts` — new TypeORM entity.
- `src/services/notification-template.service.ts` — `findAllForUser`,
  `upsert`.
- `src/controllers/notification-template.controller.ts` — thin router,
  `GET /` + `PUT /`.

### Edited
- `src/entities/User.ts` — remove the `notificationTemplate` column
  (`@Column({ name: 'notification_template', ... })`).
- `src/services/user.service.ts` — add `NOTIFICATION_ACTION_KEYS` export,
  placed next to the existing `MODULE_KEYS` export (same file, same
  whitelist-constant pattern; acceptance criteria fixes this location even
  though the constant is consumed from a different service — see
  "Discarded alternatives").
- `src/services/auth.service.ts` — remove `notificationTemplate` from
  `getMe`'s returned object and from `updateMe`'s `Partial<{...}>` param
  type / assignment block.
- `src/routes/index.ts` — import and mount the new controller as
  `router.use('/notification-templates', notificationTemplateRouter)`,
  inside the existing standard block (after `authMiddleware` +
  `institutionMiddleware`, alongside every other resource router).

## Migration (`20_notification_templates_per_action.sql`)

Follows the convention used since migration 16 (`SET search_path TO
attendance, public;` at the top, unqualified table names — no separate
`_supabase` variant needed; only migrations before 16 used the
schema-qualified dual-file pattern, see `08_user_courses_academic_year*.sql`
/ `09_justification_attachments*.sql`).

```sql
SET search_path TO attendance, public;

CREATE TABLE IF NOT EXISTS user_message_templates (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    action_key  VARCHAR(50) NOT NULL,
    template    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, action_key)
);

CREATE INDEX IF NOT EXISTS idx_user_message_templates_user
    ON user_message_templates(user_id);

INSERT INTO user_message_templates (user_id, action_key, template)
SELECT id, 'absences', notification_template
FROM users
WHERE notification_template IS NOT NULL
  AND trim(notification_template) <> ''
ON CONFLICT (user_id, action_key) DO NOTHING;

ALTER TABLE users DROP COLUMN IF EXISTS notification_template;
```

Mirrors `user_modules` (`07_user_modules.sql`): `SERIAL PRIMARY KEY`,
`INTEGER NOT NULL REFERENCES users(id)` (no `ON DELETE CASCADE`, matching
every other `users(id)` FK in this schema), `UNIQUE(user_id, <key>)`, one
index on `user_id`. `template` is `TEXT NOT NULL` rather than nullable —
a row only exists when the user has actually customized that action's
template (see "GET response shape" below), so there is no meaningful
"row exists but template is null" state to represent.

## Entity (`UserMessageTemplate.ts`)

```ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('user_message_templates')
@Unique(['userId', 'actionKey'])
export class UserMessageTemplate {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id', type: 'integer' })
  userId!: number;

  @Column({ name: 'action_key', type: 'varchar', length: 50 })
  actionKey!: string;

  @Column({ type: 'text' })
  template!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
```

Same shape as `UserModule.ts` (`@Unique(['userId', 'moduleKey'])`), plus
`@UpdateDateColumn` since, unlike `user_modules`, a row here is genuinely
updated in place (R11) rather than deleted-and-reinserted.

## Service (`notification-template.service.ts`)

```ts
import { AppDataSource } from '../data-source';
import { UserMessageTemplate } from '../entities/UserMessageTemplate';
import { NOTIFICATION_ACTION_KEYS } from './user.service';

const repo = () => AppDataSource.getRepository(UserMessageTemplate);

export async function findAllForUser(userId: number) {
  const rows = await repo().find({ where: { userId }, order: { actionKey: 'ASC' } });
  return rows.map(r => ({ actionKey: r.actionKey, template: r.template }));
}

export async function upsert(userId: number, actionKey: unknown, template: unknown) {
  if (typeof actionKey !== 'string' || !NOTIFICATION_ACTION_KEYS.includes(actionKey)) {
    throw Object.assign(new Error(`Acción inválida: ${actionKey}`), { status: 400 });
  }
  if (typeof template !== 'string' || !template.trim()) {
    throw Object.assign(new Error('template es requerido'), { status: 400 });
  }

  let row = await repo().findOne({ where: { userId, actionKey } });
  row = row ? Object.assign(row, { template }) : repo().create({ userId, actionKey, template });
  const saved = await repo().save(row);
  return { actionKey: saved.actionKey, template: saved.template };
}
```

Validation lives in the service (not the controller), mirroring
`user.service.ts`'s `setModules` (`MODULE_KEYS.includes` check inside the
service, thrown as `Object.assign(new Error(...), { status: 400 })`) —
see `docs/conventions.md`'s error-handling section.

## Controller (`notification-template.controller.ts`)

```ts
import { Router } from 'express';
import * as svc from '../services/notification-template.service';

const router = Router();

router.get('/', async (req, res) => {
  res.json(await svc.findAllForUser(req.user!.id));
});

router.put('/', async (req, res) => {
  res.json(await svc.upsert(req.user!.id, req.body.actionKey, req.body.template));
});

export default router;
```

No `requireInstitution`/`requirePermission` — this resource has no
institution scope and no admin-facing counterpart to gate via
`role_permissions`; every user only ever touches their own row, the same
shape as `GET/PUT /api/auth/me` and `PUT /api/auth/me/password`. `req.body`
is passed straight through positionally rather than destructured+typed at
the controller boundary, matching every other controller in this codebase
(no `class-validator` wiring exists — see `docs/architecture.md` §2); the
service is the actual validation boundary (R7/R8/R10).

## Mount point

Acceptance criteria fixes the path at `/api/notification-templates`, not
nested under `/auth` (unlike `/auth/me/avatar`, another user-owned,
self-service setting). Mounted in the standard block of `routes/index.ts`
(after `authMiddleware` + `institutionMiddleware`, alongside every other
resource router) rather than inside `auth.controller.ts`, so it reads as
its own resource module — consistent with "one controller/service pair per
resource" (`docs/architecture.md` §1) rather than growing `auth.controller.ts`
with an unrelated concern. `institutionMiddleware` still runs ahead of it
(unavoidable given the shared mount block) but its output
(`req.institutionId`/`req.courseIds`) is simply unused by this resource,
same as it's unused by e.g. `dashboard.controller.ts` routes that don't
call `requireInstitution`.

## `auth.service.ts` changes

`getMe` drops the `notificationTemplate: user.notificationTemplate,` line.
`updateMe`'s parameter type drops `notificationTemplate: string` from the
`Partial<{...}>`, and its body drops the
`if (data.notificationTemplate !== undefined) ...` line. No other change to
`auth.service.ts`/`auth.controller.ts` — `PUT /api/auth/me` keeps accepting
its other fields (`fullName`, `email`, `title`, `signatureLabel`)
unchanged.

## Discarded alternatives

1. **Add an `action_key` column directly to `users` instead of a child
   table**, keeping one row per `(user, action)` by... not being able to,
   since `users` must stay one row per user (every other service —
   `findById`, `update`, `getSigners`, etc. — assumes exactly one `users`
   row per user id). Rejected: a child table mirroring the existing
   `user_modules`/`user_courses` pattern is the only way to have a variable
   number of templates per user without breaking that invariant everywhere
   else in the codebase.
2. **Gate `PUT /api/notification-templates` with
   `requirePermission('notification-templates', 'update')`**, matching the
   controller shape used by admin-facing resources (`user.controller.ts`,
   etc.). Rejected: `role_permissions` models what one user may do to
   *another user's/the institution's* data; there is no such cross-user
   access pattern here — every request is scoped to `req.user.id` only, the
   same shape `/api/auth/me` already uses without any permission check.
   Adding a permission row for this resource with no way to ever act on
   anyone else's data would be pure ceremony.
3. **Put `NOTIFICATION_ACTION_KEYS` in the new
   `notification-template.service.ts`** instead of `user.service.ts`.
   Rejected in favor of matching the acceptance criteria exactly (which
   names `user.service.ts`, mirroring `MODULE_KEYS`'s location) — flagged
   in the report back to the human reviewer, since it does mean
   `notification-template.service.ts` cross-imports a constant from a
   sibling service, a pattern with no prior precedent in this codebase
   (`MODULE_KEYS` today is only ever used inside `user.service.ts` itself).
4. **Represent "no custom template" as a nullable `template` column** (row
   always exists, `template IS NULL` = "use default") instead of "row
   absent = use default". Rejected: it would require pre-creating a row per
   `(user, action_key)` combination up front (or lazily on first login),
   adding write traffic and a migration-time full cross-join backfill for
   every existing user × every current/future action key, for no behavioral
   difference over simply omitting the row — `GET` already naturally
   returns `[]`/omits an entry when nothing has been customized (R5).
