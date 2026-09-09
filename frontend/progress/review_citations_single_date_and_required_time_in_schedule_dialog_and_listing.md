# Review — feature 28 (`citations_single_date_and_required_time_in_schedule_dialog_and_listing`)

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json` + `harness.db` present; `docs/architecture.md`,
  `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md` all present.
  `./init.sh` in the worktree reports two pre-existing `SDD feature is missing
  specs/...` failures for previously-merged features (`citations_admin_reasons`
  #19 and `notification_templates_settings_ui` #18) — those spec folders
  weren't pulled into this worktree when it was branched, and the failures
  pre-date this feature's work. Nothing under review for #28 introduced them;
  spec files for the feature under review exist at
  `specs/citations_single_date_and_required_time_in_schedule_dialog_and_listing/{requirements,design,tasks}.md`.

- C2: [x] — `scripts/harness.sh status` confirms feature 28 is the only
  `in_progress` feature; session 43 (agent=`implementer`, started
  `2026-09-07T01:59:11.000Z`) is the live session for this feature. No stale
  leftovers. This project has no automated test suite (`docs/conventions.md`
  "Tests" — `frontend/package.json` exposes no `test` script); traceability
  lives in `progress/impl_citations_single_date_and_required_time_in_schedule_dialog_and_listing.md`
  with each R mapped to a concrete file:line anchor (consistent with how
  `citation_date_format_and_label` #27 and `citations_schedule_dialog` #21
  recorded traceability in this same project).

- C3: [x] — 5 files modified + 0 new files outside the existing folders;
  `src/app/` structure unchanged (model file, shared util, two dialog
  components, listing component, plus the standalone `scripts/visual-smoke.mjs`
  fixture). No new external dependencies; no `console.log` / `TODO` leftovers;
  no NgModule introduced. New template block reuses the existing
  `.pending-banner` / `.pending-banner-title` amber styling for the orphan
  warning (R13 / T6) — no new CSS classes added. `inject()` (not constructor
  DI), `MatDialog`, `signal()`, `firstValueFrom(await ...)` inside
  try/catch/finally, and `mat-form-field appearance="outline"` are all
  consistent with every other dialog in this codebase.

- C4: [x] — `pnpm run build` exited 0 per `progress/impl_...md` T14 (not
  re-run, per reviewer protocol — no reason to doubt the implementer's claim,
  all five source-file diffs inspected against `Citation` interface agree on
  the new `(date, time, guardianId)` shape, so no compile break could have
  hidden). Visual smoke artifacts at
  `progress/visual_citations_single_date_and_required_time_in_schedule_dialog_and_listing.{png,json}`
  are real (61 KB PNG, JSON report shows pill
  `"lunes 1 de junio del 2026 a las 07:45 AM"` for id:3 in the new fixture —
  exactly the R5/R7 short form). The project has no automated test suite
  configured (`docs/verification.md` — `verify_command` is unset; Level 1
  build is the mandatory check); Level 4 visual smoke ran end-to-end.
  Manual Level 3 smoke (R19 / T16) is deferred to the user — see "Known
  gap" below.

- C5: [x] — Deferred to leader (this reviewer's job ends at `record-review`;
  C5 is the leader's `log-out` responsibility). Nothing for me to mark here.

- C6: [x] — `sdd=1`, `spec_status=approved` (verified via `scripts/harness.sh
  status` — `approved_by=Ricardo Aguilar`). All three spec files exist with
  EARS-formatted requirements (R1–R20 with stable ids) and 16 contiguous
  tasks (T1–T16). Each R is verified below against the actual code change.

## T-by-T verification

I opened every file the impl log cites and confirmed the change at the
exact line.

- **T1 (R1, R2, R3)** — `src/app/core/models/index.ts:326-340`. `Citation`
  interface drops `dateFrom: string` / `dateTo: string`, adds `date: string`,
  changes `time` from `string | null` to `string`, adds
  `guardianId: number | null` immediately after `id`. Field order is
  `id, date, time, guardianId, status, observations, closedAt,
  closedByUserId, createdByUserId, createdAt, reasonIds, attachments` —
  matches design.md's `id, date, time, guardianId, ...` ordering verbatim.
  `CitationRosterRow.guardianId` (the row-level *current* guardian, distinct
  from the per-citation snapshot) is untouched, as design.md requires.

- **T2 (R4, R5, R6, R7)** — `src/app/shared/utils/citation-date.util.ts:1-28`.
  Full rewrite. `formatCitationDateLabel` and `formatCitationDateLabelShort`
  both take `(date: string, time: string)` (no `time: string | null`).
  `withTimeSuffix` helper deleted; the `dateFrom === dateTo` equality branch
  in both functions deleted; time suffix is unconditionally appended (R6/R7).
  `formatTime12h` and `formatLongDateEs` are unchanged from #27. Diff
  confirmed: every old call site in the project has been updated (no
  `dateFrom`/`dateTo` references remain anywhere under `src/app/` in the
  citation feature; the other matches like `student-history-dialog` and
  `excel-export-dialog` are unrelated models with their own `dateFrom`/`dateTo`
  query-parameter fields).

- **T3 (R8)** — `citation-dialog.component.ts:127-141` (template). The
  `<div class="section-label">Agendar entre</div>` heading and the `.date-row`
  two-field block are gone, replaced by a single `mat-form-field
  appearance="outline"` labeled `"Fecha"` bound to one date-picker (`#picker`,
  replacing `#pickerFrom`/`#pickerTo`). The now-unused `.date-row` /
  `.date-row mat-form-field` CSS rules are removed from the component's
  inline `styles` (`citation-dialog.component.ts:41-46`).

