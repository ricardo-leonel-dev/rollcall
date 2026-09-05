#!/usr/bin/env node
/**
 * Visual smoke for the attendance_frontend Angular app.
 *
 * Spawns a static HTTP server on the production build under dist/frontend/browser,
 * navigates a headless Chromium to the admin page, mocks the backend API with
 * route interception, and captures a screenshot + JSON of computed styles and
 * DOM info. Designed to run from any cwd; resolves project paths relative to
 * `frontend/` (the repo root for this script).
 *
 * Usage:
 *   node scripts/visual-smoke.mjs                      # default: feature=current
 *   VISUAL_FEATURE=4 node scripts/visual-smoke.mjs     # tag the screenshot
 *   VISUAL_OUT_DIR=/tmp/shots node scripts/visual-smoke.mjs
 *
 * Env:
 *   VISUAL_PORT         port for the static server (default 4321)
 *   VISUAL_FEATURE      feature slug for filename (default "current")
 *   VISUAL_OUT_DIR      output dir for PNG + JSON (default ./progress)
 *   VISUAL_VIEWPORT     "1440x900" (default)
 *   VISUAL_NO_SERVER    if "1", skip spawning the server (assume one already running
 *                       on VISUAL_PORT — useful for re-running the screenshot step)
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, createReadStream, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import http from 'node:http';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const PORT = Number(process.env.VISUAL_PORT || 4321);
const FEATURE = process.env.VISUAL_FEATURE || 'current';
const OUT_DIR = resolve(process.env.VISUAL_OUT_DIR || join(ROOT, 'progress'));
const [VW = 1440, VH = 900] = (process.env.VISUAL_VIEWPORT || '1440x900').split('x').map(Number);
const NO_SERVER = process.env.VISUAL_NO_SERVER === '1';

mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_PATH = join(OUT_DIR, `visual_${FEATURE}.png`);
const REPORT_PATH = join(OUT_DIR, `visual_${FEATURE}.json`);

let server = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function startServer() {
  const distDir = join(ROOT, 'dist', 'frontend', 'browser');
  return new Promise((resolveReady, rejectReady) => {
    server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, BASE_URL);
        let filePath = join(distDir, decodeURIComponent(url.pathname));
        let stat;
        try {
          stat = statSync(filePath);
        } catch {
          stat = null;
        }
        // SPA fallback: any path that doesn't resolve to a real file (and isn't
        // an asset with an extension that 404s) returns index.html so the
        // Angular router can take over.
        if (!stat || !stat.isFile()) {
          // For asset-looking paths (have an extension other than .html), 404.
          const ext = extname(url.pathname);
          if (ext && ext !== '.html') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
          }
          filePath = join(distDir, 'index.html');
        }
        const ct = MIME[extname(filePath)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-store' });
        createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(err));
      }
    });
    server.on('error', rejectReady);
    server.listen(PORT, '127.0.0.1', () => resolveReady());
  });
}

function stopServer() {
  return new Promise((resolveStop) => {
    if (!server) return resolveStop();
    server.close(() => resolveStop());
  });
}

const MOCK_USER = {
  id: 1,
  username: 'visual-smoke',
  fullName: 'Visual Smoke',
  email: null,
  roleName: 'admin',
  roleId: 1,
  institutionId: 1,
  avatarUrl: null,
  title: null,
  signatureLabel: null,
  institution: { id: 1, name: 'Test Institution', primaryColor: '#6366f1', secondaryColor: '#8b5cf6' },
  moduleKeys: ['admin', 'absences', 'students', 'enrollments', 'dashboard', 'calendar', 'justifications'],
};

const MOCK_YEARS = [
  {
    id: 1,
    name: 'Año Lectivo 2026',
    startDate: '2026-03-01',
    endDate: '2026-12-15',
    isActive: true,
    institutionId: 1,
  },
];

const MOCK_QUARTERS = [
  { id: 1, academicYearId: 1, name: 'T1', sequenceNumber: 1, startDate: '2026-03-01', endDate: '2026-05-30', description: null },
  { id: 2, academicYearId: 1, name: 'T2', sequenceNumber: 2, startDate: '2026-06-01', endDate: '2026-08-31', description: null },
  { id: 3, academicYearId: 1, name: 'T3', sequenceNumber: 3, startDate: '2026-09-01', endDate: '2026-12-15', description: null },
];

const MOCK_CITATION_REASONS = [
  { id: 1, institutionId: 1, name: 'Atrasos reiterados', severity: 'low', description: 'Tres o más atrasos en el mismo trimestre.', isActive: true, createdAt: '2026-01-10T12:00:00.000Z', updatedAt: '2026-01-10T12:00:00.000Z', deletedAt: null },
  { id: 2, institutionId: 1, name: 'Faltas injustificadas', severity: 'medium', description: null, isActive: true, createdAt: '2026-01-10T12:00:00.000Z', updatedAt: '2026-01-10T12:00:00.000Z', deletedAt: null },
  { id: 3, institutionId: 1, name: 'Agresión a un compañero', severity: 'high', description: 'Requiere presencia del representante el mismo día.', isActive: true, createdAt: '2026-01-10T12:00:00.000Z', updatedAt: '2026-01-10T12:00:00.000Z', deletedAt: null },
];

async function mockApi(context) {
  await context.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/login') || url.includes('/api/auth/me')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'fake-visual-smoke-jwt', user: MOCK_USER }) });
    }
    if (url.includes('/api/academic-years') && !url.includes('/api/academic-years/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_YEARS) });
    }
    if (url.includes('/api/quarters')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUARTERS) });
    }
    if (url.includes('/api/users')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/roles')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/citation-reasons')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CITATION_REASONS) });
    }
    if (url.includes('/api/courses')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/institutions')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 1, name: 'Test Institution', primaryColor: '#6366f1', secondaryColor: '#8b5cf6' }]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

async function injectAuth(page) {
  await page.addInitScript((user) => {
    try {
      localStorage.setItem('token', 'fake-visual-smoke-jwt');
      localStorage.setItem('user', JSON.stringify(user));
      sessionStorage.setItem('token', 'fake-visual-smoke-jwt');
      sessionStorage.setItem('user', JSON.stringify(user));
    } catch (e) {
      // ignore
    }
  }, MOCK_USER);
}

async function extractDom(page) {
  return page.evaluate(() => {
    const sel = (s) => Array.from(document.querySelectorAll(s));
    const quartersEl = document.querySelector('.admin-row-quarters');
    const adminRowEl = document.querySelector('.admin-row');
    const oldPanel = document.querySelector('.inline-quarters-summary');
    const chips = sel('.period-chip').map((chip) => {
      const ordinal = chip.querySelector('.period-chip-ordinal');
      const name = chip.querySelector('.period-chip-name');
      const range = chip.querySelector('.period-chip-range');
      const cs = getComputedStyle(chip);
      return {
        text: chip.textContent.replace(/\s+/g, ' ').trim(),
        rect: chip.getBoundingClientRect().toJSON(),
        background: cs.backgroundColor,
        borderLeft: cs.borderLeft,
        borderRadius: cs.borderRadius,
        padding: cs.padding,
        ordinalFont: ordinal ? { weight: getComputedStyle(ordinal).fontWeight, size: getComputedStyle(ordinal).fontSize, color: getComputedStyle(ordinal).color, family: getComputedStyle(ordinal).fontFamily } : null,
        nameFont: name ? { weight: getComputedStyle(name).fontWeight, size: getComputedStyle(name).fontSize, color: getComputedStyle(name).color } : null,
        rangeFont: range ? { weight: getComputedStyle(range).fontWeight, size: getComputedStyle(range).fontSize, color: getComputedStyle(range).color } : null,
      };
    });
    const quartersStyle = quartersEl ? getComputedStyle(quartersEl) : null;
    const adminRowStyle = adminRowEl ? getComputedStyle(adminRowEl) : null;
    return {
      hasAdminRowQuarters: !!quartersEl,
      hasOldPanel: !!oldPanel,
      chipCount: chips.length,
      chips,
      adminRowQuartersDisplay: quartersStyle?.display,
      adminRowQuartersFlexDirection: quartersStyle?.flexDirection,
      adminRowQuartersGap: quartersStyle?.gap,
      adminRowQuartersAlignItems: quartersStyle?.alignItems,
      adminRowAlignItems: adminRowStyle?.alignItems,
      adminRowDisplay: adminRowStyle?.display,
      activeYearText: (() => {
        // The year name is a div with inline style font-weight:600 inside .admin-row
        // (no dedicated class). Find it relative to the first .admin-row that contains
        // .admin-row-quarters (i.e. the active year row).
        const quarters = document.querySelector('.admin-row .admin-row-quarters');
        const row = quarters?.closest('.admin-row');
        // Match any div whose inline style font-weight is 600 (browser may or may not
        // normalize the spacing/formatting).
        const nameDiv = row ? Array.from(row.querySelectorAll('div')).find(d => {
          const m = (d.getAttribute('style') || '').match(/font-weight\s*:\s*600/);
          return !!m;
        }) : null;
        return nameDiv?.textContent?.trim() ?? null;
      })(),
    };
  });
}

async function main() {
  if (!NO_SERVER) await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: Number(VW), height: Number(VH) } });
    await mockApi(context);
    const page = await context.newPage();
    await injectAuth(page);
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[console.error]', msg.text());
    });
    // The admin page's activeTab is bound to ?tab= queryParam (default 'users').
// Navigate directly to the years tab so we don't depend on the sidebar nav.
await page.goto(`${BASE_URL}${process.env.VISUAL_PATH || '/admin?tab=years'}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
// The admin page renders the years list. Wait for the row to be visible.
await page.waitForSelector('.admin-row, .admin-row-quarters, .inline-quarters-summary', { timeout: 10000 }).catch(() => null);
// Give the SPA another tick to render chips after the quarters fetch resolves.
await wait(1500);
// Optional: open a dialog (or any overlay) before shooting, so features whose
// UI lives behind a click can be captured too. Unset by default — the shot is
// byte-identical to before when VISUAL_CLICK isn't provided.
if (process.env.VISUAL_CLICK) {
  await page.click(process.env.VISUAL_CLICK, { timeout: 10000 });
  await wait(1000);
}
    const info = await extractDom(page);
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    writeFileSync(REPORT_PATH, JSON.stringify({ ...info, screenshot: SCREENSHOT_PATH, viewport: { width: Number(VW), height: Number(VH) } }, null, 2));
    console.log(JSON.stringify({ ok: true, screenshot: SCREENSHOT_PATH, report: REPORT_PATH, ...info }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (!NO_SERVER) await stopServer();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});