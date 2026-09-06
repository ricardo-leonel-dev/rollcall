# Review — feature 27 (`citation_date_format_and_label`)

**Verdict:** APPROVED

## Checkpoints

- C1: [ ] ← Reason: `./init.sh` exits non-zero, but the two `[FAIL]`s in step 3 are pre-existing
      project state — `specs/citations_admin_reasons/{requirements,design,tasks}.md` and
      `specs/notification_templates_settings_ui/{requirements,design,tasks}.md` were never
      committed for those done sdd=1 features (verified with `git log --all --oneline --` on
      those paths returns nothing). Feature 27's own spec files
      (`specs/citation_date_format_and_label/{requirements,design,tasks}.md`) are all
      present. The implementer cannot fix features 18/19's missing specs in the scope of
      feature 27; recommend the leader resolve those separately.
- C2: [ ] ← Reason: `package.json` has no test scripts (`ng test`, `vitest`, `jest`, etc.),
      no Karma/Jasmine setup in `angular.json`, no `*.spec.ts` files anywhere in `src/`
      (verified). Per the project-wide acknowledgment in `docs/verification.md` and the
      explicit task instruction, the project has no automated test suite yet — there are
      therefore no passing tests for the new `citation-date.util.ts` functions
      (`formatCitationDateLabel`, `formatCitationDateLabelShort`, `formatTime12h`,
      `formatLongDateEs`, `withTimeSuffix`) or for the three call sites that consume them.
      `docs/verification.md` mandates Level 1 (`pnpm run build`) as the applicable check
      in lieu of unit tests, which `pnpm run build` passes (exit 0, zero TS errors).
- C3: [x] — Four files modified, one new file; no new top-level folders under `src/app`;
      the new util lives at `src/app/shared/utils/citation-date.util.ts` (per
      `docs/conventions.md`'s `<domain>.util.ts` rule, matching the existing
      `date.util.ts`/`citation-reason.util.ts` precedent). Pure functions, no runtime
      dependency changes (only reuses `dateStringToDate` from `./date.util`, already used
      by all three call sites). Components remain `standalone: true` /
      `ChangeDetectionStrategy.OnPush` with inline `template:`/`styles:`; `inject()` is used
      (not constructor DI); HTTP calls keep the `await firstValueFrom(...)` pattern inside
      try/catch; no `console.log`/`TODO` leftovers; no NgModule; no absolute API hosts. The
      `readonly formatCitationDateLabel = formatCitationDateLabel;` field on
      `CitationDialogComponent` follows the exact same pattern as the existing
      `citationReasonSeverityBadgeClass` field already in that file.
- C4: [ ] ← Reason: no test framework exists in this repo, so there are no tests for the
      changed code (same root cause as C2). `pnpm run build` exits 0, which is the
      documented Level 1 verification stand-in per `docs/verification.md`. Warnings
      emitted (`citation-dialog.component.ts` 2.62 kB vs 2 kB budget; several other
      component CSS budget warnings) are all pre-existing — the new `.section-label` style
      adds ~90 bytes to a file that was already 2.53 kB before this feature
      (per `progress/impl_citation_date_format_and_label.md` T11).
- C5: [x] (deferred) — session 39 is still open and `log-out` is the leader's call after
      approval.
- C6: [x] — `specs/citation_date_format_and_label/{requirements.md, design.md, tasks.md}`
      all exist on disk (approved by Ricardo Aguilar); `requirements.md` uses strict EARS
      for every R1–R14 with stable ids; `tasks.md` marks all 13 tasks `[x]` and every
      `R<n>` maps to a concrete, code-verified anchor (see "Spec coverage" below).

## Spec coverage table (R<n> vs. code anchor, verified directly)