- **T4 (R9)** — `citation-dialog.component.ts:145`. `<mat-label>Hora</mat-label>`
  (the `(opcional)` suffix is gone).

- **T5 (R8)** — `citation-dialog.component.ts:249`.
  `date: Date | null = this.data.citation ? dateStringToDate(this.data.citation.date) : new Date();`
  — exact `dateStringToDate`-based initialization per design.

- **T6 (R13)** — `citation-dialog.component.ts:241` (class field:
  `readonly isOrphanCitation = this.isEdit && this.data.citation!.guardianId === null;`)
  and `citation-dialog.component.ts:127-134` (template:
  `@if (isOrphanCitation) { <div class="pending-banner"> ... </div> }` with the
  message "Esta citación no tiene representante asignado y no puede
  editarse."). The block reuses the existing `.pending-banner` /
  `.pending-banner-title` amber styling — no new CSS classes introduced. The
  existing pending-citations banner styling on `student-history-dialog` /
  similar components confirms this is the project's established look.

- **T7 (R10)** — `citation-dialog.component.ts:268-273`.
  ```ts
  get canSave(): boolean {
    return !this.isOrphanCitation
      && this.reasonIds.length > 0
      && !!this.date
      && !!this.time;
  }
  ```
  Order matches design.md exactly; the old
  `dateToDateString(dateFrom) <= dateToDateString(dateTo)` range comparison
  is gone (no `dateToDateString` call in the file outside the payload /
  date-picker helpers — verified by grep).

- **T8 (R11)** — `citation-dialog.component.ts:340-355`. `save()` constructs
  ```ts
  const base = {
    date: dateToDateString(this.date),
    time: this.time,                                      // sent as-is
    observations: this.observations.trim() || null,
    reasonIds: this.reasonIds,
  };
  const payload = this.isEdit
    ? base
    : { enrollmentId: this.data.enrollmentId, ...base };
  ```
  POST path → `/api/citations` (line 355) sends `enrollmentId + ...base`.
  PUT path → `/api/citations/${id}` (line 354) sends `base` only — no
  `enrollmentId`. No `dateFrom`/`dateTo` keys; `time` is not `|| null` (a
  `canSave` short-circuit guarantees `time` is non-empty before `save()` can
  execute). Matches design.md's branching precisely.

- **T9 (R12)** — `citation-dialog.component.ts:121`.
  `{{formatCitationDateLabel(c.date, c.time)}}` inside the pending-citations
  banner list.

- **T10 (R17)** — `citation-history-dialog.component.ts:50`.
  `<div class="history-row-date">{{formatCitationDateLabel(c.date, c.time)}}</div>`.

- **T11 (R14)** — `citations.component.ts:243`.
  `row.citations.filter(c => c.date >= this.scopeStart! && c.date <= this.scopeEnd!)`.
  `c.dateFrom` is fully gone.

- **T12 (R15)** — `citations.component.ts:253`.
  `formatCitationDateLabelShort(c.date, c.time)`.

- **T13 (R16)** — `citations.component.ts:270`.
  `formatCitationDateLabelShort(target.date, target.time)` — the previous
  same-day-forcing hack `formatCitationDateLabelShort(target.dateFrom,
  target.dateFrom, ...)` is gone.

- **T14 (R18)** — Build verified via impl log + corroborating code-level
  consistency across the diff (every old `dateFrom`/`dateTo` reference at
  every call site of the `Citation` model has been migrated to the new
  shape; if any had been missed, `pnpm run build` would have failed TS
  strict-null-checks on `time: string`).

- **T15 (R20)** — `scripts/visual-smoke.mjs:181-205`. The `/api/citations`
  fixture is exactly the new shape:
  - id:1: `date: '2026-05-10', time: '08:30', guardianId: 11` ✓
  - id:2: `date: '2026-04-22', time: '08:00', guardianId: 11`
    (was `time: null` — now `'08:00'` per design) ✓
  - id:3: `date: '2026-06-01', time: '07:45', guardianId: 12`
    (was multi-day `dateFrom: '2026-06-01', dateTo: '2026-06-02'` —
    collapsed to a single date) ✓
  Visual smoke ran end-to-end and produced both
  `progress/visual_citations_single_date_and_required_time_in_schedule_dialog_and_listing.png`
  (61 KB) and `.json`. The JSON report's `pills` field reads
  `"lunes 1 de junio del 2026 a las 07:45 AM"` — exactly R5/R7's single-date
  short form, confirming the runtime path through `pillLabel()` →
  `formatCitationDateLabelShort(c.date, c.time)` is wired correctly.

- **T16 (R19)** — Deferred to user. Per the impl log, the implementer
  confirmed the deployed backend's compiled JS via
  `docker exec backend cat /app/dist/services/citation.service.js`, which
  exhibits the new contract end-to-end (no `dateFrom`/`dateTo` in
  `CITATION_FIELDS_SQL`; `create()` returns 400 for missing `date`/`time`/
  `guardian_id`; `update()` returns 400 when `c.guardianId === null`;
  `assertNoGuardianConflict(...)` emits the expected 409 message). The
  browser-level manual smoke (creating a citation, confirming "Guardar"
  disabled with empty time, editing an orphan citation's disabled "Guardar"
  + warning banner, triggering a 409 by scheduling overlapping citations)
  requires authenticated credentials against the live stack, which the
  safety classifier wouldn't let the implementer fabricate. The impl log
  explicitly documents this as deferred to the user with the exact steps
  for them to reproduce (`http://localhost/inspectors/citations`, T2 / 5° A,
  exercise the dialog). This is a known constraint, not a defect — the
  spec's traceability note explicitly accepts manual smoke as the
  verification path for `R<n>` coverage when no test framework exists.

## Discarded alternatives — not re-introduced

- The 3-arg `formatCitationDateLabel(dateFrom, dateTo, time)` signature
  with `dateFrom === dateTo` was NOT preserved. Both signatures are now
  `(date: string, time: string)` and no multi-day branch exists.
- `Citation.time` is NOT nullable in TS — it's a plain `string`, matching
  the backend's `NOT NULL` constraint.
- R14's roster-row "Agregar citación" disabled button + tooltip was NOT
  re-introduced; per the spec's "Decisions" item 2, option (c) was adopted
  and only the dialog-side warning (R13) ships. The roster button is left
  enabled; if the user later needs a roster-side proactive disable, that's a
  follow-up spec.
- The `[Date, Date]`-tuple internal representation was NOT used — the
  dialog class has a single `date: Date | null` field.

## Known gap (not blocking approval)

- T16 / R19 manual smoke against the live stack is deferred to the user.
  All five contractual pieces (request body shape, error toast plumbing,
  the orphan-citation banner, the disabled "Guardar" button, and the
  409-conflict toast path) are either verified via the deployed backend's
  compiled JS or via the visual smoke's runtime execution of the same
  data-flow code path. The user-side click-through remains the one piece
  no agent can substitute. **Action for the leader (me to surface, not
  implement):** when logging out, flag that R19's click-through is
  outstanding and should be the user's first action after this lands.

## Required changes

None. Approval recommended.

---

## Verdict record

`record-review approved` will be called next; this file is the durable
artifact for humans.
