# Design — Message template action catalog

## Relationship to feature 8 (`notification_templates_per_action`)

This feature builds on feature 8 and deliberately supersedes two of its
requirements:

- Feature 8 **R4** (`NOTIFICATION_ACTION_KEYS` in `user.service.ts`) — the
  constant is removed (R6 here); the catalog table replaces it.
- Feature 8 **R5** (`GET` returns only the user's saved rows as
  `{ actionKey, template }`) — replaced by R7–R12 here.

Feature 8's other behaviors (PUT upsert-in-place, 400 on blank template,
401 without JWT, ignoring `userId`/`id` in the body, migration 20,
`/api/auth/me` no longer exposing `notificationTemplate`) are unchanged and
remain covered by `tests/notification-templates.test.ts`, whose shape
assertions get updated in T13.

## Breaking change / coordination with frontend feature 43

The `GET /api/notification-templates` response shape changes. **This is
coordinated with frontend feature 43 (`profile_whatsapp_templates_tab`)**,
which will consume the new shape (`label`, `placeholders`, `defaultTemplate`,
`isCustom`), drop the frontend's `DEFAULT_TEMPLATES` constant and the
hardcoded placeholder chips in `profile.component.ts`, and call the new
`DELETE` to restore a default.

| | Before (feature 8) | After (this feature) |
|---|---|---|
| `GET` body | `[{ actionKey, template }]` — only actions the user customized; `[]` if none | One item per **active catalog action**, always: `[{ actionKey, label, description, placeholders, defaultTemplate, template, isCustom }]` |
| `PUT` body | `{ actionKey, template }` | Same R7 item (superset of the old body — `actionKey`/`template` still present) |
| `DELETE /:actionKey` | — | New |

What happens to the **current** frontend (pre-43) against the new backend:
`NotificationTemplateService.load()` builds `map[actionKey] = template` from
the list; with the new shape every active action is present, so `template`
is now the server default for non-customized actions — WhatsApp messages
keep working. `profile.component.ts`, however, does
`templates.find(t => t.actionKey === 'absences')` and treats any hit as "the
user saved this", so it will present the default as if it were the user's
own template (it can no longer tell custom from default without reading
`isCustom`). That is the break; it is semantic, not a crash, and frontend
feature 43 resolves it. Old-frontend `PUT` calls keep working because the
new `PUT` body is a superset.

**Deploy order:** run the FK pre-check (see "Foreign key (R23)"), then
apply `postgres/24_message_template_actions.sql` **before**
deploying this backend (the service now reads `message_template_actions`;
without the table, all three endpoints return 500). Frontend feature 43 is
deployed after this backend. Per the deploy convention, migration steps are
run manually, step by step.

## Files to touch

### New
- `postgres/24_message_template_actions.sql` — create + seed the catalog,
  then add the FK `user_message_templates.action_key →
  message_template_actions.action_key` (R23). Highest existing file is
  `23_citation_guardian_conflict*.sql`.
- `src/entities/MessageTemplateAction.ts` — TypeORM entity (R22).
- `tests/message-template-catalog.test.ts` — tests for this feature.
- `tests/helpers/test-template-actions.ts` — create/delete throwaway catalog
  rows (`action_key LIKE 'testaction\_%'`) for ordering/inactive tests.

### Edited
- `src/services/notification-template.service.ts` — catalog-backed
  `findAllForUser`, `upsert`; new `restoreDefault`.
- `src/controllers/notification-template.controller.ts` — add
  `DELETE /:actionKey`.
- `src/services/user.service.ts` — delete the `NOTIFICATION_ACTION_KEYS`
  export (R6). `MODULE_KEYS` stays.
- `tests/notification-templates.test.ts` — update shape assertions that
  feature 8 wrote against the old `GET`/`PUT` bodies (T9.b, T9.c, T10, T13).
- `tests/run.sh` — compile the new test file + helper, run both test files,
  serially (see "Test isolation").

No change to `src/routes/index.ts` — the router is already mounted at
`/notification-templates` in the authenticated block, so the new `DELETE`
route inherits `authMiddleware` (R21) automatically.

## Migration (`24_message_template_actions.sql`)

