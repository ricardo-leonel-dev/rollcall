# Re-amend: `require_full_dates_on_quarters`

**Date:** 2026-08-29
**Actor:** spec_author (re-amend, not a fresh draft — feature was already in `spec_ready`)
**Trigger:** backend feature `backend_rechaza_trimestres_sin_fecha_de_inicio_o_fin_migraci_n_de_datos_legados`
shipped to `done` after this spec was drafted, adding a second source of truth for the
missing-dates error message and removing the legacy-data scope this spec originally targeted.

## What changed in the backend (context, not edited here)

- Migration `postgres/19_quarters_softdelete_legacy_null_dates.sql` applied: sets
  `deleted_at = NOW()`, `is_active = false` on every `quarters` row with
  `start_date IS NULL OR end_date IS NULL`. Idempotent. Verified post-apply via
  `SELECT count(*) FROM quarters WHERE deleted_at IS NULL AND (start_date IS NULL OR end_date IS NULL)`
  returning `0`.
- Backend validation enforced in two layers with the exact same Spanish string the spec's R1
  mandates:
  - `backend/src/controllers/quarter.controller.ts:25,31` — guards on `POST /` and `PUT /:id`,
    returns HTTP 400 with body `El período debe tener fecha de inicio y fecha de fin.`.
  - `backend/src/services/quarter.service.ts:57` — private `assertValidDates(range)` helper
    called from both `create` and `update`.
- One residual source of null-dated rows: `seedQuarters()` (called from
  `academic-year.service.ts#create`) still inserts 3 quarters with `startDate: null,
  endDate: null` for every newly-created academic year. A single `PUT /api/quarters/:id`
  with both dates supplied repairs them (verified live with curl).

## Spec changes

### `requirements.md`

- **Intro paragraph (was lines 10-15, now 10-22):** replaced the outdated "even though the
  backend still accepts nullable dates" framing with a pointer to the now-`done` backend
  feature, the exact Spanish string the backend uses (byte-for-byte identical to R1's
  error string), and an explicit "no server-error fallback needed in the dialog" rationale.
  *Why:* the previous framing was the load-bearing assumption of the entire spec, and it
  became false the moment the backend shipped — without this edit a reader would conclude
  the spec was wrong or stale.
- **A3 acceptance-criterion mapping (was lines 24-25, now 31-36):** renamed "legacy data"
  to "incomplete dates" and added a parenthetical scope note narrowing A3 to the 3 quarters
  `seedQuarters()` inserts for a freshly-created AY. *Why:* historical legacy rows no longer
  exist; the spec still has a legitimate A3 path, just for a narrower scope, and that
  scope must be explicit so the implementer/reviewer don't waste cycles hunting for
  pre-migration data in the DB.
- **R1 (was lines 31-37, now 42-57):** added a "Source-of-truth alignment (2026-08-29
  re-amend)" paragraph below R1 pinning the Spanish string as a shared message between
  dialog and wire, citing `backend/src/controllers/quarter.controller.ts:25,31` and
  `backend/src/services/quarter.service.ts:57`. *Why:* R1 is now one of two places this
  string lives; future string edits must update both, and the requirement is the only
  durable place to document that contract (T8 enforces it operationally).
- **R5 (was lines 59-63, now 79-90):** added a scope note narrowing "legacy data" to the
  3 freshly-seeded quarters per AY; removed the "saved before this feature existed"
  qualifier. *Why:* the historical-rows framing is no longer reachable in production.
- **R9 (was lines 90-99, now 117-127):** reworded "academic year with a legacy quarter
  missing one or both dates" to "freshly-created academic year (whose 3 seeded quarters
  from `seedQuarters()` are still null-dated)". *Why:* same as R5 — the trigger is the
  same path through a narrower scope.

### `design.md`