| Req  | Anchor                                                        | Verified |
| ---- | ------------------------------------------------------------- | -------- |
| R1   | `src/app/shared/utils/citation-date.util.ts:26-31` — full form same-day branch: `` `Agendado el ${formatLongDateEs(dateFrom)}` `` | yes |
| R2   | `citation-date.util.ts:26-31` — full form multi-day branch: `` `Agendado entre ${formatLongDateEs(dateFrom)} y el ${formatLongDateEs(dateTo)}` `` | yes |
| R3   | `citation-date.util.ts:14-20` (`formatTime12h`) — `h % 12 === 0 ? 12 : h % 12` plus `AM`/`PM` from `h < 12`; `padStart(2,'0')` on `h12`; minute preserved | yes |
| R4   | `citation-date.util.ts:22-24` (`withTimeSuffix`) — returns `base` unchanged when `time` is null/falsy | yes |
| R5   | `citation-date.util.ts:33-38` (`formatCitationDateLabelShort`) — no "Agendado" prefix, en dash `–` for multi-day | yes |
| R6   | `src/app/features/citations/citations.component.ts:252-254` — `pillLabel(c)` returns `formatCitationDateLabelShort(c.dateFrom, c.dateTo, c.time)` | yes |
| R7   | `src/app/features/citations/citation-dialog.component.ts:123` — pending banner `<li>` renders `formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)`; no separate `{{c.time}}` suffix (folded into util output) | yes |
| R8   | `src/app/features/citations/citation-history-dialog.component.ts:50` — `.history-row-date` renders `formatCitationDateLabel(c.dateFrom, c.dateTo, c.time)`; the previous separate `.history-row-time` span was removed and the now-unused CSS rule for it is gone | yes |
| R9   | `src/app/features/citations/citations.component.ts:270` — `notifyGuardian` constructs `dateLabel = formatCitationDateLabelShort(target.dateFrom, target.dateFrom, target.time)` (passing `dateFrom` twice forces the same-day branch; matches `design.md`'s deliberate call) | yes |
| R10  | `citation-dialog.component.ts:129` — `<div class="section-label">Agendar entre</div>` immediately above `.date-row`; unconditional (no `@if`), shown in both create and edit mode. Style rule at line 43 (`font-size:12px;font-weight:700;color:var(--muted-strong);margin-bottom:6px;`) | yes |
| R11  | `citation-dialog.component.ts:286-296` (`save()`) — payload still uses `dateToDateString(this.dateFrom)` / `dateToDateString(this.dateTo)`. `dateToDateString` is imported at line 14 alongside `dateStringToDate`. No request-payload change | yes |
| R12  | `pnpm run build` exit code: 0 (verified). Zero TypeScript errors introduced; only pre-existing style-budget warnings | yes |
| R13  | `progress/impl_citation_date_format_and_label.md` T12 — covers all required scenarios (roster pill short form, pending banner full form, history dialog full form, "Agendar entre" heading, WhatsApp `{{fecha}}` short form) | yes |
| R14  | `progress/visual_citation_date_format_and_label.json` — `"pills": ["lunes 1 de junio del 2026 – martes 2 de junio del 2026 a las 07:45 AM"]`. Human-readable Spanish, short form (no "Agendado" prefix), en dash separator, AM/PM time suffix. Matches the spec's literal example exactly | yes |

## Notes for the leader

- C1/C2/C4 are marked `[ ]` for systemic reasons the implementer cannot resolve inside
  feature 27's scope: two pre-existing done-sdd=1 features (18, 19) have no spec files on
  disk (breaking `init.sh`'s step 3), and the project has no test framework at all
  (`package.json` has no test scripts; `docs/verification.md` and `docs/conventions.md`
  both explicitly acknowledge this). The reviewer protocol says to mark these `[ ]` rather
  than rubber-stamp `[x]`. Every requirement of feature 27 itself (R1–R14) is verified
  green above, the build is clean, and the visual smoke output matches the spec's literal
  example string — feature 27 is ready to close.

- The `_debug-citation.mjs` file under `frontend/scripts/` is ignored by the global
  `.git/info/exclude` rule `/frontend/scripts/*` (verified with `git check-ignore -v`),
  which is the project convention for ephemeral scratch files per `docs/conventions.md`.
  Not a stray.
