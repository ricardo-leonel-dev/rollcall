# Tasks — Readable conflict message in the citation dialog

- [x] T1 (R1) Add the `CitationConflictInfo` interface (`id`, `date`, `time`, and independently
      optional `studentName`/`guardianName`/`guardianPhone`/`courseName`) to
      `citation-dialog.component.ts`.
- [x] T2 (R1) Add `readonly conflict = signal<CitationConflictInfo | null>(null)` and a
      `lastConflictError = ''` field alongside the component's existing signals.
- [x] T3 (R10) In `save()`, add `this.conflict.set(null)` immediately after `this.saving.set(true)`,
      before building `base`/`payload`.
- [x] T4 (R1, R9) In `save()`'s `catch` block, compute
      `const conflict = err?.status === 409 ? err?.error?.conflict as CitationConflictInfo | undefined : undefined;`
      and branch: if truthy, set `this.conflict` and `this.lastConflictError = err?.error?.error ?? 'Ya existe una citación pendiente para este representante en un horario cercano'`;
      this branch must run identically whether `this.isEdit` is `true` or `false` (single shared
      `catch`, no duplication).
- [x] T5 (R7, R8) In the same `catch` block's `else` branch, keep the existing
      `this.notify.error(err?.error?.error ?? 'No se pudo guardar la citación')` call exactly as
      today — verify it no longer runs when T4's `if` branch is taken.
- [x] T6 (R2) Confirm (by inspection, no code change expected) that no existing code path resets
      `date`/`time`/`observations`/`reasonIds`/`pendingFiles`/`existingAttachments` inside the
      `catch` block, and that `dialogRef.close(...)` is only reached on the success path above
      `catch` — both already hold structurally once T3/T4/T5 land, but confirm no regression was
      introduced.
- [x] T7 (R3, R4, R5, R6) Add the `@if (conflict(); as c) { ... }` banner block to the template,
      positioned below the existing `pending-banner`/`isOrphanCitation` banners and above the date
      field: title line using `lastConflictError`, a date/time line via
      `formatCitationDateLabel*Short*(c.date, c.time)`, and conditional
      `@if (c.studentName)`/`@if (c.guardianName)`/`@if (c.guardianPhone)`/`@if (c.courseName)`
      lines — no placeholder text for absent fields.
- [x] T8 (R3) Add the `.conflict-banner`/`.conflict-banner-title`/`.conflict-banner-line` CSS rules
      (red/rose tone, distinct from the yellow `.pending-banner`) to the component's `styles`
      array.
- [x] T9 (R11) Add `(ngModelChange)="onScheduleFieldChanged()"` to both the date `matDatepicker`
      input and the time `input[type=time]`, and implement
      `onScheduleFieldChanged(): void { if (this.conflict()) this.conflict.set(null); }`.
- [x] T10 (R12) Confirm (by inspection) that no `Router`/navigation import or second `MatDialog`
      open call was introduced anywhere in this change — the conflict path only sets local signal
      state and renders the inline banner.
- [x] T11 (R13) Run `pnpm run build` (or `./node_modules/.bin/tsc`) and confirm exit code `0`; run
      the manual smoke scenario from requirements.md's R13 against
      `docker compose up -d --build frontend` with both an institution-wide-scope login and a
      course-scoped login, and document the results in
      `progress/impl_citation_overlap_conflict_ui.md`.