- **Lead paragraph (was lines 11-14, now 11-23):** replaced "no backend change (backend
  still accepts nullable `start_date`/`end_date`; a separate Notion card tracks
  server-side enforcement, out of scope here)" with a description of the backend's new
  enforcement (controller lines, service helper, HTTP 400, the Spanish string), the
  migration that soft-deleted historical rows, and a framing of the frontend change as
  the **client-side mirror** of the backend rule. *Why:* the lead paragraph was the
  strongest assertion in the spec that the backend does not enforce this rule — flipping
  it is the headline change of the re-amend.
- **Legacy data (R5, R6) section (was lines 96-106, now 104-125):** added a scope note
  narrowing the reachable null-dated rows to the 3 `seedQuarters()`-inserted quarters
  per fresh AY; added the observation that historical rows were soft-deleted and no
  longer surface in `GET /api/quarters`; added a note that repair is one PUT, not a
  "fill and save twice" dance. Reworded "legacy quarter" → "freshly-seeded quarter"
  in the subsequent paragraphs. *Why:* keeps the A3/R5/R6 path in the spec (the
  requirement still applies to the freshly-seeded rows; the eager `computed()` still
  fires on first render), but with the new reachable scope.
- **New section "Source-of-truth alignment (2026-08-29 re-amend)" (now lines 127-136):**
  pins the byte-for-byte parity requirement, names the two source files in the backend
  repo, and points to T8 as the operational enforcement. *Why:* requirements.md has R1's
  alignment paragraph; design.md needs the design-time rationale (why we accept the
  maintenance cost of two copies) and the canonical references for grep.
- **New section "Error handling (2026-08-29 re-amend)" (now lines 138-147):** explicit
  statement that no server-error fallback for "missing dates" is needed and that the
  implementer should not add an `errorInterceptor` branch / `save()` catch / result-error
  mapping for this case. *Why:* the most plausible drift the implementer could introduce
  in response to "the backend now rejects this" is a defensive server-error branch — this
  section heads it off by stating explicitly that the branch would handle a scenario
  that's unreachable when R1 fires first.

### `tasks.md`

