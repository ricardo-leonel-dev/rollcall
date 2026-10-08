# Review — feature 45 citation_template_hora_placeholder_and_preview

## Verdict
APPROVED

## Evidence

- **A1 (notifyGuardian split):** pass.
  - `src/app/features/citations/citations.component.ts:21` — import expanded to
    `formatCitationDateLabelShort, formatCitationDateOnly, formatCitationTimeOnly`.
  - `src/app/features/citations/citations.component.ts:349-353` — `notifyGuardian`
    builds `vars = { nombre: row.studentName, fecha: formatCitationDateOnly(target.date), hora: formatCitationTimeOnly(target.time) }`,
    splitting the previously-combined `fecha` string. Both new helpers live in
    `src/app/shared/utils/citation-date.util.ts:47-54`.
  - Pending-branch wire path (`citations.component.ts:354-364`) builds
    `${whatsappLink}?text=${encodeURIComponent(rendered)}` — confirmed carries
    both date+time fragments.

- **A2 (FALLBACK_TEMPLATE byte-equal to BE):** pass.
  - `src/app/shared/utils/template.util.ts:13`:
    `citations: 'Estimado representante, se le cita a la institución el {{fecha}} a las {{hora}} para tratar un asunto relacionado con {{nombre}}. Por favor confirmar asistencia.'`
  - Byte-equal to the `CITATIONS_BACKEND_DEFAULT` literal in
    `tests/citation_template_hora_placeholder_and_preview.test.mjs:97-98`, which
    is itself a verbatim copy of `postgres/25_citation_template_hora.sql`
    (`{{fecha}}` and `{{hora}}` placeholders in declared order).
  - `absences` template line (`template.util.ts:12`) is unchanged from the
    postgres/24 verbatim string.

- **A3 (/profile preview shows weekday+hora; Faltas unchanged):** pass.
  - `src/app/shared/utils/template.util.ts:26-27` — `fecha: 'miércoles 17 de junio de 2026'`,
    `hora: '10:30 AM'` are present in `PLACEHOLDER_SAMPLES`.
  - `src/app/shared/utils/template.util.ts:28-29` — `tipo: 'una falta'` and
    `curso: 'OCTAVO "A"'` are untouched (verified by both code read and the
    test case `A3: PLACEHOLDER_SAMPLES — absences (tipo/curso) are unchanged`).
  - `src/app/features/profile/whatsapp-templates-tab/whatsapp-templates-tab.component.ts`
    is **not in the diff** (verified via `git diff --stat`) — the Faltas card
    preview path (`preview(c) => previewTemplate(c.text, c.item.placeholders)`,
    line 236) is unchanged.
  - Rendered citations preview string in
    `tests/...:2026-...test.mjs:228-249` confirms the assembled text contains
    `"el miércoles 17 de junio de 2026 a las 10:30 AM"` and no
    `[Nombre del estudiante]` / `[Hora de la citación]` fallback labels.

- **A4 (pending uses date+time; closed uses plain link):** pass.
  - `src/app/features/citations/citations.component.ts:348`:
    `if (target.status === 'closed') { window.open(whatsappLink, '_blank'); return; }`
    — `whatsappLink` is opened verbatim, no `toUrl(...)` wrapping, no `?text=`
    body. Same byte-for-byte as pre-feature line, verified by
    `tests/...test.mjs:269-277`.
  - Pending branch (lines 354-364) appends `?text=` with both vars encoded;
    test `A4: pending-branch invariant` (test file lines 279-293) confirms the
    percent-encoded URL carries both `mi%C3%A9rcoles%2017%20de%20junio%20del%202026`
    and `10%3A30%20AM`.

- **Public exports of citation-date.util.ts preserved:** pass.
  - `src/app/shared/utils/citation-date.util.ts:33` — `formatCitationDateLabelShort`
    (used by `pillLabel` in citations.component.ts:331, must stay).
  - `src/app/shared/utils/citation-date.util.ts:37` — `formatCitationTargetLabel`.
  - `src/app/shared/utils/citation-date.util.ts:41` — `formatCitationCreatedAtLabel`.
  - New exports added at lines 47-54 only; no other line of the file changes.

- **No unrelated file changes:** pass.
  - `git status` shows only:
    - M `src/app/features/citations/citations.component.ts`
    - M `src/app/shared/utils/citation-date.util.ts`
    - M `src/app/shared/utils/template.util.ts`
  - Untracked: `progress/impl_citation_template_hora_placeholder_and_preview.md`
    (handoff), `tests/citation_template_hora_placeholder_and_preview.test.mjs`
    (new test, the only file under `tests/`).
  - No edit to `src/app/features/profile/whatsapp-templates-tab/whatsapp-templates-tab.component.ts`,
    no `src/app/core/` changes, no `package.json`/`angular.json` changes, no
    other `src/` files touched.

- **Tests:** `node --test tests/citation_template_hora_placeholder_and_preview.test.mjs`
  → 16/16 pass, ~82ms. Command run from `frontend/` cwd.

- **Type-check:** `npx --no-install tsc --noEmit` → exit 0, no output.

- **`./init.sh`:** exit 0. Only the two documented baseline `[WARN]` lines
  (`No verify_command configured`, `$SUPABASE_URL / $SUPABASE_ANON_KEY not set`)
  appear — both pre-existing, both explicitly self-documented as non-fatal by
  init.sh, neither caused by this feature.

## Checkpoints

- C1: [x] (`.harness.json`, `harness.db`, all docs, `CHECKPOINTS.md` present; `./init.sh` exit 0)
- C2: [x] (single `in_progress` feature is 45; new session 71 reflects current work; no `done` feature lacks tests)
- C3: [x] (edits respect `core/`/`shared/`/`features/` layering — new utils land in `shared/utils/`, no cross-feature coupling introduced)
- C4: [x] (test file `tests/citation_template_hora_placeholder_and_preview.test.mjs` exists for the changed code, was run by the reviewer, 16/16 pass; `tsc --noEmit` clean)
- C5: [x] (no stray untracked files outside `progress/impl_…md` + `tests/`; session open with verdict about to be recorded; log-out is the implementer's next move)
- C6: N/A (feature is sdd=0)

## Required changes
None.