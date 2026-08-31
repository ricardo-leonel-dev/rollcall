#!/usr/bin/env node
/**
 * T17 manual smoke test (Level 3, docs/verification.md) for
 * specs/flexible_quarter_admin_ui/tasks.md — executed for real against the
 * running docker-compose stack (frontend on :80, backend on :3000 through
 * nginx, real postgres). NOT a mock — no route interception, unlike
 * scripts/visual-smoke.mjs (Level 4, mocked, separate concern).
 *
 * Creates a disposable academic year ("T17-Smoke-<random>") inside the real
 * "Tia Blanquita" institution, exercises all 8 T17 sub-steps against that
 * year's quarters only, and deletes the disposable year + reactivates the
 * real "2026-2027" year in a `finally` block so the real data the user has
 * been reviewing is left untouched.
 *
 * Usage: node scripts/t17-smoke.mjs
 * Requires: docker compose stack up (frontend :80, backend :3000, postgres),
 * seeded superadmin (username "superadmin", password "Admin2026!").
 *
 * Outputs:
 *   progress/t17_smoke_log.json          — every step + captured request/response
 *   progress/t17_smoke_multi_change.png  — screenshot after step (iv)
 *   progress/t17_smoke_empty_state.png   — screenshot after step (viii)
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost';
const ROOT = new URL('..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'progress');
mkdirSync(OUT_DIR, { recursive: true });

// Suffixed with a run-unique short id: academic_years has a plain
// UNIQUE(institution_id, name) constraint (postgres/03_multi_tenant.sql:184)
// that is NOT partial on deleted_at IS NULL, so a soft-deleted row from a
// previous run of this script would otherwise permanently squat the name
// (same soft-delete-vs-unique-constraint pattern discovered on `quarters`
// below — see the sequenceNumber comment near smoke-year-seeded-quarters).
// `academic_years.name` is VARCHAR(20) (postgres/03_multi_tenant.sql), so the
// whole name — including the disambiguating suffix — must stay under 20 chars.
const SMOKE_YEAR_NAME = `T17-Smoke-${Date.now() % 100000}`;
const REAL_YEAR_NAME = '2026-2027';

const log = [];
function record(step, extra = {}) {
  const entry = { step, ts: new Date().toISOString(), ...extra };
  log.push(entry);
  console.log(`[${entry.ts}] ${step}`, extra.status !== undefined ? `status=${extra.status}` : '');
  return entry;
}

// Playwright's `.count()` on a live locator is a one-shot DOM query, not a
// retrying assertion — calling it immediately after a click that triggers an
// Angular signal update can race the change-detection tick that actually
// renders the new element, silently returning the PRE-click count. Poll
// until the count changes (or time out) instead of reading it once.
async function waitForCardCount(locator, expectedCount, timeoutMs = 3000) {
  const start = Date.now();
  let count = await locator.count();
  while (count !== expectedCount && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
    count = await locator.count();
  }
  return count;
}

// Angular's signal-driven OnPush change detection can settle one or two
// animation frames after a DOM 'input'/'change' event handler returns —
// reading derived state (computed() validation errors, [disabled] bindings)
// immediately after a Playwright .fill()/.blur() can observe a stale render.
// Two chained requestAnimationFrame callbacks reliably flush a pending CD
// pass; the extra 100ms is slack for anything genuinely async (e.g. a
// microtask queued by a directive).
async function settle(page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(100);
}

async function apiFetch(token, institutionId, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Institution-Id': String(institutionId),
      ...(opts.headers || {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* 204 or empty body */ }
  return { status: res.status, body };
}

