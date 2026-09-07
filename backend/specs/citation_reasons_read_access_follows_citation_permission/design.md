# Design — Citation reasons read access follows citation permission

## Files to touch

### Edited

- `src/middleware/role.middleware.ts` — add a new exported `requireAnyPermission` factory next to
  the existing `requirePermission`. No change to `requirePermission` itself, its `Action` type, or
  any of its 12+ existing call sites — this is purely additive.
- `src/controllers/citation-reason.controller.ts` — change only the `GET /` line to call
  `requireAnyPermission([...])` instead of `requirePermission('citation-reasons', 'read')`. The
  `POST`/`PUT`/`DELETE` lines are untouched.

### Not touched

- `postgres/21_citation_reasons.sql` / `postgres/22_citations_permissions.sql` — no migration. This
  feature changes authorization *logic*, not `role_permissions` data; the whole point is that no
  role needs a new grant.
- `src/entities/RolePermission.ts` — no schema change; `requireAnyPermission` reads the same table
  through the same entity.
- `src/services/citation-reason.service.ts` — `findAll` is unchanged; it already scopes by
  `institutionId`/`courseIds` and doesn't need to know which permission path let the caller in.
- Frontend (`citation-dialog.component.ts`, `admin.component.ts`) — per the feature description, no
  frontend change is required; the dropdown already calls `GET /api/citation-reasons` and will
  simply stop 403-ing for the affected roles once the backend change ships.

## `requireAnyPermission` shape

```ts
type Check = { resource: string; action: Action };

export function requireAnyPermission(checks: Check[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    if (req.user.roleName === 'superadmin') { next(); return; }

    const resources = [...new Set(checks.map(c => c.resource))];
    const repo = AppDataSource.getRepository(RolePermission);
    const perms = await repo.find({
      where: { roleId: req.user.roleId, resource: In(resources) },
    });
    const byResource = new Map(perms.map(p => [p.resource, p]));

    const allowed = checks.some(({ resource, action }) => {
      const perm = byResource.get(resource);
      if (!perm) return false;
      return action === 'read'   ? perm.canRead :
             action === 'create' ? perm.canCreate :
             action === 'update' ? perm.canUpdate :
                                    perm.canDelete;
    });

    if (!allowed) {
      res.status(403).json({ error: 'Sin permisos para este recurso' });
      return;
    }

    next();
  };
}
```

Notes:

- `In` comes from `typeorm` (already imported project-wide elsewhere, e.g. filtering by ids) — add
  it to the existing `typeorm`... actually `RolePermission`/`AppDataSource` imports in this file
  come from `typeorm`'s `Repository` methods, not a direct `typeorm` import today; the implementer
  adds `import { In } from 'typeorm';` alongside the existing imports at the top of
  `role.middleware.ts`.
- One `repo.find(...)` query regardless of how many checks are passed (deduplicated resources via
  `Set`), instead of one `findOne` per check — keeps the DB round-trip count independent of the
  number of OR'd permissions, which matters here since the citation-reasons route ORs three checks
  across two resources.
- The 401/403 response bodies are copied verbatim from `requirePermission` so client-side error
  handling (`errorInterceptor` on the frontend, if any special-cases these strings) doesn't need to
  branch on which middleware produced the response.
- `checks.some(...)` short-circuits on the first satisfied check — order in the array passed by the
  controller has no behavioral effect, only a (negligible) best-case perf one.

## Route wiring (`citation-reason.controller.ts`)

```ts
router.get('/', requireAnyPermission([
  { resource: 'citaciones', action: 'read' },
  { resource: 'citaciones', action: 'create' },
  { resource: 'citation-reasons', action: 'read' },
]), async (req, res) => res.json(await svc.findAll(req.institutionId!, req.courseIds ?? null)));
```

The `POST`/`PUT`/`DELETE` lines keep their existing `requirePermission(R, 'create'|'update'|
'delete')` calls unchanged (R11–R13) — `const R = 'citation-reasons'` stays as-is and is still used
by those three lines; only the `GET` line stops using it as its sole check.

## Discarded alternatives

1. **Grant `citation-reasons:read = TRUE` to `inspector de apoyo`/`inspector general` via a new
   migration** (the "current workaround" the feature description explicitly calls out). Rejected:
   this is exactly what the feature is written to avoid — it conflates "can fill out a citation
   form" with "can administer the reasons catalog" (create/update/delete new reasons), and doesn't
   generalize to any *future* role that gets `citaciones` access without a human remembering to
   also grant `citation-reasons:read`. The whole point of `requireAnyPermission` is to make that
   coupling automatic and permanent rather than a one-off data fix.
2. **Widen `requirePermission` itself to accept an array of `(resource, action)` pairs** (change
   its existing signature instead of adding a new function). Rejected: `requirePermission` has 12+
   call sites across the codebase (`docs/conventions.md`'s permission-resource-const convention),
   all passing a single `(resource, action)` pair; changing its signature would force touching
   every call site (or overloading the signature, which adds branching complexity to a function
   that's supposed to stay a one-liner-friendly guard) for a need that's local to one route. A new,
   additive `requireAnyPermission` has zero blast radius on existing routes.
3. **Inline the OR-check directly in `citation-reason.controller.ts` as a bespoke async handler**
   (skip the middleware abstraction, query `role_permissions` ad hoc in the route). Rejected:
   violates this project's established pattern that all permission checks live in
   `role.middleware.ts` and controllers only *call* a check, never implement one
   (`docs/architecture.md`'s controller layer description: "check permission ... call the matching
   `services/` function ... No business logic here"). It would also make the check
   non-reusable if a future route needs the same OR-permission shape.
4. **One `findOne` per check (three sequential queries for this route) instead of one deduplicated
   `find(... In(resources))`.** Rejected: three round-trips per request for what's a hot dropdown
   endpoint (called every time the citation-creation dialog opens) is strictly worse than one query,
   with no compensating simplicity gain — the `In(...)` query is not meaningfully harder to read
   than three `findOne`s.
5. **Change `citation-reason.service.findAll` to accept a "caller can see everything" flag and
   filter reasons differently depending on which permission path was used.** Rejected: out of
   scope — the acceptance criteria only ask for *access* (200 vs 403), not for the *content* of the
   response to differ by caller. `findAll`'s existing institution/course scoping is unchanged and
   sufficient.

## Flagged for the human reviewer

- **R16(iii)'s "isolate `citation-reasons:read=true` with no `citaciones` access" scenario** — every
  seeded role that has `citation-reasons:read = TRUE` today (`admin`, `rector`, `superadmin`) also
  has `citaciones` full CRUD (`postgres/22_citations_permissions.sql` grants `citaciones` to
  `admin`/`rector`/`superadmin` too), so this exact combination doesn't exist among current seeded
  roles — R9's *code path* is still real and necessary (it's what keeps those roles working when
  evaluated independently of the `citaciones` checks), but demonstrating it in isolation during the
  manual smoke test requires either a scratch role or a temporarily-edited `role_permissions` row
  for an existing role, reverted afterward. This is a test-data limitation, not a spec gap — flagged
  in case the reviewer wants a different verification approach (e.g. a raw SQL trace showing which
  branch of the `checks.some(...)` matched, instead of an end-to-end HTTP call).
