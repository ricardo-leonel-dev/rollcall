# impl_citation_template_hora_placeholder_and_preview

Feature 45 — `citation_template_hora_placeholder_and_preview` (sdd=0).

## Outcome

Citation WhatsApp message now fills `{{hora}}` separately from `{{fecha}}`,
matching backend `message_template_actions.action_key='citations'` row seeded
by `postgres/25_citation_template_hora.sql`. The /profile preview for the
Citaciones card renders weekday + 12h time; the Faltas card is unchanged.
Closed citations still open the link-only `wa.me/<phone>` URL.

## Scope

In-scope edits only — no other feature, no unrelated refactor.

| File | Change |
| --- | --- |
| `src/app/shared/utils/citation-date.util.ts` | +2 exports: `formatCitationDateOnly`, `formatCitationTimeOnly`. Existing public exports (`formatCitationDateLabelShort`, `formatCitationTargetLabel`, `formatCitationCreatedAtLabel`) untouched. |
| `src/app/features/citations/citations.component.ts` | `notifyGuardian`: vars split from a single combined `fecha` string into `{nombre, fecha, hora}`. `formatCitationDateOnly` for the date fragment, `formatCitationTimeOnly` for the time fragment. Closed-branch line (`window.open(whatsappLink, '_blank')`) untouched. |
| `src/app/shared/utils/template.util.ts` | `FALLBACK_TEMPLATES.citations` byte-for-byte the migration-25 default. `PLACEHOLDER_SAMPLES` gains `hora: '10:30 AM'` and `fecha` now includes the weekday (`'miércoles 17 de junio de 2026'`). Header comment updated to cite migrations 24 + 25. `absences` row of `FALLBACK_TEMPLATES` and the `tipo`/`curso` samples are unchanged. |
| `tests/citation_template_hora_placeholder_and_preview.test.mjs` | New plain-JS `node --test` runner. 16 cases; pin the BE contract, the new exports, and the wire-level wa.me URL branches. |

Files outside this table were not touched.

## Files touched (absolute paths)

- `/home/rileo/ai-personal-wt/citation-template-hora-frontend/frontend/src/app/shared/utils/citation-date.util.ts`
- `/home/rileo/ai-personal-wt/citation-template-hora-frontend/frontend/src/app/shared/utils/template.util.ts`
- `/home/rileo/ai-personal-wt/citation-template-hora-frontend/frontend/src/app/features/citations/citations.component.ts`
- `/home/rileo/ai-personal-wt/citation-template-hora-frontend/frontend/tests/citation_template_hora_placeholder_and_preview.test.mjs` *(new)*

## Backend contract pinned

`postgres/25_citation_template_hora.sql` (commit `2bf958e` on origin/staging):

```
placeholders = [{"key":"nombre","label":"Nombre del estudiante"},
                {"key":"fecha","label":"Fecha de la citación"},
                {"key":"hora","label":"Hora de la citación"}]
default_template = 'Estimado representante, se le cita a la institución el {{fecha}} a las {{hora}} para tratar un asunto relacionado con {{nombre}}. Por favor confirmar asistencia.'
```

Both `FALLBACK_TEMPLATES.citations` (in `template.util.ts`) and the test's
`CITATIONS_BACKEND_DEFAULT` literal match that string byte-for-byte.

## Acceptance → evidence map (sdd=0)

| Acceptance | Evidence (test case in `tests/citation_template_hora_placeholder_and_preview.test.mjs`) |
| --- | --- |
| **A1** — `notifyGuardian` fills `nombre`/`fecha`/`hora` separately via `citation-date.util` helpers; existing public exports unchanged; wire-level WA URL still carries both date and time. | `A1: formatCitationDateOnly returns the weekday+month string used in {{fecha}}`, `A1: formatCitationTimeOnly emits 12-hour AM/PM`, `A1: citation-date.util exposes formatCitationDateOnly + formatCitationTimeOnly`, `A1: citation-date.util keeps the existing public exports intact`, `A1: citations.component passes fecha and hora as separate vars to renderTemplate`. Plus `A4: pending-branch invariant — url gets a ?text= body with both vars (date + time)`. |
| **A2** — `FALLBACK_TEMPLATES.citations` mirrors the new BE default verbatim; header comment updated. | `A2: FALLBACK_TEMPLATES.citations in template.util.ts matches the migration-25 default byte-for-byte`, `A2: FALLBACK_TEMPLATES.absences is left untouched (absences contract unchanged)`, `A2: template.util header comment mentions both postgres/24 and 25 (split {{hora}} contract)`, `A2: fillTemplate interpolates each placeholder exactly once with no regex mishap`. |
| **A3** — `PLACEHOLDER_SAMPLES` has weekday in `fecha` and `hora: '10:30 AM'`; the absences samples + template are unchanged. | `A3: PLACEHOLDER_SAMPLES.fecha includes the weekday (literal "miércoles" + "17 de junio de 2026")`, `A3: PLACEHOLDER_SAMPLES.hora is the canonical "10:30 AM"`, `A3: PLACEHOLDER_SAMPLES — absences (tipo/curso) are unchanged`, `A3: rendered citations preview contains "... el miércoles 17 de junio de 2026 a las 10:30 AM ..."`. |
| **A4** — pending citations include both date and time in the WA URL; closed citations open link-only `wa.me/<phone>` with no body. | `A4: closed-branch invariant — link-only wa.me with NO ?text=` (literal regex on `citations.component.ts` line 348), `A4: pending-branch invariant — url gets a ?text= body with both vars (date + time)`. |

A4 contract also noted by `A4: notifications-templates-tab has only one brand per action (absences vs citations are independent)`, which guards the Faltas card from accidentally picking up the new citations `hora` sample.

## Verification

- `node --test tests/citation_template_hora_placeholder_and_preview.test.mjs`
  → **16/16 pass** in ~70ms.
- `npx --no-install tsc --noEmit` (project-wide) → exit `0`, no errors.
- `./init.sh` → exit `0`. Emits two pre-existing, non-fatal `[WARN]` lines:
  1. `No verify_command configured in .harness.json — skipping`
     (`.harness.json` does not set `verify_command`; this is a known baseline
     documented in the README of the harness template).
  2. `$SUPABASE_URL / $SUPABASE_ANON_KEY not set — skipping mirror sync`
     (the Postgres mirror is opt-in via env vars; not configured in this
     worktree).

  Neither warning is caused by this feature; both are best-effort paths that
  init.sh self-documents as `[WARN]`, never `[FAIL]`.

## Deviations

None. The acceptance is implemented exactly as specified — the only code
paths touched are the four files listed, and the test pin is a literal-string
match against the BE SQL seed. The `frontend-design` skill was not loaded
because this feature touches no UI surface (preview rendering is shared
infrastructure already used by both action cards; no template/style block in
any `.component.ts` was edited, and no new screen was added or reshaped).

## Why a `.mjs` test instead of `.ts`

The project has no test framework wired (CLAUDE.md > "No test or lint
scripts are configured"; docs/conventions.md > Tests confirms it). Adding a
heavy toolchain (vitest, jest, ts-node) was excluded by the implementer
brief. `tsc --noEmit` is a useful smoke check on the source but cannot run
runtime assertions, so the test file is plain JS invoked by node's built-in
`--test` runner: zero new deps, no compile step. It loads
`src/app/shared/utils/{citation-date,template}.util.ts` via `node:fs.readFileSync`
and asserts against the literal source strings — so if a future edit renames
the new exports or drifts the fallback string, the test fails immediately
instead of silently aging into a stale green check.