Same convention as migrations 16+ (`SET search_path TO attendance, public;`,
unqualified names, no `_supabase` variant needed).

```sql
SET search_path TO attendance, public;

CREATE TABLE IF NOT EXISTS message_template_actions (
    action_key        VARCHAR(50) PRIMARY KEY,
    label             VARCHAR(100) NOT NULL,
    description       TEXT,
    placeholders      JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_template  TEXT NOT NULL,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    active            BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO message_template_actions
    (action_key, label, description, placeholders, default_template, sort_order, active)
VALUES
    ('absences',
     'Faltas y atrasos',
     'Mensaje de WhatsApp al representante cuando el estudiante registra una falta o un atraso.',
     '[{"key":"nombre","label":"Nombre del estudiante"},
       {"key":"fecha","label":"Fecha"},
       {"key":"tipo","label":"Tipo (falta o atraso)"},
       {"key":"curso","label":"Curso"}]'::jsonb,
     'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.',
     10, TRUE),
    ('citations',
     'Citaciones',
     'Mensaje de WhatsApp al representante para notificar una citación.',
     '[{"key":"nombre","label":"Nombre del estudiante"},
       {"key":"fecha","label":"Fecha y hora de la citación"}]'::jsonb,
     'Estimado apoderado, se ha registrado una citación para {{nombre}} el {{fecha}}. Por favor confirmar asistencia.',
     20, TRUE)
ON CONFLICT (action_key) DO NOTHING;

ALTER TABLE user_message_templates
    DROP CONSTRAINT IF EXISTS fk_user_message_templates_action;
ALTER TABLE user_message_templates
    ADD CONSTRAINT fk_user_message_templates_action
    FOREIGN KEY (action_key) REFERENCES message_template_actions(action_key);
```

### Foreign key (R23)

`user_message_templates.action_key` references the catalog, so integrity
no longer depends only on the service validating writes. Details:

- It is added **after** the seed, so every existing row (`absences` /
  `citations`, the only keys feature 8's whitelist ever allowed) already
  has a parent.
- `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` keeps the file re-runnable
  (R5) — Postgres has no `ADD CONSTRAINT IF NOT EXISTS`.
- No `ON DELETE CASCADE`, matching every other FK in this schema: a catalog
  action is retired with `active = false`, never deleted, so users' saved
  templates survive and come back if the action is reactivated. Deleting a
  catalog row that still has templates is refused by the DB, which is the
  intended guard.
- The existing `UNIQUE(user_id, action_key)` index (leading column
  `user_id`) does not serve lookups by `action_key`; none of this feature's
  queries need one, and the table is tiny, so no extra index is added.
- **Pre-check before applying in production** (deploy step, run manually):
  `SELECT DISTINCT action_key FROM user_message_templates WHERE action_key NOT IN ('absences','citations');`
  must return zero rows. If it doesn't, the `ADD CONSTRAINT` fails and the
  whole file aborts — stop and report rather than deleting rows.

### Seed source of truth (R2, R3)

The two `default_template` strings are copied **verbatim** from
`frontend/src/app/core/services/notification-template.service.ts`
(`DEFAULT_TEMPLATES`) as of this spec. The `citations` one is written there
as a `+`-concatenation of two literals; the concatenated value is:

- `absences`: `Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.`
- `citations`: `Estimado apoderado, se ha registrado una citación para {{nombre}} el {{fecha}}. Por favor confirmar asistencia.`

The placeholder keys match exactly what the frontend substitutes today:
`absences.component.ts` `notifyGuardian` replaces `nombre`/`fecha`/`tipo`/
`curso`; `citations.component.ts` `notifyGuardian` replaces `nombre`/`fecha`
(R4). Labels and descriptions are new UI copy for feature 43.

### Idempotency (R5)

`CREATE TABLE IF NOT EXISTS` + `ON CONFLICT (action_key) DO NOTHING`. `DO
NOTHING` (not `DO UPDATE`) so re-running the file never clobbers a catalog
row someone adjusted in the DB; changing a default later is a new numbered
migration with an explicit `UPDATE`.

### Column naming note

The flag is `active`, as specified for this feature, not `is_active` like
`citations`/`citation_reasons`. The catalog has no soft-delete
(`deleted_at`), so `active` is a plain visibility toggle, not the
soft-delete pair those tables use.

## Entity (`MessageTemplateAction.ts`)

```ts
import { Entity, PrimaryColumn, Column } from 'typeorm';

export interface MessageTemplatePlaceholder {
  key: string;
  label: string;
}

@Entity('message_template_actions')
export class MessageTemplateAction {
  @PrimaryColumn({ name: 'action_key', type: 'varchar', length: 50 })
  actionKey!: string;

  @Column({ type: 'varchar', length: 100 })
  label!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  placeholders!: MessageTemplatePlaceholder[];

  @Column({ name: 'default_template', type: 'text' })
  defaultTemplate!: string;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}
```

## Service (`notification-template.service.ts`)

```ts
import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { UserMessageTemplate } from '../entities/UserMessageTemplate';
import { MessageTemplateAction } from '../entities/MessageTemplateAction';

const repo = () => AppDataSource.getRepository(UserMessageTemplate);
const actionRepo = () => AppDataSource.getRepository(MessageTemplateAction);

function toItem(action: MessageTemplateAction, custom: string | null) {
  return {
    actionKey: action.actionKey,
    label: action.label,
    description: action.description,
    placeholders: action.placeholders,
    defaultTemplate: action.defaultTemplate,
    template: custom ?? action.defaultTemplate,
    isCustom: custom !== null,
  };
}

async function findActiveAction(actionKey: unknown) {
  if (typeof actionKey !== 'string') return null;
  return actionRepo().findOne({ where: { actionKey, active: true } });
}

export async function findAllForUser(userId: number) {
  const actions = await actionRepo().find({
    where: { active: true },
    order: { sortOrder: 'ASC', actionKey: 'ASC' },
  });
  const rows = await repo().find({
    where: { userId, actionKey: In(actions.map(a => a.actionKey)) },
  });
  const byKey = new Map(rows.map(r => [r.actionKey, r.template]));
  return actions.map(a => toItem(a, byKey.get(a.actionKey) ?? null));
}

export async function upsert(userId: number, actionKey: unknown, template: unknown) {
  const action = await findActiveAction(actionKey);
  if (!action) {
    throw Object.assign(new Error(`Acción inválida: ${actionKey}`), { status: 400 });
  }
  if (typeof template !== 'string' || !template.trim()) {
    throw Object.assign(new Error('template es requerido'), { status: 400 });
  }

  let row = await repo().findOne({ where: { userId, actionKey: action.actionKey } });
  row = row ? Object.assign(row, { template }) : repo().create({ userId, actionKey: action.actionKey, template });
  const saved = await repo().save(row);
  return toItem(action, saved.template);
}

export async function restoreDefault(userId: number, actionKey: string) {
  const action = await findActiveAction(actionKey);
  if (!action) {
    throw Object.assign(new Error(`Acción no encontrada: ${actionKey}`), { status: 404 });
  }
  await repo().delete({ userId, actionKey: action.actionKey });
  return toItem(action, null);
}
```

Notes:
- Validation stays in the service (`docs/conventions.md` error handling),
  same as feature 8. `PUT` validates `actionKey` before `template`, as today.
- Unknown and inactive `actionKey` both produce the same `400` on `PUT`
  (R14/R15) and the same `404` on `DELETE` (R19) — the client cannot act on
  an inactive action either way, so there is no reason to tell them apart.
- `PUT` → `400` vs `DELETE` → `404` for the same bad key is intentional:
  on `PUT` the key is a body field (invalid input); on `DELETE` it is the
  resource identifier in the path (resource not found).
- `restoreDefault` is idempotent (R18): `repo().delete` on zero matching
  rows is a no-op.
- The `In(...)` filter on `findAllForUser` keeps rows for inactive actions
  out of the merge (R12) — they simply never match an item.
- `Acción inválida`/`template es requerido` messages are unchanged from
  feature 8.

## Controller (`notification-template.controller.ts`)

```ts
router.get('/', async (req, res) => {
  res.json(await svc.findAllForUser(req.user!.id));
});

router.put('/', async (req, res) => {
  res.json(await svc.upsert(req.user!.id, req.body.actionKey, req.body.template));
});

router.delete('/:actionKey', async (req, res) => {
  res.json(await svc.restoreDefault(req.user!.id, req.params.actionKey));
});
```

Still no `requireInstitution`/`requirePermission` — same reasoning as
feature 8's design (every request is scoped to `req.user.id`; nothing
cross-user to gate). The catalog itself is global (not per institution):
the set of notifiable actions is a property of the product, not of a
tenant.

