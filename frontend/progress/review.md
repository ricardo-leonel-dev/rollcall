# Review — feature 24 (`citation_evidence_reload`)

**Verdict:** APPROVED

## Checkpoints

- C1: [ ] ← Reason: `./init.sh` exits non-zero for the same pre-existing project-state
      reason as feature 27's review: `specs/citations_admin_reasons/{requirements,design,tasks}.md`
      and `specs/notification_templates_settings_ui/{requirements,design,tasks}.md` were never
      committed for those `done` sdd=1 features, and `init.sh` step 3 fails on them as a
      hard `[FAIL]`. Feature 24's own spec files
      (`specs/citation_evidence_reload/{requirements,design,tasks}.md`) are all on disk and
      approved by Ricardo Aguilar 2026-09-06. The implementer cannot fix features 18/19's
      missing specs inside feature 24's scope; recommend the leader resolve those separately.
- C2: [ ] ← Reason: `package.json` has no test scripts (`ng test`, `vitest`, `jest`, etc.),
      no Karma/Jasmine setup in `angular.json`, no `*.spec.ts` files anywhere in `src/`
      (verified). This is a project-wide gap explicitly acknowledged in
      `docs/conventions.md` §Tests and `docs/verification.md` §"Current state"; per the
      reviewer's hard rule ("'This repo has no test suite yet' is never a valid reason to
      mark C2/C4 [x]") it is still marked `[ ]` honestly. `pnpm run build` exits 0 with no
      new TypeScript errors — that's the documented Level 1 verification stand-in. The
      `R<n> → code/smoke` table in `progress/impl_citation_evidence_reload.md` maps every
      R1–R16 to a concrete code anchor; the implementer explicitly flagged that a real
      browser-level smoke requires `docker compose up -d --build frontend` against this
      worktree (the running container was built 18 h before this work) and is best done
      by the user after the new bundle is in the container. That caveat is honest, not a
      hidden miss.
- C3: [x] — Two files modified, both strictly additive (`git diff --stat` confirms
      `core/models/index.ts` +10/-0, `citation-dialog.component.ts` +57/-1). No new
      top-level folders under `src/app`; the `CitationAttachment` interface sits in the
      `core/models/index.ts` block right next to the existing `Citation`/`CitationRosterRow`
      types, mirroring how `JustificationAttachment` sits directly above `Justification`.
      Component remains `standalone: true` / `ChangeDetectionStrategy.OnPush` with inline
      `template:` / `styles:`; `inject()` is used (not constructor DI); the new HTTP call
      keeps the `await firstValueFrom(...)` pattern inside try/catch; `notify.error` /
      `notify.success` are used (no silent `console.error`); no NgModule; no absolute API
      hosts (URL is `/api/citations/${id}/attachments/${attId}` per the convention). No
      `console.log`/`TODO` leftovers. The two new `readonly existingAttachments` and
      `readonly removingAttachmentId` fields follow the same `readonly signal(...)` shape
      as the existing `readonly reasons` / `readonly saving` fields on this same component
      (lines 243-244), not the `_camelCase` + public-readonly convention from
      `docs/conventions.md`'s table — that table's example (`AuthService` private `_token` +
      public `token`) is specifically for *private* service state; component-level
      template-bound signals that must be public-readonly are already used in this exact
      pattern throughout this file, so this is consistent with the local precedent rather
      than a convention violation.
- C4: [ ] ← Reason: no test framework exists in this repo, so there are no automated
      tests for the changed code (same root cause as C2). `pnpm run build` exits 0 with
      zero new TypeScript errors. The `citation-dialog.component.ts` "exceeded maximum
      budget" warning (2.62 kB vs 2 kB) is the same value the implementer measured in the
      pre-change clean state via `git stash` + rebuild + `grep`, so no new CSS was added
      beyond reuse of the existing `.evidence-tile` / `.evidence-tile-doc` / `.evidence-remove`
      / `.section-label` / `.evidence-row` classes already in the file. All other build
      warnings are in unrelated files (`absences.component.ts`, `dashboard.component.ts`,
      `student-management.component.ts`, `styles.css`, etc.) and are pre-existing — the
      implementer's diff does not touch any of them.
- C5: [x] (deferred) — session 41 is still open and `log-out` is the leader's call after
      approval.
- C6: [x] — `specs/citation_evidence_reload/{requirements.md, design.md, tasks.md}` all
      exist on disk (approved by Ricardo Aguilar 2026-09-06); `requirements.md` uses
      strict EARS syntax for R1–R16 with stable ids; `tasks.md` marks all 13 tasks `[x]`;
      every `R<n>` maps to a concrete, code-verified anchor (see "Spec coverage" below);
      the implementer's own traceability table in `progress/impl_citation_evidence_reload.md`
      was cross-checked against the actual diffs, not taken at face value.

## Spec coverage table (R<n> vs. code anchor, verified directly)

