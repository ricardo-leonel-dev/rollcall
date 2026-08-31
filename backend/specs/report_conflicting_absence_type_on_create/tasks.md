# Tasks — Reportar conflicto de tipo al crear ausencias en un rango

Each `T<n>` is a concrete, atomic step the implementer follows top-to-bottom. Every `T<n>` lists
the file(s) it touches, the `R<n>` requirement(s) it advances, and a verifiable done-condition.
The implementer checks these off in order; the reviewer rejects the feature if any are left `[ ]`
without a documented, reviewer-accepted justification in
`progress/impl_report_conflicting_absence_type_on_create.md`.

- [ ] T1 (R1, R2, R3, R4, R5, R6, R7, R9) In `src/services/absence.service.ts`, widen the
      existing-rows query inside `createRange` to also select `type`, build
      `existingTypeByDate: Map<string, 'F' | 'AT'>` from it, derive `existingDates` from that
      map's keys (replacing the current `Set` built directly off the query rows), and compute
      `skippedDetails` from `days.filter(d => existingDates.has(d))`, exactly as shown in
      `design.md`'s "Exact code shape" section. Do not change the `toCreate`/`softDeletedRows`/
      `toRestore`/`toInsert` derivation or the transaction body. Done: `git diff` shows only the
      widened `SELECT`, the new `existingTypeByDate` map, the `existingDates` derived from it,
      and the new `skippedDetails` construction — no other lines in the function change.

- [ ] T2 (R1, R2, R3, R4, R5, R6, R7, R9) In the same file, update `createRange`'s return
      statement to `return { created: toCreate.length, skipped: days.length - toCreate.length,
      skippedDetails };` and widen the function's `Promise<...>` return type annotation to
      include `skippedDetails: Array<{ date: string; existingType: 'F' | 'AT'; conflict:
      boolean }>`, exactly as shown in `design.md`. Done: `pnpm run build` exits 0 with no new
      TypeScript errors attributable to `absence.service.ts` (R9).

- [ ] T3 (R9) Inspect `src/controllers/absence.controller.ts`'s `POST /` handler and confirm no
      change is needed (it already forwards `svc.createRange`'s resolved value as the JSON body).
      Done: documented in `progress/impl_report_conflicting_absence_type_on_create.md` that this
      file was inspected and intentionally left unchanged, with the line number cited.

- [ ] T4 (R1, R2, R3, R4, R5, R6, R7, R8) Run `docker compose up --build` from the repo root and,
      against a seeded enrollment, exercise `POST /api/absences` with a JWT that has `create`
      permission on `absences`, covering all four cases from R8: (i) a date range where one date
      already has an active absence of the SAME `type` as requested → response's
      `skippedDetails` contains that date with `conflict: false` and the correct `existingType`,
      `skipped` includes it, `created` does not; (ii) a date range where one date already has an
      active absence of a DIFFERENT `type` (e.g. existing `F`, requesting `AT`, or vice versa) →
      response's `skippedDetails` contains that date with `conflict: true` and the correct
      `existingType`; (iii) one call whose range mixes brand-new dates, a same-type-skip date,
      and a different-type-skip date → `created`, `skipped`, and `skippedDetails` are mutually
      consistent (`skippedDetails.length === skipped`, every `skippedDetails` date is one of the
      skipped dates, ascending order); (iv) soft-delete a previously-created absence for a date,
      then re-run `POST /api/absences` for that same date/enrollment/type → the date is NOT in
      `skippedDetails` and counts toward `created`, confirming the restore path is unaffected.
      Capture each request/response verbatim in
      `progress/impl_report_conflicting_absence_type_on_create.md`'s Traceability section.

- [ ] T5 (R9) Run `pnpm run build` and `./init.sh`. Done: `pnpm run build` exits 0 with no new
      TypeScript errors attributable to `absence.service.ts` or `absence.controller.ts` (the
      pre-existing infra `[WARN]`s for empty `verify_command` and unset `SUPABASE_URL` are
      unchanged from baseline); `./init.sh` ends with `[OK] Environment ready`. Document the
      build output in `progress/impl_report_conflicting_absence_type_on_create.md`.

## Reverse traceability (every `R<n>` is covered by at least one `T<n>`)

| `R<n>` | Covered by |
|---|---|
| R1 | T1, T2, T4 |
| R2 | T1, T2, T4 |
| R3 | T1, T2, T4 |
| R4 | T1, T2, T4 |
| R5 | T1, T2, T4 |
| R6 | T1, T2, T4 |
| R7 | T1, T2, T4 |
| R8 | T4 |
| R9 | T2, T3, T5 |
