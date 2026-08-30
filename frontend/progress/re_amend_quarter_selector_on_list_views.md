# Re-amendment — quarter_selector_on_list_views (feature 6, post-spec_ready)

## Outcome

Amended the 3-file spec (`specs/quarter_selector_on_list_views/{requirements,design,tasks}.md`)
after the human reviewer returned three decisions on the previously-`spec_ready` draft
(session 11, closed via `mark-spec-ready` before this re-amendment). The changes flip
the precedence model from "quarter scope overrides the manual Listado date range" to
"the quarter seeds the page's date pickers, but the pickers stay user-editable" —
mirroring the export feature's trimester pill behavior. R-count stays at 15 (no R
added or removed); T-count stays at 10. The defensive partial-date layer (R12) and
the foundation's `QuarterSelectorComponent` / `QuarterContextService` contract
remain frozen. The implementer session was **not** re-opened — the leader will
re-run `claim-spec` / `mark-spec-ready` after the human re-reviews the amended files.

## User decisions (verbatim from the reviewer's message)

1. **Q1 (R10 / R6+ precedence) — REWRITE the quarter→loader interaction.** "Quiero
   que el quarter determine el rango de fechas que aparezca seleccionado en el
   picker de fechas y que este pueda ser cambiado si el usuario así lo decide pero
   que siempre aparezca (algo similar a lo que está en el export que si se hace
   click en el pill del trimestre, las fechas se ponen automáticamente pero también
   las puedo cambiar a mi gusto). Pienso que el dropdown puede estar al lado del
   curso para que actúe de forma global en donde sea que haya selección de fecha."

2. **Q2 (Justifications loaders) — apply the same model.** "Aplicar punto 1 pero
   teniendo en cuenta que el dropdown puede estar al lado del curso para que actúe
   de forma global en donde sea que haya selección de fecha."

3. **Q3 (T10 partial-date smoke path) — create a fresh AY.** Document the
   partial-date exercise path as: create a new academic year in Tia Blanquita via
   `POST /api/academic-years` and open the dialog on that AY. Don't suggest
   code-review-only verification.

## Spec sections / R / T changed per decision

### Decision Q1 (seed-not-override model + "next to course selector" position)

- **`requirements.md`:**
  - **New note** ("2026-08-30 — seed-not-override model"): documents the user's
    seed semantics and the "next to course selector" position; explicitly notes
    that `photoDate` is **not** seeded (it's a photo-context single-date input,
    not a query filter).
  - **Intro cross-references**: updated the Absences / Justifications component
    summaries to reflect that Absences uses the existing `dateFrom`/`dateTo`
    pickers as the seed destination (no new fields) and Justifications keeps
    `selQuarterStart`/`selQuarterEnd` because the page has no pickers.
  - **R1 / R5 (template placement)**: reworded to call out "**first child of the
    same bar that hosts the course selector — the dropdown sits next to the
    course selector, not in a sidebar or separate row**" on both screens.
  - **R2 (Absences handler)**: rewritten. Now writes to `this.dateFrom` /
    `this.dateTo` directly (the seed destination), with explicit clauses for
    "different fully-dated quarter → overwrite + reload" and "same quarter → no-op
    on the pickers".
  - **R3 (Absences first render)**: reworded. Now documents that the default
    quarter does NOT pre-fill `dateFrom`/`dateTo` — the existing deep-link path
    (`?dateFrom=`/`?dateTo=`) keeps precedence, mirroring pre-existing behavior.
  - **R4 (Absences course change preserves)**: reworded. Now preserves the
    current `dateFrom`/`dateTo` values (whether seeded or manual).
  - **R6 (Justifications handler)**: rewritten. Adds the same-quarter no-op
    guard; explicitly notes the user cannot manually edit the fields (no
    pickers on the page).
  - **R9 (scope plumbing fields)**: rewritten. Now Justifications-only —
    Absences uses the existing pickers directly.
  - **R10 (loader URL building)**: rewritten. Absences keeps the existing
    `if (this.dateFrom)` / `if (this.dateTo)` lines untouched (pickers ARE the
    source, no precedence logic). `loadTodayAbsences()` replaces the hardcoded
    single-day pair with `dateToDateString(this.dateFrom)` /
    `dateToDateString(this.dateTo)`. Justifications loaders append the dates
    when both are non-null. Added explicit verification step for
    `/api/justifications` backend support, with the documented options if
    unsupported.
  - **R11 (reset affordances)**: reworded. Now preserves the quarter dropdown's
    selection; the user re-seeds by re-selecting the quarter (or picking a
    different one).
  - **R12 (partial-date no-op)**: kept. Now mentions "no picker mutation, no
    field mutation" to make it clear it covers both pages.
  - **R15 (verification)**: expanded from (i)–(vi) to (i)–(ix), adding sub-bullets
    for: manual picker edit preserved (iii), different quarter overwrites
    manual edit (iv), same quarter re-selection is a no-op on the pickers (v),
    Justifications loaders accept the seeded dates (vii), partial-date AY
    exercise (viii — see Q3 below).