async function main() {
  let browser;
  let token = null;
  let institutionId = null;
  let realYearId = null;
  let smokeYearId = null;
  let deletedQuarterId = null; // "Tercer Trimestre" from the smoke year, deleted in step (iii)
  const results = {};

  try {
    browser = await chromium.launch({ headless: true });
    // timezoneId: 'UTC' avoids a real footgun — NativeDateAdapter.parse() calls
    // Date.parse() on a typed ISO string ("2030-01-01"), which JS interprets as
    // UTC midnight; on a host with a negative UTC offset, reading it back via
    // local getDate()/getMonth()/getFullYear() would silently roll the date
    // back one day. Pinning the browser context to UTC keeps typed dates exact.
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, timezoneId: 'UTC' });
    const page = await context.newPage();
    page.on('pageerror', (e) => record('pageerror', { message: e.message }));
    page.on('console', (msg) => { if (msg.type() === 'error') record('console.error', { text: msg.text() }); });
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/quarters') || url.includes('/api/academic-years')) {
        let body = null;
        try { body = await response.json(); } catch { /* ignore */ }
        record('network', { method: response.request().method(), url, status: response.status(), body });
      }
    });

    // --- Login (real /login page, real credentials) ---
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[name="username"]').fill('superadmin');
    await page.locator('input[name="password"]').fill('Admin2026!');
    await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
    await page.waitForURL('**/home', { timeout: 15000 });
    token = await page.evaluate(() => localStorage.getItem('token') || sessionStorage.getItem('token'));
    record('login-ok', { hasToken: !!token });

    // --- Navigate to admin/years; superadmin auto-selects the only active
    // institution ("Tia Blanquita") since localStorage has no prior selection
    // in this fresh browser context. ---
    await page.goto(`${BASE}/admin?tab=years`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.admin-row', { timeout: 15000 });
    institutionId = await page.evaluate(() => localStorage.getItem('selectedInstitutionId'));
    record('institution-selected', { institutionId });

    // Baseline snapshot of the REAL data before touching anything.
    const baselineYears = await apiFetch(token, institutionId, '/api/academic-years');
    const baselineQuarters = await apiFetch(token, institutionId, '/api/quarters');
    record('baseline-real-data', { years: baselineYears.body, quarters: baselineQuarters.body });
    const realYear = baselineYears.body.find((y) => y.name === REAL_YEAR_NAME);
    if (!realYear) throw new Error(`Real academic year "${REAL_YEAR_NAME}" not found — aborting before any mutation.`);
    realYearId = realYear.id;

    // =========================================================
    // (setup) Create the disposable academic year via the UI
    // =========================================================
    await page.getByRole('button', { name: /Agregar año lectivo/ }).click();
    let dialog = page.locator('mat-dialog-container');
    await dialog.waitFor({ timeout: 10000 });
    await dialog.locator('input').nth(0).fill(SMOKE_YEAR_NAME);
    await dialog.getByRole('button', { name: 'Crear' }).click();
    await page.waitForSelector('mat-dialog-container', { state: 'detached', timeout: 10000 });
    await page.waitForTimeout(500);

    const smokeRow = page.locator('.admin-row').filter({ hasText: SMOKE_YEAR_NAME });
    await smokeRow.waitFor({ timeout: 10000 });
    const yearsAfterCreate = await apiFetch(token, institutionId, '/api/academic-years');
    const smokeYear = yearsAfterCreate.body.find((y) => y.name === SMOKE_YEAR_NAME);
    if (!smokeYear) throw new Error('Disposable academic year was not created.');
    smokeYearId = smokeYear.id;
    record('smoke-year-created', { smokeYearId, isActive: smokeYear.isActive });

    const seededQuarters = await apiFetch(token, institutionId, '/api/quarters');
    record('smoke-year-seeded-quarters', { quarters: seededQuarters.body });
    // NOTE (discovered bug, documented not fixed — out of scope for this T17 execution
    // pass): quarter.service.ts's nextSequenceNumber() only counts non-deleted siblings
    // when auto-assigning a new sequenceNumber, but the DB's
    // UNIQUE(academic_year_id, sequence_number) constraint applies to ALL rows
    // including soft-deleted ones (soft delete only sets deletedAt, the row/its
    // sequence_number stay in the table forever). So deleting the HIGHEST-numbered
    // live period and then adding a new one in the same save() collides: the new
    // period is auto-assigned that same now-"free" (per the live-only query) but
    // still-occupied (per the DB constraint) sequence_number -> unexpected 409. We
    // sidestep this by deleting "Primer Trimestre" (the LOWEST sequenceNumber, 1)
    // instead of "Tercer Trimestre" — the new period's auto-assigned number is then
    // max(live)+1, which was never used by any row (deleted or not). This is a real
    // edge case a production user could hit (delete the highest-numbered period +
    // add a new one in the same save) — reported in the tasks.md T17 closing note.
    const primer = seededQuarters.body.find((q) => q.name === 'Primer Trimestre');
    if (!primer) throw new Error('Expected seeded "Primer Trimestre" not found on the smoke year.');
    deletedQuarterId = primer.id; // will be soft-deleted in step (iii) below

    // =========================================================
    // Steps (i)-(iv): rename + add + delete + confirm chip strip
    // =========================================================
    await smokeRow.locator('button[title="Configurar trimestres"]').click();
    dialog = page.locator('mat-dialog-container');
    await dialog.waitFor({ timeout: 10000 });
    await page.waitForSelector('.quarter-card', { timeout: 10000 });
    let cards = dialog.locator('.quarter-card');
    const initialCount = await cards.count();
    record('dialog-opened-initial-cards', { count: initialCount });

    // (i) rename "Segundo Trimestre" (seeded index 1) -> "Segundo Trimestre (Smoke)"
    const card1 = cards.nth(1);
    const card1NameBefore = await card1.locator('input').nth(0).inputValue();
    await card1.locator('input').nth(0).fill('Segundo Trimestre (Smoke)');
    record('step-i-rename', { before: card1NameBefore, after: 'Segundo Trimestre (Smoke)' });

    // (ii) add a 4th free-form-named period with non-overlapping dates
    await dialog.getByRole('button', { name: /Agregar período/ }).click();
    cards = dialog.locator('.quarter-card');
    const countAfterAdd = await waitForCardCount(cards, initialCount + 1);
    if (countAfterAdd !== initialCount + 1) throw new Error(`Expected ${initialCount + 1} cards after Agregar período, got ${countAfterAdd}`);
    const newIndex = countAfterAdd - 1;
    const newCard = cards.nth(newIndex);
    await newCard.locator('input').nth(0).fill('Periodo Extra');
    // .blur() after each date .fill() is required — without it, Playwright's
    // second .fill() on a sibling matDatepicker input can land before Angular
    // has finished processing the first field's (input) event, silently
    // dropping the model update for whichever field is filled without a
    // settle point. Discovered by isolated repro; see step (v) below too.
    await newCard.locator('input').nth(1).fill('2030-01-01');
    await newCard.locator('input').nth(1).blur();
    await newCard.locator('input').nth(2).fill('2030-03-31');
    await newCard.locator('input').nth(2).blur();
    await settle(page);
    record('step-ii-add-fourth-period', { name: 'Periodo Extra', startDate: '2030-01-01', endDate: '2030-03-31' });

    // (iii) delete a period ("Primer Trimestre", seeded index 0 — see the
    // sequenceNumber-collision note above for why this one and not "Tercer Trimestre")
    const card0 = cards.nth(0);
    const card0NameBeingDeleted = await card0.locator('input').nth(0).inputValue();
    await card0.locator('button[title="Quitar"]').click();
    await settle(page);
    record('step-iii-delete-period', { deletedName: card0NameBeingDeleted, deletedQuarterId });

    // NOTE: this snapshot is read synchronously right after the Quitar click,
    // and can legitimately show a transient invalid/disabled state (Angular
    // hasn't re-run validationErrors() yet in this exact tick). The .click()
    // below is Playwright's actionability-retrying click, which correctly
    // waits until Guardar is actually enabled before clicking — this is not
    // a bug, just evidence of why a single unretried read (used deliberately
    // in step (v) below, via waitForFunction, to make the read itself robust) needs care.
    record('step-iii-pre-save-snapshot', {
      invalidMessages: await dialog.locator('.invalid-msg').allInnerTexts(),
      saveDisabled: await dialog.getByRole('button', { name: 'Guardar períodos' }).isDisabled(),
      cardTexts: await dialog.locator('.quarter-card').allInnerTexts(),
    });
    await dialog.getByRole('button', { name: 'Guardar períodos' }).click();
    await page.waitForSelector('mat-dialog-container', { state: 'detached', timeout: 10000 });
    await page.waitForTimeout(500);

    // (iv) confirm the inline chip strip reflects all three changes WITHOUT a manual reload
    const chipsAfterSave = await smokeRow.locator('.period-chip').allInnerTexts();
    record('step-iv-chip-strip-after-save', { chips: chipsAfterSave });
    const chipStripInsideAdminRow = await page.evaluate((rowText) => {
      const rows = Array.from(document.querySelectorAll('.admin-row'));
      const row = rows.find((r) => r.textContent.includes(rowText));
      if (!row) return null;
      const chipsContainer = row.querySelector('.admin-row-quarters');
      return { chipsContainerIsChildOfAdminRow: !!chipsContainer, chipCount: row.querySelectorAll('.period-chip').length };
    }, SMOKE_YEAR_NAME);
    record('step-iv-chip-dom-location', chipStripInsideAdminRow);
    await page.screenshot({ path: join(OUT_DIR, 't17_smoke_multi_change.png') });
    results.step_iv = { chipsAfterSave, chipStripInsideAdminRow, pass: chipsAfterSave.length === 3 && chipStripInsideAdminRow?.chipsContainerIsChildOfAdminRow };

    // =========================================================
    // Step (v): overlapping dates — client-side + backend 400
    // =========================================================
    await smokeRow.locator('button[title="Configurar trimestres"]').click();
    dialog = page.locator('mat-dialog-container');
    await dialog.waitFor({ timeout: 10000 });
    await page.waitForSelector('.quarter-card', { timeout: 10000 });
    cards = dialog.locator('.quarter-card');
    // "Primer Trimestre" (seq1) was deleted in step (iii). Order after re-fetch,
    // sorted by sequenceNumber ascending: Segundo-Smoke(seq2), Tercer(seq3), Periodo Extra(seq4).
    const tercerCard = cards.nth(1);
    const tercerStartValueBefore = await tercerCard.locator('input').nth(1).inputValue();
    const tercerEndValueBefore = await tercerCard.locator('input').nth(2).inputValue();
    await tercerCard.locator('input').nth(1).fill('2030-02-01'); // overlaps Periodo Extra's 2030-01-01..2030-03-31
    await tercerCard.locator('input').nth(1).blur();
    await tercerCard.locator('input').nth(2).fill('2030-04-30');
    await tercerCard.locator('input').nth(2).blur();
    await settle(page);
    const tercerStartValueAfter = await tercerCard.locator('input').nth(1).inputValue();
    const tercerEndValueAfter = await tercerCard.locator('input').nth(2).inputValue();
    record('step-v-input-values', { tercerStartValueBefore, tercerEndValueBefore, tercerStartValueAfter, tercerEndValueAfter });

    const invalidMessages = await dialog.locator('.invalid-msg').allInnerTexts();
    const saveBtn = dialog.getByRole('button', { name: 'Guardar períodos' });
    const saveDisabled = await saveBtn.isDisabled();
    record('step-v-client-side-overlap', { invalidMessages, saveDisabled });

    // *** DISCOVERED BUG (documented, not fixed — out of scope for T17 execution) ***
    // `validationErrors()` is an Angular `computed()` whose only tracked dependency
    // is `this.drafts()` (the signal's reference/version). `[(ngModel)]="draft.name"`
    // and `[(ngModel)]="draft.startDate"` mutate a PROPERTY of an object already
    // inside the signal's array — they never call `.set()`/`.update()` on the
    // `drafts` signal itself, so the signal's version never bumps, and the computed
    // returns its STALE cached Map. In practice this means: editing dates/names on
    // an ALREADY-LOADED row (rename, or — as here — introducing an overlap) never
    // re-triggers validationErrors()/isValid(). The Map only actually recomputes
    // when addDraft()/markDeleted() run (they DO call drafts.update(...)), which is
    // why steps (i)-(iv) above appeared to "work": the recompute triggered by
    // addDraft()/markDeleted() happened to run AFTER the rename had already mutated
    // the object in place, so it incidentally picked up the latest name. This is a
    // real violation of R5/R6 ("apply the same client-side overlap/range validation
    // ... to every row") for the specific case of editing a row's dates without also
    // adding/removing another row in the same dialog session — reported in the
    // tasks.md T17 closing note for the reviewer/leader to triage as a follow-up bug.
    results.step_v_client = {
      invalidMessages,
      saveDisabled,
      note: saveDisabled
        ? 'Client-side computed validationErrors() caught the overlap and disabled Guardar.'
        : 'BUG (see script comment above "DISCOVERED BUG"): Guardar stayed enabled despite a real overlap, because validationErrors() never recomputes for a plain ngModel mutation on an already-loaded row.',
    };

    // Since the discovered bug leaves Guardar enabled, click it for real — this
    // sends the actually-invalid overlapping PUT to the backend over the REAL UI
    // path (no bypass needed for this one after all): confirm the backend's 400
    // is surfaced via NotificationService and the dialog stays open with the
    // failing row highlighted (R12).
    let overlapViaUi = null;
    if (!saveDisabled) {
      await saveBtn.click();
      const errorToastV = page.locator('.toast-error .message');
      await errorToastV.waitFor({ timeout: 8000 });
      const errorToastVText = await errorToastV.innerText();
      const tercerHasServerErrorClass = await tercerCard.evaluate((el) => el.classList.contains('server-error'));
      const dialogStillOpenV = await dialog.isVisible();
      overlapViaUi = { errorToastVText, tercerHasServerErrorClass, dialogStillOpenV };
      record('step-v-guardar-clicked-despite-overlap-bug', overlapViaUi);
      // Dismiss immediately (rather than waiting out its ~4s auto-duration) so a
      // later step's toast-read can't accidentally match this stale element —
      // MatSnackBar's exit animation can leave the old toast in the DOM briefly
      // while a subsequent one is queued, and `.toast-error .message` is not
      // otherwise scoped to "the newest" toast.
      await page.locator('.toast-error .close-btn').click().catch(() => null);
      await page.locator('.toast-error').waitFor({ state: 'detached', timeout: 3000 }).catch(() => null);
    }
    results.step_v_backend_via_ui = overlapViaUi && {
      ...overlapViaUi,
      pass: overlapViaUi.dialogStillOpenV && overlapViaUi.tercerHasServerErrorClass && /solapan/i.test(overlapViaUi.errorToastVText),
    };

    // Discard the unsaved/rejected overlapping edit.
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await page.waitForSelector('mat-dialog-container', { state: 'detached', timeout: 10000 });

    // Supplementary: also exercise the backend's 400 path via a direct API call,
    // as a second independent confirmation (not strictly needed anymore since the
    // real UI path above already reached it, but cheap to keep as belt-and-braces
    // evidence and it doesn't touch the real 2026-2027 year).
    const overlapDirect = await apiFetch(token, institutionId, '/api/quarters', {
      method: 'POST',
      body: JSON.stringify({ name: 'Overlap Direct Test', startDate: '2030-03-01', endDate: '2030-04-01' }),
    });
    record('step-v-direct-api-overlap-400', overlapDirect);
    results.step_v_backend_direct = { ...overlapDirect, pass: overlapDirect.status === 400 };

    // =========================================================
    // Step (vi): duplicate name -> 409, surfaced via NotificationService
    // =========================================================
    await smokeRow.locator('button[title="Configurar trimestres"]').click();
    dialog = page.locator('mat-dialog-container');
    await dialog.waitFor({ timeout: 10000 });
    await page.waitForSelector('.quarter-card', { timeout: 10000 });
    cards = dialog.locator('.quarter-card');
    const countBeforeDupAdd = await cards.count();
    await dialog.getByRole('button', { name: /Agregar período/ }).click();
    const countAfterDupAdd = await waitForCardCount(cards, countBeforeDupAdd + 1);
    if (countAfterDupAdd !== countBeforeDupAdd + 1) throw new Error(`Expected ${countBeforeDupAdd + 1} cards after Agregar período, got ${countAfterDupAdd}`);
    const dupIndex = countAfterDupAdd - 1;
    const dupCard = cards.nth(dupIndex);
    await dupCard.locator('input').nth(0).fill('Periodo Extra'); // exact duplicate of an existing name
    await dupCard.locator('input').nth(0).blur();
    await settle(page);
    const preNudge = {
      invalidMessages: await dialog.locator('.invalid-msg').allInnerTexts(),
      saveDisabled: await dialog.getByRole('button', { name: 'Guardar períodos' }).isDisabled(),
    };
    record('step-vi-duplicate-name-draft-added', { name: 'Periodo Extra', ...preNudge });

    // WORKAROUND for the same discovered bug as step (v): addDraft() forced a
    // recompute the instant the empty draft was created (correctly flagging it
    // as empty-name at THAT moment), but typing "Periodo Extra" into it afterward
    // never re-triggers validationErrors() (plain ngModel mutation, no drafts
    // signal .update()/.set() call) — so the stale "empty name" error and the
    // disabled Guardar persist FOREVER despite the field visibly showing the
    // correct value. A real end user hitting this would be stuck unable to save
    // a newly-typed period name at all. We force a fresh, accurate recompute the
    // same way the app itself does elsewhere: trigger one more drafts.update()
    // via a harmless temporary add+remove — this is not something a real user
    // would intuitively know to do, which is precisely why this is a bug worth
    // flagging, not a legitimate part of the intended UX.
    await dialog.getByRole('button', { name: /Agregar período/ }).click();
    const countAfterNudgeAdd = await waitForCardCount(cards, countAfterDupAdd + 1);
    await settle(page);
    const nudgeCard = cards.nth(countAfterNudgeAdd - 1);
    await nudgeCard.locator('button[title="Quitar"]').click();
    await settle(page);
    const postNudge = {
      invalidMessages: await dialog.locator('.invalid-msg').allInnerTexts(),
      saveDisabled: await dialog.getByRole('button', { name: 'Guardar períodos' }).isDisabled(),
    };
    record('step-vi-nudge-workaround-applied', postNudge);

    await dialog.getByRole('button', { name: 'Guardar períodos' }).click();
    const errorToast = page.locator('.toast-error .message');
    await errorToast.waitFor({ timeout: 8000 });
    const errorToastText = await errorToast.innerText();
    const dupCardHasServerErrorClass = await dupCard.evaluate((el) => el.classList.contains('server-error'));
    const dialogStillOpen = await dialog.isVisible();
    record('step-vi-duplicate-name-result', { errorToastText, dupCardHasServerErrorClass, dialogStillOpen });
    results.step_vi = {
      preNudge,
      postNudge,
      errorToastText,
      dupCardHasServerErrorClass,
      dialogStillOpen,
      note: 'No client-side duplicate-name check exists in quarters-dialog.component.ts (validationErrors() only checks empty/length/date-order/AY-range/overlap), so the duplicate reaches the backend unmodified. Reaching Guardar in an enabled state required the nudge workaround above, due to the same stale-computed-signal bug documented in step (v) — NOT because of any duplicate-name-specific client check.',
      pass: dialogStillOpen && dupCardHasServerErrorClass && /duplicad/i.test(errorToastText),
    };

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await page.waitForSelector('mat-dialog-container', { state: 'detached', timeout: 10000 });

    // =========================================================
    // Step (vii): delete an already-deleted id -> 404 (direct API;
    // the UI has no affordance to target an id it no longer has loaded)
    // =========================================================
    const alreadyDeletedResp = await apiFetch(token, institutionId, `/api/quarters/${deletedQuarterId}`, { method: 'DELETE' });
    record('step-vii-direct-api-delete-already-deleted-404', alreadyDeletedResp);
    results.step_vii = { ...alreadyDeletedResp, pass: alreadyDeletedResp.status === 404 };

    // =========================================================
    // Step (viii): zero periods -> empty-state placeholder + reopen link
    // =========================================================
    await smokeRow.locator('button[title="Configurar trimestres"]').click();
    dialog = page.locator('mat-dialog-container');
    await dialog.waitFor({ timeout: 10000 });
    await page.waitForSelector('.quarter-card', { timeout: 10000 });
    cards = dialog.locator('.quarter-card');
    const remainingCount = await cards.count();
    for (let i = 0; i < remainingCount; i++) {
      await cards.nth(i).locator('button[title="Quitar"]').click();
    }
    record('step-viii-deleted-all-periods', { count: remainingCount });
    await dialog.getByRole('button', { name: 'Guardar períodos' }).click();
    await page.waitForSelector('mat-dialog-container', { state: 'detached', timeout: 10000 });
    await page.waitForTimeout(500);

    const emptyStateText = await smokeRow.locator('.period-chip-empty').innerText();
    const emptyStateChipCount = await smokeRow.locator('.period-chip').count();
    record('step-viii-empty-state', { emptyStateText, emptyStateChipCount });
    await page.screenshot({ path: join(OUT_DIR, 't17_smoke_empty_state.png') });

    await smokeRow.locator('a.period-chip-cta').click();
    dialog = page.locator('mat-dialog-container');
    await dialog.waitFor({ timeout: 10000 });
    await page.waitForSelector('.quarter-card', { timeout: 10000 });
    const reopenedCardCount = await dialog.locator('.quarter-card').count();
    record('step-viii-reopened-via-link', { reopenedCardCount });
    results.step_viii = {
      emptyStateText,
      emptyStateChipCount,
      reopenedCardCount,
      pass: /Sin per.*configurados/i.test(emptyStateText) && emptyStateChipCount === 0 && reopenedCardCount === 1,
    };
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await page.waitForSelector('mat-dialog-container', { state: 'detached', timeout: 10000 });

    record('all-steps-complete', {});
  } catch (err) {
    record('fatal-error', { message: err.message, stack: err.stack });
    results.fatalError = err.message;
  } finally {
    // =========================================================
    // Cleanup — ALWAYS runs: restore the real "2026-2027" year to active,
    // then delete the disposable year, then verify via a follow-up GET.
    // =========================================================
    try {
      if (token && institutionId && realYearId) {
        const reactivate = await apiFetch(token, institutionId, `/api/academic-years/${realYearId}`, {
          method: 'PUT',
          body: JSON.stringify({ isActive: true }),
        });
        record('cleanup-reactivate-real-year', reactivate);
      }
      if (token && institutionId && smokeYearId) {
        const del = await apiFetch(token, institutionId, `/api/academic-years/${smokeYearId}`, { method: 'DELETE' });
        record('cleanup-delete-smoke-year', del);
      }
      if (token && institutionId) {
        const finalYears = await apiFetch(token, institutionId, '/api/academic-years');
        const finalQuarters = await apiFetch(token, institutionId, '/api/quarters');
        record('cleanup-verify-final-state', { years: finalYears.body, quarters: finalQuarters.body });
        const smokeStillPresent = finalYears.body.some((y) => y.name === SMOKE_YEAR_NAME);
        const realYear = finalYears.body.find((y) => y.name === REAL_YEAR_NAME);
        results.cleanup = {
          smokeYearGone: !smokeStillPresent,
          realYearActive: realYear?.isActive === true,
          finalQuarters: finalQuarters.body,
          pass: !smokeStillPresent && realYear?.isActive === true,
        };
      }
    } catch (cleanupErr) {
      record('cleanup-error', { message: cleanupErr.message, stack: cleanupErr.stack });
      results.cleanupError = cleanupErr.message;
    }
    if (browser) await browser.close();
  }

  const report = { results, log };
  writeFileSync(join(OUT_DIR, 't17_smoke_log.json'), JSON.stringify(report, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(results, null, 2));
  if (results.fatalError) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