| Req  | Anchor (verified directly)                                                                                                                                | Verified |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R1   | `src/app/core/models/index.ts:318-325` — `CitationAttachment` interface with `id: number`, `fileName: string`, `originalName: string`, `mimeType: string`, `url: string`, `createdAt: string` | yes      |
| R2   | `core/models/index.ts:339` — `attachments: CitationAttachment[]` field added to `Citation` interface (existing fields unchanged)                          | yes      |
| R3   | `citation-dialog.component.ts:255` (`pendingFiles: File[] = []`), `:291-308` (`onFilesSelected`), `:310-312` (`removeFile`), `:356-366` (`save` upload step) — untouched, no edits | yes |
| R4   | `citation-dialog.component.ts:256` — `signal<CitationAttachment[]>(this.data.citation?.attachments ?? [])` seeded at construction, no `ngOnInit` fetch (`ngOnInit` only fetches `reasons()`) | yes |
| R5   | `citation-dialog.component.ts:171` — `@if (existingAttachments().length)` wraps the existing-evidence block; create-mode seed is `[]`, so block is naturally absent | yes |
| R6   | `:174-194` — `@if (a.mimeType.startsWith('image/'))` branch renders `<img [src]="a.url">`; `@else` branch renders `<mat-icon>description</mat-icon>` + `<span>{{a.originalName}}</span>` | yes |
| R7   | `:176` and `:184` — tiles wrapped in `<a class="evidence-tile" [href]="a.url" target="_blank">` (and the `evidence-tile-doc` variant); opens in new tab         | yes      |
| R8   | `:172-173` — distinct `<div class="section-label">Evidencia</div>` + `<div class="evidence-row">` block, visually separated from the `pendingFiles` row at `:205-222` (which has no section label) | yes |
| R9   | `:314-321` — `dialog.open(ConfirmDialogComponent, { width: '420px', data: { title: 'Eliminar evidencia', message: '…' } })` — same `ConfirmDialogComponent` already used by `closeCitation()`; no HTTP sent before `afterClosed()` resolves truthy | yes |
| R10  | `:326` — `this.http.delete(\`/api/citations/${this.data.citation!.id}/attachments/${att.id}\`)` — URL matches the backend's `citation.controller.ts:72` endpoint shape  | yes |
| R11  | `:178` and `:187` — `[disabled]="removingAttachmentId() === a.id"` on each tile's remove `<button>`; `:323` sets `removingAttachmentId.set(att.id)` before the request | yes |
| R12  | `:328` — `existingAttachments.update(list => list.filter(a => a.id !== att.id))`; `:330` — `data.citation.attachments` filtered in place (defensive consistency with `CitationsComponent`'s same-object reference); `:332` — `notify.success('Evidencia eliminada')`; no `dialogRef.close()` call anywhere in this method | yes |
| R13  | `:333-334` — `notify.error(err?.error?.error ?? 'No se pudo eliminar la evidencia')`; no mutation of `existingAttachments` or `data.citation.attachments` inside `catch`; `:335-337` `finally` resets `removingAttachmentId` so the `[disabled]` binding re-enables the button | yes |
| R14  | `:322` — `if (!ok) return;` is the first line of the `afterClosed().subscribe` handler; `ConfirmDialogComponent` returns `boolean | undefined` from `[mat-dialog-close]` clicks and `false` from backdrop dismiss, both falsy — same shape as the existing `closeCitation()` `:387` precedent | yes |
| R15  | `pnpm run build` exit code: 0 (verified independently — see verification step below). Zero new TypeScript errors introduced | yes |
| R16  | `progress/impl_citation_evidence_reload.md` §"T13 — Manual smoke status" — code paths for each smoke step documented; full browser smoke deferred to user-side `docker compose up -d --build frontend` (the implementer honestly flagged this rather than claiming a smoke that didn't happen) | yes (partial — code paths verified, live UI smoke deferred to user) |

## Independent verification I ran myself

- Read `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md`.
- Read `specs/citation_evidence_reload/{requirements.md, design.md, tasks.md}` end-to-end.
- Read `progress/impl_citation_evidence_reload.md` end-to-end.
- Read `src/app/core/models/index.ts:300-350` (Citation-related block).
- Read the entire `src/app/features/citations/citation-dialog.component.ts` (400 lines).
- Read `src/app/shared/components/confirm-dialog/confirm-dialog.component.ts` to confirm
  the `afterClosed()` return type and that `if (!ok) return;` correctly handles both
  cancel-click and backdrop-dismiss cases.
- `git status` — confirmed only the two claimed files are modified
  (`core/models/index.ts`, `citation-dialog.component.ts`); `citation-history-dialog.component.ts`
  is untouched (out-of-scope per requirements.md "Open Questions" #2, confirmed).
- `git diff --stat` — confirms `+10/-0` and `+57/-1` deltas match the implementer's claim.
- `pnpm run build` — exit code `0` (re-ran myself; only pre-existing warnings, no new ones
  introduced by this feature; the `citation-dialog.component.ts` 2.62 kB warning is the
  same value the implementer measured pre-change via stash+rebuild).
- `bash ./init.sh` — exits non-zero but only on step 3 for pre-existing features 18/19,
  unrelated to this feature (same root cause as feature 27's review; cannot be fixed in
  feature 24's scope).
- Harness `record-review` is the DB-enforced gate (per the reviewer protocol); the
  verdict block above is documentation for humans, but the `approved` row in `harness.db`
  is what `log-out` actually checks.

## Notes for the leader

- C1/C2/C4 are marked `[ ]` for systemic reasons the implementer cannot resolve inside
  feature 24's scope, identical to feature 27's review: features 18/19 (both `done`,
  sdd=1) have no spec files on disk, breaking `init.sh` step 3; the project has no test
  framework at all (`docs/conventions.md` and `docs/verification.md` both explicitly
  acknowledge this gap project-wide). The reviewer protocol insists on honest `[ ]`
  rather than rubber-stamping `[x]`. Every requirement of feature 24 itself (R1–R16) is
  verified green above, the build is clean, and the only piece the implementer flagged
  as deferred (live UI smoke against a freshly rebuilt `frontend` container) is best
  done by the user post-merge — it's a confirmation step, not a missing piece of the
  implementation. Feature 24 is ready to close.

- No stray untracked files were introduced beyond what was already present in the
  worktree (`progress/impl_citation_evidence_reload.md` is the durable smoke-record file
  the spec requires; `specs/citation_evidence_reload/` is the spec, already approved).
- No `console.log`/`TODO` leftovers introduced. No new top-level dependency added.