- **T4 (was lines 39-46, now 39-52):** reworded "seed one via a direct `PUT
  /api/quarters/:id` with `{"startDate": null}` if no such row exists yet, since the
  dialog itself now blocks saving one" to the new path: "create a fresh academic year
  (`POST /api/academic-years`); `seedQuarters()` will insert 3 null-dated rows; open the
  dialog on that year". Also called out that the PUT-seed trick is no longer needed
  because both the client-side R1 check and the new backend HTTP 400 block it. *Why:*
  the implementer needs a concrete reproducible way to obtain the test fixture; this is
  the path that actually works now.
- **T7 (was lines 59-69, now 65-79):** reworded (i) "open the dialog on a year with a
  legacy quarter missing a date" to "open the dialog on a freshly-created academic year
  (whose 3 seeded quarters from `seedQuarters()` are still null-dated)" — matching R9's
  new wording. Added a new sub-bullet (vi) requiring a curl direct-PUT smoke test that
  returns HTTP 400 with the same Spanish string the dialog shows — non-regression of
  the backend enforcement. *Why:* the new behavior of the backend deserves an explicit
  verification step in the manual smoke test, not just a single sentence in the spec.
- **New task T8 (R1 alignment, now lines 81-92):** explicit `grep` across both repos
  to confirm the string is byte-identical, plus a re-validate-on-any-future-change
  requirement and a recording requirement in the implementation progress note's
  Traceability section. *Why:* the implementer needs an explicit, atomic check they can
  run and document, separate from "did the dialog render the error inline" (which T4
  covers) and "did the smoke test pass" (which T7 covers); string-parity is a distinct
  concern that deserves its own checkbox.
- **Reverse traceability table (now lines 94-107):** added R1 to T8's covered-by list,
  and added a synthetic "R1 alignment (string parity, added in 2026-08-29 re-amend)" row
  with T8 as the only cover. *Why:* R1 itself already had T1/T4/T7; the *alignment*
  requirement is a distinct concern that didn't have a formal `R<n>` and now has a
  traceability row, consistent with the existing convention that anything the implementer
  must do has at least one `T<n>` mapped to it. This is a synthetic addition — no new
  requirement number, no scope creep, just a way to keep the traceability table honest
  after the re-amend.

## Things I considered but did NOT change (and why)

- **Did not change `requirements.md`'s R1 message string itself.** It was already
  byte-identical to the backend's new HTTP 400 body — the string is the whole point of
  the re-amend's "source-of-truth alignment" guarantee. Changing it would break the
  guarantee.
- **Did not change `design.md`'s "File to touch" table.** It still reads
  `R1, R2, R3, R4, R5, R6, R7` against the single quarters-dialog file. That's correct:
  the re-amend did not introduce any new files to touch, and the alignment work is
  enforced via R1's narrative paragraph + T8's grep, not a new file.
- **Did not change `design.md`'s "Exact change" code block.** The code being inserted
  is unchanged — same position in the loop, same string, same `continue` pattern. Only
  the *rationale* and *constraints around it* changed.
- **Did not change `design.md`'s "Why the `if (start && end)` guards are not removed"
  section.** That defensive-coding rationale is independent of whether the backend
  enforces the rule; it still holds because the mid-edit transient state still exists
  in the dialog regardless of what the backend does.
- **Did not change the Discarded alternatives.** None of the three reasons for rejection
  are weakened or invalidated by the backend change:
  - The `Validators.required` alternative was rejected because the file's centralized
    `Map<localId, string>` model is a single source of truth for inline error display and
    save-button gating — still true and arguably more important now that two layers
    (client + backend) must agree on the same string.
  - The three-messages alternative was rejected on UX/symmetry grounds — backend now
    uses a single string, which strengthens the rejection (one source of truth beats
    three near-duplicates even more convincingly).
  - The extract-to-utility-function alternative was rejected on single-caller
    `docs/conventions.md` grounds — still a single caller.
  Adding "and the backend also uses this string" to each would be content-free filler.
- **Did not change R8 (build & verification).** The build invariants are unchanged;
  R8 doesn't touch error messages, so source-of-truth alignment isn't a build concern.
- **Did not change R7 (mid-edit transient state).** It's about defending against
  `q.startDate.getTime()` throwing on `null` during transient state, independent of
  the backend.
- **Did not introduce a new `R<n>` for "no server-error fallback needed".** That
  decision is documented as a negative in `design.md`'s "Error handling" section,
  which is sufficient — making it a requirement would imply the implementer must
  actively do something, when the design's intent is for them to NOT do something.
  Negative requirements add review overhead for no enforcement value.
- **Did not change the number of implementation tasks** (T1-T7 unchanged in scope; T8
  is a verification task, not an implementation task). The single-file change in
  `validationErrors()` is exactly the same line of code as before the re-amend.

## Sanity-check results

- `grep -n "El período debe tener fecha de inicio y fecha de fin" specs/require_full_dates_on_quarters/requirements.md`
  returns 3 hits (intro paragraph line 15, R1 line 46, R1 alignment paragraph line 50), all
  byte-identical to the backend string. OK.
- `grep -n "backend" specs/require_full_dates_on_quarters/design.md` returns 9 hits across
  the lead paragraph, "Source-of-truth alignment" section, and "Error handling" section.
  OK.
- `ls specs/require_full_dates_on_quarters/` returns only `design.md`, `requirements.md`,
  `tasks.md`. OK.
- No `claim-spec`, `mark-spec-ready`, `approve-spec`, or `claim` command was run. OK.

## Hand-off

This re-amend only updates spec content; the feature remains in `spec_ready`. The next
gate is human review of the updated files, followed by the orchestrating leader running
`scripts/harness.sh approve-spec require_full_dates_on_quarters --by <name>` (per
`AGENTS.md` §9 step 3). After that, the implementer can claim the feature for the single
T1 line-of-code change plus T8's grep verification.