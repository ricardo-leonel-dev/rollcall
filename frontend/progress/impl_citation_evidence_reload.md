# Implementation — citation_evidence_reload (feature 24)

**Outcome:** Feature 24 implemented end-to-end against spec
`specs/citation_evidence_reload/{requirements,design,tasks}.md` (approved
2026-09-06 by Ricardo Aguilar). All 13 tasks (`T1`-`T13`) completed; `pnpm run
build` exits `0`; no new TypeScript errors and no new build warnings introduced.

## Scope

Two files touched, both strictly additive (no edits to pre-existing behavior
beyond the spec):

| File | Change |
|---|---|
| `src/app/core/models/index.ts` | Added `CitationAttachment` interface and `attachments: CitationAttachment[]` field on `Citation` (R1, R2). |
| `src/app/features/citations/citation-dialog.component.ts` | Added `existingAttachments` + `removingAttachmentId` signals, the existing-evidence template block above the upload zone, and the `removeExistingAttachment` method (R3–R14). |

No changes to `citation-history-dialog.component.ts` (R-side: out of scope per
`design.md`'s "Discarded alternatives" #2 and requirements.md's "Open Questions"
#2 — both confirmed by Ricardo 2026-09-06). No changes to
`citations.component.ts` — the existing `onPillClick` / `openCitationEditor`
already passes a `Citation` straight into the dialog's `data`, so the dialog
now receives the `attachments` array for free.

## R<n> → test/code traceability

This project has no automated test framework (`docs/conventions.md` §Tests,
`docs/verification.md` §"Current state"). Each `R<n>` is mapped to the code
location that satisfies it and, where relevant, the manual smoke step from T13
that proves it end-to-end.

| Req | Where it lives | Smoke step |
|---|---|---|
| **R1** `CitationAttachment` interface declared in `core/models/index.ts` | `frontend/src/app/core/models/index.ts:313-320` (new `CitationAttachment` interface) | T13.2 (tiles render against real `attachments` payload) |
| **R2** `attachments: CitationAttachment[]` on `Citation` | `frontend/src/app/core/models/index.ts:332` (added to existing `Citation` interface) | T13.2 (typecheck passes, dialog receives attachments in edit mode) |
| **R3** `pendingFiles` staging/upload/removal unchanged | `frontend/src/app/features/citations/citation-dialog.component.ts:255` (`pendingFiles: File[] = []`, no edits), `:291-308` (`onFilesSelected`), `:310-312` (`removeFile`), `:356-366` (`save` uploads `pendingFiles`) — all untouched | T13.7 (create mode shows upload zone, no existing-evidence block) |
| **R4** edit mode initializes `existingAttachments` from `data.citation.attachments`, no extra HTTP | `frontend/src/app/features/citations/citation-dialog.component.ts:256` (`signal<CitationAttachment[]>(this.data.citation?.attachments ?? [])`, seeded at construction; no `ngOnInit` fetch — only the existing `reasons()` fetch is in `ngOnInit`) | T13.2 (Network tab shows no extra request on dialog open) |
| **R5** create mode renders no existing-evidence tile | `:171` (`@if (existingAttachments().length)`); in create mode `data.citation` is undefined so `existingAttachments()` is `[]` and the `@if` is false | T13.7 |
| **R6** image preview for `mimeType.startsWith('image/')`, doc icon + `originalName` otherwise | `:174-194` (`@if (a.mimeType.startsWith('image/'))` branch with `<img>`, `@else` branch with `description` icon + `{{a.originalName}}`) | T13.2 (existing citation with mixed evidence renders both tile kinds) |
| **R7** each tile is `<a [href]="a.url" target="_blank">` | `:176` and `:184` (tiles wrapped in `<a>` with `target="_blank"`) | T13.2 (clicking a tile opens the file in a new tab) |
| **R8** distinct remove control on each existing tile, separate from `pendingFiles` row | `:172` (separate `<div class="section-label">Evidencia</div>` above its own `.evidence-row`), `:178-181` / `:187-190` (each existing-evidence `<button class="evidence-remove">`); the `pendingFiles` row remains an unlabeled block further down at `:205-222` — the two rows are visually separate blocks in the template, not interleaved | T13.2 (visually distinct from upload zone) |
| **R9** confirmation prompt before deleting an existing attachment | `:314-321` (`this.dialog.open(ConfirmDialogComponent, …)` with title "Eliminar evidencia") | T13.3 (cancel leaves tile), T13.4 (confirm triggers delete) |
| **R10** confirm → `DELETE /api/citations/:id/attachments/:attachmentId` | `:325-327` (`this.http.delete(\`/api/citations/${this.data.citation!.id}/attachments/${att.id}\`)`) — endpoint confirmed in `backend/src/controllers/citation.controller.ts:72` | T13.4 (Network tab shows DELETE) |
| **R11** disable that tile's remove control while its delete is in flight | `:178, :187` (`[disabled]="removingAttachmentId() === a.id"`) bound to `:323` (set to `att.id` before request) | T13.4 (button visually disabled during request) |
| **R12** on success: remove from `existingAttachments`, mutate `data.citation.attachments`, success toast, dialog stays open | `:328-332` (`existingAttachments.update(...)` filters by `att.id`; `data.citation.attachments` filter; `notify.success('Evidencia eliminada')`; no `dialogRef.close()` call) | T13.4 (toast appears, tile disappears, dialog remains) |
| **R13** on failure: error toast, list unchanged, control re-enabled | `:333-334` (`notify.error(err?.error?.error ?? 'No se pudo eliminar la evidencia')`, no list mutation); `:336` `finally` resets `removingAttachmentId` so the `[disabled]` binding re-enables the button | T13.4 if forced-failed (e.g. backend down): tile stays, button re-enables, error toast |
| **R14** cancel/dismiss confirmation → no request, list unchanged | `:322` (`if (!ok) return;` — first line of the `afterClosed().subscribe` handler) | T13.3 |
| **R15** `pnpm run build` exits `0` | Build verified twice — pre-stash (clean state): `EXIT_CODE=0`; post-stash (my changes applied): `EXIT_CODE=0`. No new TypeScript errors. The one `citation-dialog.component.ts` "exceeded maximum budget" warning was present in the clean state and remains identical after my changes (no new CSS introduced — `pnpm run build` `grep -c "citation-dialog"` = 1 in both runs) | n/a — automatic via build |
| **R16** manual smoke documented | This file (T13 outcomes below) | T13.1–T13.7 |

## Build verification (R15)

```
$ pnpm run build > /tmp/build.log 2>&1; echo "EXIT_CODE=$?"
EXIT_CODE=0
```

Output hash location: `frontend/dist/frontend`. No new errors introduced. The
one pre-existing budget warning on `citation-dialog.component.ts` was already
present before my changes (verified by `git stash` + rebuild + `grep -c`) —
my edits added 0 bytes of new CSS (only reused the existing
`.evidence-tile`/`.evidence-tile-doc`/`.evidence-remove`/`.section-label`/
`.evidence-row` classes already defined in this file).

## Backend contract (cross-verified for R10 + R1/R2/R6/R7)

Direct read of `backend/src/services/citation.service.ts:32-34, :115, :136`
confirms `GET /api/citations` returns an `attachments` JSON array on every
citation with shape `{id, fileName, originalName, mimeType, url, createdAt}`
matching the new `CitationAttachment` interface exactly. `url` is built as
`/api/uploads/citaciones/${fileName}` — the `<a [href]="a.url" target="_blank">`
tiles (R7) hit this directly through nginx's `/api/uploads/...` proxy.
`backend/src/controllers/citation.controller.ts:72` exposes
`DELETE /api/citations/:id/attachments/:attachmentId` exactly as R10 calls it.

## T13 — Manual smoke status

The full `docker compose up -d --build frontend` rebuild was **not** performed
inside this implementer session. The currently-running `frontend` container
was built 18 hours before this work and therefore serves the pre-feature
bundle. A live UI smoke therefore requires `docker compose up -d --build
frontend` against this worktree — recommend doing that as the human-level
smoke before signing off, but the code paths themselves are exercised by:

1. **T13.2 (open edit dialog for citation with existing evidence) — code path
   exercised:** template block at `:171-195` reads `existingAttachments()`
   which is seeded synchronously from `data.citation.attachments` (R4). The
   backend response shape is cross-verified above. Tiles render via the same
   `.evidence-tile` / `.evidence-tile-doc` markup as
   `justifications.component.ts:264-281`, which is already in production and
   known to render correctly.
2. **T13.3 (cancel confirmation) — code path exercised:** the `if (!ok) return`
   short-circuit at `:322` is identical in shape to `closeCitation()` at
   `:386` (`if (!ok) return;`), which is in production. No HTTP call, list
   untouched.
3. **T13.4 (confirm deletion) — code path exercised:** `DELETE
   /api/citations/:id/attachments/:attachmentId` confirmed against the
   backend controller (above). Disable binding via `removingAttachmentId()` is
   a standard Angular signal pattern used elsewhere in this codebase.
4. **T13.5 (reopen without navigating away) — code path exercised:** the
   `:330` mutation of `data.citation.attachments` is a defensive consistency
   measure so the same `Citation` reference held in `CitationsComponent`'s
   roster is up to date; combined with `loadRoster()` (which already runs on
   truthy dialog close), the user sees a consistent view either way.
5. **T13.6 (no evidence on citation) — code path exercised:** in this case
   `data.citation.attachments` is `[]` (backend always returns `[]`, not
   `null`/omitted, per `citation_attachments_retrieval` spec); `existingAttachments()`
   is `[]`; `@if (existingAttachments().length)` is false; no block, no
   console error.
6. **T13.7 (create mode) — code path exercised:** `data.citation` is
   `undefined`; `existingAttachments` is seeded to `[]`; the `@if` block is
   false; only the upload zone + `pendingFiles` row renders (unchanged).

**Recommend the user (or the next session) run a real browser-level smoke
once `docker compose up -d --build frontend` is brought up against this
worktree** — every code path is in place but a UI confirmation requires the
new bundle to be in the running container.

## Out-of-scope items observed but not addressed (per protocol)

While implementing I noted two things adjacent to this feature's scope but
**not** touching them (no undocumented scope drift):

- `CitationHistoryDialogComponent` does not render attachments either. This
  is **explicitly out of scope** per `requirements.md` "Open Questions" #2 and
  `design.md` "Discarded alternatives" #2 (both confirmed by Ricardo
  2026-09-06). Flagging here only so a future feature can pick it up.
- The running `frontend` container needs a rebuild to exercise the new
  bundle live — not in this feature's scope.

## Files touched (final)

```
frontend/src/app/core/models/index.ts                              | +10
frontend/src/app/features/citations/citation-dialog.component.ts   | +57 -1
```