## Test plan

Both test files follow the existing pattern: `node:test` +
`assert/strict`, real HTTP via `startTestApp()`, users via
`createTestUser`, DB inspection via `tests/helpers/*`.

### New helper (`tests/helpers/test-template-actions.ts`)

```ts
export async function createTestAction(opts: {
  suffix: string; sortOrder?: number; active?: boolean; defaultTemplate?: string;
}): Promise<MessageTemplateAction>  // action_key = `testaction_${suffix}`
export async function deleteTestActions(): Promise<void>  // action_key LIKE 'testaction\_%'
```

Called in `before`/`beforeEach`/`after` like `deleteTestTemplates`. Because
of the FK (R23), `deleteTestActions()` first deletes every
`user_message_templates` row whose `action_key LIKE 'testaction\_%'`, then
the catalog rows — so cleanup order between helpers doesn't matter.

### Test isolation

`node --test` runs each file in its own process **concurrently** by
default. The catalog tests insert `testaction_*` rows that would otherwise
show up mid-run in `notification-templates.test.ts`'s `GET` assertions.
`tests/run.sh` therefore runs with `--test-concurrency=1`. GET assertions
in both files compare against the DB's active catalog rows (queried in the
test), never a hardcoded count of `2`, so they also survive a future
migration adding an action.

### Migration tests

Same approach as feature 8's T14: locate
`postgres/24_message_template_actions.sql` relative to the test, execute it
verbatim with `AppDataSource.query`. Run it twice (R5), then assert the
seeded rows (R2–R4). The seeded rows are not deleted afterwards — they are
real catalog data the app needs.

### Requirement → test grouping

Several requirements are checked by one test where the same request
exercises all of them (per `docs/specs.md` "Coverage granularity"):

| Test | Requirements |
|---|---|
| migration runs twice, seed rows correct | R1, R2, R3, R4, R5 |
| no `NOTIFICATION_ACTION_KEYS` under `src/` (fs scan) | R6 |
| GET item shape + defaults for a fresh user | R7, R10 |
| GET ordering (sort_order, then action_key tie-break) | R8 |
| GET custom vs default, two users | R9, R11 |
| GET omits inactive action even with saved row | R12 |
| PUT happy path + in place + response shape | R13 |
| PUT unknown / inactive / blank template → 400, no write | R14, R15, R16 |
| DELETE restores default; idempotent; 404s; other user untouched | R17, R18, R19, R20 |
| 401 on GET/PUT/DELETE without token | R21 |
| entity metadata column mapping | R22 |
| direct insert with unknown `action_key` rejected by FK | R23 |

## Discarded alternatives

1. **Keep the catalog in code** (turn `NOTIFICATION_ACTION_KEYS` into an
   array of `{ key, label, placeholders, defaultTemplate }` objects in
   `user.service.ts`). Rejected: the point of the feature is that the
   backend's DB is the single source of truth the frontend reads from;
   a code constant still needs a deploy to add/retire an action, can't be
   toggled with `active`, and the frontend would still need its own copy
   of defaults unless exposed via an endpoint anyway — at which point the
   table is the simpler home.
2. **Return `{ actions: [...], templates: [...] }` from `GET`** and let the
   client merge. Rejected: every consumer would re-implement "custom else
   default" resolution; doing it once on the server (`toItem`) keeps
   `isCustom` authoritative and makes `DELETE`'s response the same shape.
3. **`DELETE` responds `204 No Content`.** Rejected: the client needs the
   default text right after restoring, so returning the restored item
   (same shape as `PUT`/`GET`) saves a round trip.
4. **Validate that a saved template only uses the action's placeholders.**
   Rejected: out of scope and potentially breaking for already-saved
   templates; unknown `{{x}}` tokens are harmless today (the frontend's
   `.replace` leaves them verbatim).
