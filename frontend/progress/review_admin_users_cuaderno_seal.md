# Review — feature 30 (admin_users_cuaderno_seal)

**Verdict:** APPROVED (after one fix applied during review)

## Context

This session's original `record-review approved` (session #58, reviewed_by "Claude Sonnet 5",
2026-09-08T20:31:54Z) was recorded in `harness.db` with **no corresponding written review artifact** —
unlike every other feature in this project's history (compare `review_flexible_quarter_admin_ui.md`,
the feature-31/41 entries in `review.md`, etc.), nothing under `progress/` documented what was actually
checked. The implementation itself (`progress/impl_30.md`) was real and matched the diff on disk, but the
"approved" verdict had no independent, inspectable verification behind it. This file replaces that gap
with a real review, and documents one bug found and fixed in the process.

## Checkpoints

- C1: [x] `.harness.json`, `harness.db`, docs present; `./init.sh` not re-run this pass (no changes to
  harness setup itself), but `pnpm run build` (below) confirms the environment is sound.
- C2: [x] Only feature 30 `in_progress`; session #58 reflects this exact work (plan in the session log
  matches the diff below).
- C3: [x] Only `src/app/features/admin/admin.component.ts` (application code) and
  `scripts/visual-smoke.mjs` (test fixture/assertions) touched; standalone/OnPush/inline-styles
  conventions respected; no new top-level folder; no `console.log`/TODO left in application source.
- C4: [x] No test framework configured (per `docs/conventions.md`); `pnpm run build` re-run independently
  by the reviewer → exit 0, only pre-existing per-component CSS-budget warnings (admin.component.ts now
  3.44 kB vs. 2.00 kB budget — same pre-existing warning class as before this feature, not a new failure).
  Visual smoke re-run independently by the reviewer at all three viewports (not taken on the implementer's
  word) — see "Bug found and fixed" below.
- C5: [x] No stray untracked files from this feature's own work; the untracked `progress/impl_30.md`,
  `progress/review_admin_users_cuaderno_seal.md` (this file), and the six
  `progress/visual_admin_users_cuaderno_seal_{desktop,mobile,tablet}.{png,json}` files are the expected
  durable record per `docs/conventions.md` "Smoke scripts". (Note: this shared checkout also has unrelated
  untracked leftovers from other sessions/features — e.g. `impl_citations_admin_reasons.md`,
  `feature-18-profile-dialog-preview.html` — pre-existing, not touched or added by this session, out of
  scope for this review.)
- C6: N/A — feature is `sdd=0`.

## Bug found and fixed

The implementer's original template used a single hardcoded string for the courses-assigned scope line:

```html
<b>{{ u.courseIds.length }}</b> cursos asignados
```

This reads **"1 cursos asignados"** for any user with exactly one assigned course (e.g. Juan López,
Lucía Mendoza in the smoke fixture) — grammatically wrong Spanish (should be singular "curso asignado").
Confirmed visually in the original `visual_admin_users_cuaderno_seal_{desktop,mobile,tablet}.png`
screenshots before this fix.

**Fix applied** (both the desktop table cell and the mobile card, `admin.component.ts`):

```html
<b>{{ u.courseIds.length }}</b> {{ u.courseIds.length === 1 ? 'curso asignado' : 'cursos asignados' }}
```

Also updated the two hardcoded assertion regexes in `scripts/visual-smoke.mjs` (lines ~381 and ~450) that
only matched the plural form — they would have silently passed a singular-only fixture as "not a scope
line" rather than catching the grammar bug, since neither regex accepted `1 curso asignado`. Now both
accept the correct singular form and reject `1 cursos asignados` explicitly.

## Detailed checks (independent re-verification)

1. **`pnpm run build`** — re-run by the reviewer after the fix: exit `0`. Diffed the warning list against
   the pre-fix build: identical set of pre-existing per-component CSS-budget warnings, same byte counts
   for `admin.component.ts` — the fix (an inline ternary) added no meaningful bundle weight.

2. **Visual smoke re-run by the reviewer at all three viewports** (not reused from the implementer's
   original screenshots, which predate the fix):
   - Desktop (1440×900): `progress/visual_admin_users_cuaderno_seal_desktop.png/json` — scope lines now
     read "Todos los cursos" (María, Pedro, Rosa), "**1** curso asignado" (Juan, Lucía), "**2** cursos
     asignados" (Karen). `userScopeLines[].matchesCounted` is `true` for both singular and plural entries
     in the JSON transcript. `REGISTROS: 6` folio unchanged. `userCardLayout.isHorizontal: true` (n/a at
     this viewport — table mode). `layoutMode: "desktop"`.
   - Mobile (375×812): same corrected text confirmed in `visual_admin_users_cuaderno_seal_mobile.json`;
     `layoutMode: "mobile-or-tablet-cards"`, `userCardLayout.isVertical: true` (cards stack, per feature
     30's acceptance criterion for <768px).
   - Tablet (900×1024): same corrected text confirmed in `visual_admin_users_cuaderno_seal_tablet.json`;
     `userCardLayout.isHorizontal: true` (fila-tarjeta horizontal, per feature 30's acceptance criterion
     for tablet — not a packed 5-column table).

3. **Scope-line data source** — `u.courseIds && u.courseIds.length > 0` / `u.courseIds.length` bound
   directly to the `User` model's real field (`core/models/index.ts`), same `null`/`[]` → "no restriction"
   fallback semantics as `req.courseIds` in `middleware/institution.middleware.ts`. No hardcoded/invented
   data. Confirmed against the fixture in `scripts/visual-smoke.mjs` (6 users, mixed `null`/`[]`/`[1]`/
   `[1,2]` — all four branches exercised).

4. **Folio "Registros" count** — `<b>{{ users().length }}</b>` bound to the live signal populated from
   `GET /api/users`; screenshot shows `REGISTROS: 6` matching the 6-user fixture.

5. **Seal avatar** — every row/card uses `<app-seal-avatar [size]="36" [initials]="...">`, the shared
   circular double-ring component from feature 29's foundation. `app-chapter-header` and
   `SealAvatarComponent` themselves untouched — `git diff -- src/app/shared/` is empty.

6. **Scope limited correctly** — `git diff -- src/app/features/admin/admin.component.ts` touches only:
   (a) new `.admin-row.user-row`/`.users-folio`/`.user-card-divider` style rules + the fix's inline
   ternary; (b) the users-tab template region (folio row, scope line ×2, divider, `user-row` class); no
   other tab (years, courses, citation-reasons, institutions, permissions, roster) modified — confirmed by
   inspecting the full diff, not just the implementer's stated scope.

7. **No new dependency** — `git diff -- package.json pnpm-lock.yaml` empty.

## Required Changes (if applicable)

None outstanding — the one issue found (singular/plural grammar) was fixed in this review pass and
re-verified above.

## Notes

- The two documented deviations in `progress/impl_30.md` (the `.user-row` breakpoint override scoped to
  users only, and the visual-smoke fixture going from `[]` to a 6-user fixture) are both sound and
  correctly scoped — re-confirmed while tracing the diff for check #6 above.
- Process note for future sessions: `record-review approved` should not be called without a
  `progress/review_<name>.md` (or equivalent) actually backing it — an approval with no inspectable
  evidence is indistinguishable from one that was never really checked. This file exists specifically to
  close that gap for feature 30; the DB verdict now has a real artifact behind it.
