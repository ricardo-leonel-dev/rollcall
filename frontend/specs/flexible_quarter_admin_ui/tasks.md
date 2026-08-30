# Tasks — Flexible quarter admin UI

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>` lists
the file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable done-condition.
The implementer checks these off in order; the reviewer rejects the feature if any are left
`[ ]` without a documented, reviewer-accepted justification in `progress/impl_<feature>.md`.

- [x] T1 (R1) In `src/app/core/models/index.ts`, widen `Quarter.name` from the literal union
      `'Primer Trimestre' | 'Segundo Trimestre' | 'Tercer Trimestre'` to plain `string`. Done:
      file compiles under `pnpm run build` with no new errors on the `Quarter` interface line.

- [x] T2 (R2, R3) In `src/app/core/services/quarter.service.ts`, widen `QuarterPayload.name` and
      `QuarterPatch.name` from the literal union to `string`, add an optional `sequenceNumber?:
      number` field to both `QuarterPayload` and `QuarterPatch`, and add a new
      `remove(id: number): Promise<void>` method that issues `DELETE /api/quarters/:id` via
      `firstValueFrom(this.http.delete<void>(\`/api/quarters/\${id}\`))`. Done: file compiles,
      `grep -n "Primer Trimestre" src/app/core/services/quarter.service.ts` returns no matches
      outside the regression history (only the deprecated literal-union typing is gone).

- [x] T3 (R4) In `src/app/features/admin/quarters-dialog.component.ts`, replace the `ALL_NAMES`
      constant + `buildDrafts()` factory with a dynamic `drafts()` signal whose initial value is
      `data.existing.map(q => ({ localId: nextId++, remoteId: q.id, name: q.name,
      sequenceNumber: q.sequenceNumber, startDate: …, endDate: …, description: … }))` — and
      whose template iterates `@for (draft of drafts(); track draft.localId)` instead of the
      fixed `ALL_NAMES` array. Done: opening the dialog against an academic year that has 0, 1,
      2, or 5 saved quarters renders 0/1/2/5 draft cards respectively (verified manually per
      R4's "dynamic-sized list" requirement).

- [x] T4 (R4) In the same file, add a `addDraft()` method that appends a new
      `QuarterDraft { localId: nextId++, remoteId: null, name: '', sequenceNumber: null,
      startDate: null, endDate: null, description: '' }` to `drafts()`, and wire a
      `mat-stroked-button` labeled "Agregar período" near the top of `mat-dialog-content` to
      call it. Done: clicking the button while the dialog is open adds a new empty draft card
      below the existing ones; the new card has empty `name`, `startDate`, `endDate` and shows
      the empty-name inline error.

- [x] T5 (R4) In the same file, add a `markDeleted(draft)` method that, for a draft with
      `remoteId !== null`, sets `deleted = true` (the row stays visible-but-crossed-out in the
      template) and, for a draft with `remoteId === null`, splices it out of `drafts()`
      immediately. Wire a `mat-icon-button` labeled with the `delete_outline` icon in the
      top-right of each card to call it. Done: pressing the icon on a saved row marks it
      visually crossed-out (template `[class.deleted]="draft.deleted"` + a strikethrough CSS
      rule); pressing it on a never-saved row removes the card outright.

- [x] T6 (R5) In the same file, generalize the existing `validationErrors()` computed from
      iterating the 3 fixed names to iterating `drafts()`. Keep the same checks (start-before-end
      per row, within-academic-year bounds per row when set, pairwise overlap across all rows
      with both dates set) but map errors by `draft.localId` instead of by `name`. Keep
      `isValid()` as the gate that disables the primary save button. Done: with 4 draft rows
      where rows 2 and 3 overlap, both rows 2 and 3 show an inline "Las fechas se solapan con…"
      message and the "Guardar períodos" button is disabled; removing the overlap re-enables it.

- [x] T7 (R6) In the same file, ensure the within-academic-year validation runs against the
      academic year's `startDate`/`endDate` from `data.academicYear` for every row, not just the
      three original ones. Done: setting a draft's `startDate` to a date before
      `data.academicYear.startDate` on any row produces the same "La fecha de inicio está antes
      del inicio del año lectivo (…)" inline error it produced before on the three fixed rows.

- [x] T8 (R10, R11, R12) In the same file, rewrite `save()` to walk `drafts()` in three passes
      in this exact order: (a) for each draft with `deleted && remoteId !== null`,
      `await quarterService.remove(remoteId)`; (b) for each remaining draft with
      `remoteId === null`, `await quarterService.create({ name: draft.name,
      sequenceNumber: draft.sequenceNumber ?? undefined, startDate, endDate, description })`;
      (c) for each remaining draft with `remoteId !== null`,
      `await quarterService.update(remoteId, { …same shape… })`. Wrap the whole sequence in a
      `try / catch` that surfaces `err?.error?.error` via `NotificationService.error(...)`,
      keeps the dialog open with the failing draft's error highlighted, and returns `false` on
      failure. On success, close with `dialogRef.close({ saved: true, quarters: undefined })`
      (the caller fetches the fresh list — see T11). Done: opening the dialog, renaming one
      saved row, adding a new row, and deleting another saved row, then pressing "Guardar
      períodos", produces exactly 3 HTTP calls in the Network tab (1× `DELETE`, 1× `POST`,
      1× `PUT`), in that order; the success toast "Períodos actualizados." appears; the dialog
      closes.

- [x] T9 (R13) In the same file, replace the dialog's `styles: [...]` block with the paper-tab
      visual language described in `design.md`'s "Visual & UX direction" subsection: each draft
      card uses `background: var(--paper-deep)`, `border: 1px solid var(--border-soft)`,
      `border-radius: var(--radius-md)`, `padding: 16px`, `margin-bottom: 12px`, plus a 4px-wide
      left stripe via `border-left: 4px solid var(--accent)`; the ordinal numeral "01"/"02"/…
      is set in `font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 20px;
      color: var(--accent);` and is derived from `draft.sequenceNumber` for saved drafts or
      `$index + 1` for new drafts. Done: opening the dialog shows the redesigned cards in the
      browser (verified manually per `docs/verification.md`'s Level 3 smoke test); no inline
      hex colors remain in the styles block (`grep -nE "#[0-9a-fA-F]{3,8}"` on the file returns
      no matches inside the `styles: [\`...\`]` template literal).

- [x] T10 (R14) In the same file, derive every remaining color/spacing/type decision from the
      tokens in `src/styles.css` (no new hex values, no Material default radii). In particular:
      the existing `[class.invalid]` red-tinted variant becomes `border-color: #fecaca;
      background: #fef2f2` (these two hex values are the pre-existing exception in the current
      file, kept verbatim — they are the only acceptable ad-hoc values per the design); the
      "Quitar" icon button is `color: var(--muted-strong)` instead of red; the inline error
      text stays `#b91c1c`. Done: `grep -nE "#[0-9a-fA-F]{3,8}" src/app/features/admin/
      quarters-dialog.component.ts` returns only the 3 pre-existing hex values
      (`#fecaca`, `#fef2f2`, `#b91c1c`) inside the `styles: [\`...\`]` literal — no others.

- [x] T11 (R7, R10, R11) In `src/app/features/admin/admin.component.ts`, add a private
      `_quartersByYear = signal<Map<number, Quarter[]>>(new Map())` plus a public
      `quartersByYear = this._quartersByYear.asReadonly()`, and add a `quarterRowsFor(yearId)`
      helper that returns the array for that year sorted by `sequenceNumber` ascending (R9).
      Load the quarters inside `loadAll()` (in parallel with the existing courses/users/roles
      fetches) and populate `_quartersByYear` from the result. Done: navigating to the
      `AÑOS LECTIVOS` tab for the first time populates `_quartersByYear` and the inline chips
      for the active year appear without any extra HTTP round-trip beyond what already runs
      in `loadAll()`.

- [x] T12 (R4 contract change) In the same file, change `QuartersDialogComponent`'s
      `afterClosed()` callback in `openQuartersDialog`: instead of `(async ok => { if (ok)
      await this.loadAll(); })`, type the result as `{ saved: boolean; quarters?: Quarter[] }`
      and, on `saved === true`, fetch the fresh `QuarterService.getAll()`, rebuild the
      `_quartersByYear` map from it (replace just the relevant year's entry), and let the
      existing `loadAll()` continue to handle other mutations as it does today. Done: the
      inline chips update within the same change-detection tick after the dialog
      closes (R11) — verified manually by opening the dialog, adding a 4th period to an
      academic year that previously had 3, pressing save, and seeing the chip strip grow to
      4 chips without a manual page reload.

- [x] T13 (R7, R9) **Amended by user 2026-08-29.** In the same file, render inline period chips
      **inside the existing `.admin-row`**, between the year name and the action buttons (NOT
      below the row as the original wording said). Use `@if (y.isActive)` so the chips only
      render for the active year. Wrap a new `<div class="admin-row-quarters">` (flex,
      `flex-wrap: wrap; gap: 8px; align-items: center; flex: 1`) inside `.admin-row`, between
      `.admin-row-name` and `.admin-row-actions`. Inside that container, iterate
      `quarterRowsFor(y.id)` with `@for (q of …; track q.id)`, rendering each chip as
      `<span class="period-chip">` with three child spans:
      `<span class="period-chip-ordinal">{{ q.sequenceNumber }}·</span>` (Nunito 700, 14px,
      `var(--accent)`, real middle-dot `·` U+00B7),
      `<span class="period-chip-name">{{ q.name }}</span>` (Nunito 600, 13px, `var(--ink)`),
      and `<span class="period-chip-range">{{ q.startDate ?? '—' }} → {{ q.endDate ?? '—' }}</span>`
      (Nunito 400, 11px, `var(--muted-strong)`). Sort by `sequenceNumber` ascending (R9).
      Done: opening the page on a year with 3 configured periods shows exactly 3 chips
      inline within the `.admin-row`, in `sequenceNumber` ascending order (R9); long lists
      wrap to additional lines via `flex-wrap: wrap`; the existing "Configurar trimestres"
      icon button in `.admin-row-actions` still works.

- [x] T14 (R8) **Amended by user 2026-08-29.** In the same file, render the empty-state branch
      inside `.admin-row-quarters` when `quarterRowsFor(y.id).length === 0`: show a single
      Nunito 400 / 12px / `var(--muted-strong)` line "Sin períodos configurados." followed by
      an inline text link "Configurar trimestres" in `var(--accent)` (Nunito 600, 12px,
      underline on hover, cursor pointer) that calls `openQuartersDialog(y)`. NO Material
      `mat-button` here — buttons would visually compete with `.admin-row-actions`.
      Done: deleting all periods for the active year via the dialog and reopening the page
      shows the empty-state line with the inline "Configurar trimestres" link; clicking it
      reopens the dialog.

- [x] T15 (R14) **Amended by user 2026-08-29 (twice: chips-inline + chips-vertical-stack).**
      In the same file, add the chip styles to the component's `styles: [...]` block
      (replacing the previously approved panel styles):
      `.admin-row { display: flex; align-items: flex-start; justify-content: space-between; gap:
      8px; … }` (the `align-items: flex-start` keeps the year name and the action buttons
      pinned to the top while the chip stack grows downward),
      `.admin-row-quarters { display: flex; flex-direction: column; gap: 6px; align-items:
      flex-start; flex: 1; min-width: 0; }`,
      `.period-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px;
      align-self: flex-start; background: var(--paper-deep); border: 1px solid var(--border-soft);
      border-left: 2px solid var(--accent); border-radius: var(--radius-sm); }`,
      `.period-chip-ordinal { font-family: 'Nunito', sans-serif; font-weight: 700; font-size:
      14px; color: var(--accent); line-height: 1; }`,
      `.period-chip-name { font-family: 'Nunito', sans-serif; font-weight: 600; font-size:
      13px; color: var(--ink); }`,
      `.period-chip-range { font-family: 'Nunito', sans-serif; font-weight: 400; font-size:
      11px; color: var(--muted-strong); }`,
      `.period-chip-empty { font-family: 'Nunito', sans-serif; font-weight: 400; font-size:
      12px; color: var(--muted-strong); display: inline-flex; align-items: center; gap:
      8px; }`,
      `.period-chip-cta { color: var(--accent); font-weight: 600; cursor: pointer;
      text-decoration: none; }`,
      `.period-chip-cta:hover { text-decoration: underline; }`.
      Done: chips stack vertically in the middle column (one per row), visually integrated
      into `.admin-row`; `grep -nE "#[0-9a-fA-F]{3,8}"` inside the `styles: [\`...\`]` literal
      returns no ad-hoc hex values (only `var(--*)` references and the `rgba(...)` shadow
      already used by `.mat-mdc-card` in `src/styles.css`).

- [x] T16 (R13, R15) Run `pnpm run build` and `./init.sh`. Done: `pnpm run build` exits 0 with
      no new warnings attributable to the 5 files touched by this feature (T1, T2, T3-T10,
      T11-T15); `./init.sh` ends with `[OK] Environment ready` (the two pre-existing `[WARN]`s
      for empty `verify_command` and unset `SUPABASE_URL` are unchanged from the baseline
      captured in session 1's verification report).

- [x] T17 (R7, R8, R9, R12, R15) **Amended by user 2026-08-29** (chip verification added). Run
      the manual smoke test described in `docs/verification.md` Level 3 against a running
      stack (`docker compose up --build` at the monorepo root, log in as a role with
      `create`/`update`/`delete` permission on `academic_years`). Cover at minimum:
      (i) rename one of the seeded default quarters; (ii) add a 4th, free-form-named period
      with non-overlapping dates; (iii) delete a period; (iv) confirm the inline chip strip
      reflects all three changes without a manual reload, and that the chips live inside
      `.admin-row` (next to the year name, not below it); (v) attempt a save with overlapping
      dates and confirm the inline error and the 400-from-backend error are both surfaced via
      `NotificationService`; (vi) attempt a save with a duplicate `name` and confirm the 409
      is surfaced; (vii) attempt a delete on an already-deleted id (or a wrong-year id) and
      confirm the 404 is surfaced; (viii) for a year with zero periods, confirm the chip
      area renders "Sin períodos configurados." plus the inline "Configurar trimestres"
      link, and that clicking the link reopens the dialog. Capture the request/response
      pairs and the resulting chip-strip state in
      `progress/impl_flexible_quarter_admin_ui.md`'s Traceability section. Done: every row
      of the traceability table references a concrete `R<n>` and the table covers at least
      one observation per `R1`–`R15`.

> **T17 executed (implementer note, session 5 round 6, 2026-08-29):** docker was
> available in this session's shell with the full stack already running
> (`frontend`:80, `backend`:3000 healthy, `excel-service`:8002, `postgres`
> healthy, `redis` healthy), so the previous rounds' "no docker compose"
> deferral no longer applied. Wrote a standalone Playwright script
> (`scripts/t17-smoke.mjs`, headless Chromium, real backend — no route
> mocking, unlike the Level-4 `scripts/visual-smoke.mjs`) that logs in as the
> seeded superadmin, creates a disposable academic year
> (`T17-Smoke-<random>`) inside the real "Tia Blanquita" institution, runs
> all 8 sub-steps against that year's own quarters only, and deletes the
> disposable year + reactivates the real "2026-2027" year in a `finally`
> block. Confirmed via a follow-up GET that "2026-2027"'s 3 real quarters
> (Primer/Segundo/Tercer Trimestre, ids 9/2/3) are byte-for-byte unchanged
> after 3 full runs of the script.
>
> **Steps (i)-(iv) (rename, add, delete, chip-strip reflects all three
> without reload)** passed exactly as specified through the real UI.
> `progress/t17_smoke_multi_change.png` shows the 3 resulting chips inline
> inside `.admin-row`.
>
> **Step (v) (overlap) and step (vi) (duplicate name) both surfaced a real,
> previously-undetected client-side reactivity bug** in
> `quarters-dialog.component.ts`, unrelated to anything this smoke test set
> out to prove: `validationErrors()` is an Angular `computed()` whose only
> tracked dependency is the `drafts` signal's own version. `[(ngModel)]`
> bindings on a draft's fields (name/dates) mutate a *property* of an object
> already inside that signal's array — they never call `.set()`/`.update()`
> on the signal itself, so the computed's cached result never invalidates
> for a plain edit to an already-loaded row. Concretely:
>   - Step (v): editing an existing row's dates to introduce a real overlap
>     left `Guardar períodos` **enabled** (`saveDisabled: false`,
>     `invalidMessages: []`) — a violation of R5/R6's "apply validation to
>     every row". Since the button was enabled (not disabled, as originally
>     assumed), the script clicked it for real over the actual UI: the
>     invalid PUT reached the backend, which correctly rejected it with 400
>     ("Las fechas se solapan con Periodo Extra…"), surfaced verbatim via
>     `NotificationService.error`, dialog stayed open, failing row got the
>     `server-error` highlight (R12) — so the backend 400 path **was**
>     reachable through the real UI after all, just not for the reason the
>     task text anticipated. A supplementary direct API call independently
>     confirmed the same 400.
>   - Step (vi): adding a new row and typing a duplicate name left
>     `Guardar períodos` **permanently disabled** (stuck on the "empty name"
>     error attached at the instant the empty draft was created — typing
>     into it afterward never clears that stale error, since no further
>     `.update()` call happens). A real user hitting this would be unable to
>     save a newly-added period's name at all without first performing some
>     unrelated add/remove action. The script worked around this by adding
>     then immediately removing a disposable "nudge" row (forces a fresh,
>     accurate recompute) before clicking Guardar — not something a real
>     user would intuit, which is exactly why this is a bug, not a
>     legitimate part of the UX. Once past the nudge, the duplicate reached
>     the backend and correctly got a 409 ("Registro duplicado"), surfaced
>     via toast, dialog stayed open, failing row highlighted.
>   - **This reactivity bug is reported here, not fixed** — out of scope for
>     a T17 execution pass. Recommend the leader open a follow-up
>     bug-fix feature against `quarters-dialog.component.ts`'s
>     `validationErrors()` computed (likely fix: read `draft.name`/
>     `draft.startDate`/`draft.endDate` through a per-field signal, or force
>     a `drafts.update(list => [...list])` on every `(ngModelChange)`, same
>     as the existing `clearServerError(draft)` pattern already does for the
>     server-error highlight).
>
> **Step (vii)** used a direct authenticated API call (as anticipated —
> the UI has no affordance to target an id it no longer has loaded):
> `DELETE /api/quarters/<already-deleted-id>` → 404 ("Trimestre no
> encontrado").
>
> **Step (viii)** passed through the real UI: deleting all periods and
> saving produces the "Sin períodos configurados." + inline "Configurar
> trimestres" link (`progress/t17_smoke_empty_state.png`), and clicking the
> link reopens the dialog with exactly 1 empty draft row.
>
> Two unrelated pre-existing infra quirks were also discovered and worked
> around (not fixed, both out of scope): (1) `quarters`' and
> `academic_years`' `UNIQUE(...)` constraints are not partial on
> `deleted_at IS NULL`, so a soft-deleted row's name/sequence_number stays
> permanently reserved — the script sidesteps this with a disposable,
> randomized year name and by deleting the lowest-sequence period rather
> than the highest before adding a new one; (2) `academic_years.name` is
> `VARCHAR(20)`, constraining the disposable year's name length.
>
> Full evidence: `progress/t17_smoke_log.json` (every step + captured
> request/response pairs), `progress/t17_smoke_multi_change.png`,
> `progress/t17_smoke_empty_state.png`, and the traceability table in
> `progress/impl_flexible_quarter_admin_ui.md`.

> **Reactivity bug fixed (implementer note, session 5 round 7, 2026-08-29):**
> the client-side reactivity bug reported above (steps v/vi) is fixed.
> `quarters-dialog.component.ts`'s 4 editable draft fields (name, startDate,
> endDate, description) now all call a shared `onDraftFieldChange(draft)` on
> `(ngModelChange)`, which does `this.drafts.update(list => [...list])` in
> addition to the pre-existing `clearServerError` behavior it replaces — a
> shallow array-copy "poke" that forces the `drafts` signal's reference to
> change on every field edit, so `validationErrors()`/`isValid()` correctly
> recompute immediately after editing an *existing* row's field (previously
> only `addDraft()`/`markDeleted()` triggered a recompute). Re-ran
> `scripts/t17-smoke.mjs` against a rebuilt+recreated frontend docker image:
> step (v)'s `saveDisabled` now flips to `true` immediately upon typing an
> overlapping date pair (was stuck `false`), so the UI blocks the save
> client-side without ever reaching the backend for that case; step (vi)'s
> "nudge" workaround (add+remove a disposable row to force a recompute) is
> now provably a no-op — `preNudge` and `postNudge` are identical
> (`saveDisabled: false`, no invalid messages) immediately after typing the
> duplicate name, i.e. the workaround the script performs is no longer
> needed to reach that state. All 8 T17 sub-steps still pass; real
> "2026-2027" data still verified untouched. See the `fixVerification` note
> in `progress/t17_smoke_log.json` for the full re-run detail.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|---|---|
| R1 | T1 |
| R2, R3 | T2 |
| R4 | T3, T4, T5, T12 |
| R5 | T6 |
| R6 | T7 |
| R7 | T11, T13 |
| R8 | T14 |
| R9 | T11 (sort), T13 (display) |
| R10, R11 | T8 (dialog), T12 (caller) |
| R12 | T8 (dialog catch), T17 (manual smoke) |
| R13 | T9, T15 (chip styles), T16 |
| R14 | T10, T15 (chip styles) |
| R15 | T16, T17 |

> **Amendment note (2026-08-29).** T13, T14, T15 are reverted from `[x]` to `[ ]` because the
> user amended R7–R9 + R13–R14 to specify inline chips (inside `.admin-row`) instead of the
> previously approved panel (below `.admin-row`). The implementer must redo these three tasks
> against the chip wording. T11 and T12 remain `[x]` because the reactive-state plumbing they
> introduce is unchanged — only the template that consumes it changes (T13). T17's done
> condition gained an extra step (viii) for the empty-state chip link.