- **`design.md`:**
  - **Files to touch table**: updated R-reference column and the per-component
    change description to reflect "no `selQuarterStart`/`selQuarterEnd` on
    Absences" and "Justifications uses the new fields as the only date source".
  - **Per-screen integration pattern (Absences)**: handler code block rewritten
    to write `this.dateFrom` / `this.dateTo` directly. Loader code block no
    longer has precedence logic — `loadAbsences()` is unchanged from today;
    `loadTodayAbsences()` replaces today's `todayStr()` pair with
    `dateToDateString(this.dateFrom)` / `dateToDateString(this.dateTo)`.
  - **Per-screen integration pattern (Justifications)**: kept the field
    declarations and loader logic (Justifications has no pickers, so the
    fields remain); updated the handler to include the same-quarter no-op
    guard.
  - **Signal/computed wiring**: rewritten to note Absences has **no** new fields
    (the pickers serve the role); Justifications still has the two plain
    mutable fields, with the same justification as before.
  - **Visual & UX direction**: reworded to call out the "**next to** the course
    selector" position explicitly, mirroring the user's intent.
  - **Discarded alternatives**: kept #1–#6 (with minor edits — alternative #4
    updated to mention the seed model, alternative #5 unchanged); added **#7
    ("scope wins" model rejected — the user wants seed, not override)** and
    **#8 (sidebar placement rejected — the user wants inline next to the
    course selector)**.

- **`tasks.md`:**
  - **T1 (explore)**: extended to verify (d) Absences' Listado pickers already
    bind `[(ngModel)]="dateFrom"`/`dateTo` (the seed destination) and (e)
    Justifications has no date pickers (so R9's fields are the only date
    source).
  - **T2 / T6 (template placement)**: kept; added the explicit "next to the
    course selector" wording per the 2026-08-30 amendment.
  - **T3 (Absences handler)**: rewritten to write `this.dateFrom` / `this.dateTo`
    directly (no new fields). Added explicit note: "Absences does **NOT** add
    `selQuarterStart`/`selQuarterEnd` fields (R9 — the existing pickers serve
    the same role)".
  - **T4 (Absences loader changes)**: rewritten. `loadAbsences()` is unchanged
    (the `if (this.dateFrom)`/`if (this.dateTo)` lines stay). `loadTodayAbsences()`
    uses `dateToDateString(this.dateFrom)` / `dateToDateString(this.dateTo)`.
    `clearFilters()` comment now explains the quarter selection is preserved.
  - **T5 (Absences smoke)**: sub-bullets updated to (a) dropdown next to
    "Curso"; (b) different quarter writes dates to pickers + reloads; (c) manual
    edit preserves; (d) selecting the same quarter does NOT overwrite the
    manual edit; (e) "Limpiar" resets pickers but keeps dropdown; (f) cross-page
    singleton.
  - **T7 (Justifications handler)**: kept the field declarations; updated the
    handler block to include the same-quarter no-op guard.
  - **T8 (Justifications loader changes)**: kept. Added an explicit pre-step to
    `curl`-verify the backend `/api/justifications` accepts `date_from`/
    `date_to` (with the R10-documented options if it doesn't).
  - **T9 (Justifications smoke)**: sub-bullets updated to cover the same-quarter
    no-op, "Todos los cursos" preservation, and the per-student filter.
  - **T10 (build + full smoke)**: rewritten R15 sub-bullet (iv) per Q3 (see
    below); sub-bullets now numbered (i)–(ix); partial-date AY created and
    cleaned up via the admin UI's `POST /api/academic-years` / `DELETE
    /api/academic-years/:id` paths, with the SQL-soft-delete fallback documented.
  - **Reverse traceability**: `R<n>` → `T<n>` rows updated to reflect the new
    handler / loader mapping (R9 now points only at T7; R10 maps to T4 + T8 +
    smokes).

### Decision Q2 (Justifications — same model)

- All Justifications requirements (R5–R8) and tasks (T6–T9) apply the seed
  model with the same-quarter no-op guard, mirroring Absences. Justifications
  has no date pickers on the page, so the seed destination is the internal
  `selQuarterStart`/`selQuarterEnd` fields and the user has no way to manually
  edit them post-seed — this is documented explicitly in R6.
- `loadHistorial()` and `loadPendingStudents()` both receive the seeded dates
  (R10). The spec does NOT fabricate a parameter for `loadPendingStudents()` —
  it already takes dates via `/api/absences?date_from=…&date_to=…`. The
  implementation will refactor its inline URL to a `params: string[]` array
  with the new guard (T8).
- R10 includes an explicit verification step for `/api/justifications`'s
  support for `date_from`/`date_to`; if unsupported, the implementer either
  extends the backend spec or documents the gap (no fabrication).

### Decision Q3 (T10 partial-date smoke path — create a fresh AY)

T10's R15 sub-bullet (viii) now walks the implementer through:

1. Switch to "Tia Blanquita" test institution.
2. Open the Admin page → "Nuevo año lectivo" → fill name + start/end dates →
   save. The admin UI calls `POST /api/academic-years`
   (`src/app/features/admin/admin.component.ts`'s createAcademicYear path).
   This triggers `seedQuarters()` server-side, which inserts 3 null-dated rows
   for the new AY.
3. Set the academic-year context to the new AY via the top-bar AY selector.
4. Open the Justifications or Absences page scoped to the new AY and confirm
   the foundation's "no usable period" fallback state renders.
5. Click any partial-date quarter (the foundation does not filter them out of
   the selectable list) and confirm R12 fires — no mutation, no loader call,
   no toast.
6. Clean up: switch back to the Tia Blanquita active AY and delete the fresh
   AY via the admin UI's delete action (`DELETE /api/academic-years/:id`).
   If the admin UI does not surface a delete button for an AY whose quarters
   are all partial-date (e.g. due to `seedQuarters()` cascade rules), document
   the SQL soft-delete rollback path in
   `progress/impl_quarter_selector_on_list_views.md`, mirroring the established
   pattern in `postgres/19_quarters_softdelete_legacy_null_dates.sql`.

Code-review-only verification is explicitly NOT acceptable for sub-bullet
(viii) — the fresh AY is created and the partial-date path is exercised
against the running stack.

## Decisions I couldn't cleanly implement and need reviewer flagging

1. **Same-quarter re-selection guard.** The handler needs to compare `q.id` to
   the currently-selected quarter's id. `QuarterContextService.selectedId()` is
   the source of truth (per R13 — no direct injection in the page component),
   but reading it inside the handler requires the implementer to either (a)
   inject `QuarterContextService` into the page component (which R13 currently
   forbids to "avoid duplicate reactive year-switch handling"), or (b) read
   `QuarterContextService.selectedId()` via the `QuarterSelectorComponent`
   public `context` accessor (already exposed per foundation R14, used by
   Dashboard). I picked option (b) but the design placeholder is illustrative
   only — the implementer should pick whichever path they prefer, as long as
   the contract is "same-quarter re-selection is a no-op on the pickers /
   fields". R13 itself may need a small clarification in a future round if
   the implementer hits a real ambiguity; for now T3's note leaves the choice
   open.

2. **`loadTodayAbsences()` initial-state `dateToDateString(null)` behavior.**
   Today's `loadTodayAbsences()` builds `date_from=${today}&date_to=${today}`
   unconditionally; after R2/R10 it builds
   `date_from=${dateToDateString(this.dateFrom)}&date_to=${dateToDateString(this.dateTo)}`.
   At first render (before the user has picked a quarter), both `this.dateFrom`
   and `this.dateTo` are `null`, and `dateToDateString(null)` returns the
   literal string `"null"` — which the backend will reject. R3 preserves the
   existing first-render behavior, so this is intentional (the existing
   behavior at first render also calls `/api/absences` without the deep-link
   params, so this edge case was already latent). T4 documents the issue and
   the implementer should either (a) keep the existing behavior and let the
   first-render fetch hit the no-date-filtered endpoint (matching today's
   `loadAbsences()` path), or (b) skip the `loadTodayAbsences()` call when
   both pickers are null. Either is acceptable; the implementer should pick
   whichever matches the existing behavior on the page.

3. **`/api/justifications` date-filter support.** T8 requires the implementer
   to `curl`-verify the backend before adding the params; if unsupported, the
   implementer must extend the backend spec OR document the gap. This is a
   real-world dependency that may surface as a separate backend feature —
   flagging for the reviewer now so they can pre-approve either path.

## State of the repo (this re-amendment session)

```
$ git status -s specs/ progress/ scope (no src/ touches)

 M specs/quarter_selector_on_list_views/requirements.md   (rewritten — seed model + R2/R6/R10/R15 sub-bullets)
 M specs/quarter_selector_on_list_views/design.md         (rewritten — handler code, discarded alts #7 + #8)
 M specs/quarter_selector_on_list_views/tasks.md          (rewritten — T1/T3/T4/T5/T7/T8/T9/T10 + traceability)
?? progress/re_amend_quarter_selector_on_list_views.md    (this file)
```

No files outside `specs/quarter_selector_on_list_views/` and `progress/` were
edited. No commits were made. The implementer session was **not** re-opened —
the leader will re-run `mark-spec-ready` after the human re-reviews the
amended spec (and a new `claim-spec` if the leader prefers a fresh session).
