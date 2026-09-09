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
  roleName: process.env.VISUAL_ROLE || 'admin',
  roleId: 1,
  institutionId: 1,
  avatarUrl: null,
  title: null,
  signatureLabel: null,
  institution: { id: 1, name: 'Test Institution', primaryColor: '#6366f1', secondaryColor: '#8b5cf6' },
  moduleKeys: ['admin', 'absences', 'students', 'enrollments', 'dashboard', 'calendar', 'justifications', 'citations'],
};

// feature 41 fixture: this year's quarters are NOT contiguous — there's a
// real 26-day gap between T1 and T2 (a recess/vacation), which quarters
// validation allows (only overlap + in-range are checked, see
// quarters-dialog.component.ts). "Today" (real system clock, matched to this
// project's fixed dev date of 2026-09-08) falls inside T2 — the *second*
// quarter, not the first — so this fixture exercises both: (a) the gap must
// render as visible empty track between T1 and T2, and (b) the HOY marker
// must land inside T2's real bounding box, not wherever a gap-less packed
// layout would place it.
const MOCK_YEARS = [
  {
    id: 1,
    name: 'Año Lectivo 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-20',
    isActive: true,
    institutionId: 1,
  },
];

const MOCK_QUARTERS = [
  { id: 1, academicYearId: 1, name: 'T1', sequenceNumber: 1, startDate: '2026-01-05', endDate: '2026-03-20', description: null },
  { id: 2, academicYearId: 1, name: 'T2', sequenceNumber: 2, startDate: '2026-04-15', endDate: '2026-09-30', description: null },
  { id: 3, academicYearId: 1, name: 'T3', sequenceNumber: 3, startDate: '2026-10-01', endDate: '2026-12-15', description: null },
];

const MOCK_CITATION_REASONS = [
  { id: 1, institutionId: 1, name: 'Atrasos reiterados', severity: 'low', description: 'Tres o más atrasos en el mismo trimestre.', isActive: true, createdAt: '2026-01-10T12:00:00.000Z', updatedAt: '2026-01-10T12:00:00.000Z', deletedAt: null },
  { id: 2, institutionId: 1, name: 'Faltas injustificadas', severity: 'medium', description: null, isActive: true, createdAt: '2026-01-10T12:00:00.000Z', updatedAt: '2026-01-10T12:00:00.000Z', deletedAt: null },
  { id: 3, institutionId: 1, name: 'Agresión a un compañero', severity: 'high', description: 'Requiere presencia del representante el mismo día.', isActive: true, createdAt: '2026-01-10T12:00:00.000Z', updatedAt: '2026-01-10T12:00:00.000Z', deletedAt: null },
];

async function mockApi(context) {
  await context.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/login')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'fake-visual-smoke-jwt', user: MOCK_USER }) });
    }
    if (url.includes('/api/auth/me')) {
      // Matches the actual endpoint shape (Me payload, no envelope) so the
      // ProfileComponent's `get<Me>('/api/auth/me')` renders with fullName,
      // email, avatarUrl, etc. populated in the visual smoke.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) });
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
    if (url.includes('/api/roles/permissions/')) {
      // feature 34 fixture: a small permissions matrix for the role selected
      // by the smoke, so the Permisos tab renders the table (it gates the
      // table on @if (permissions().length)). Resource names match the
      // backend's role_permissions schema so the eyebrow + table render
      // together.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { resource: 'absences',       canRead: true,  canCreate: true,  canUpdate: true,  canDelete: false },
        { resource: 'students',        canRead: true,  canCreate: true,  canUpdate: true,  canDelete: false },
        { resource: 'justifications',  canRead: true,  canCreate: true,  canUpdate: true,  canDelete: true  },
      ]) });
    }
    if (url.includes('/api/roles')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 1, name: 'admin', description: 'Administrador', institutionId: 1, permissions: null },
      ]) });
    }
    if (url.includes('/api/citation-reasons')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CITATION_REASONS) });
    }
    if (url.includes('/api/courses')) {
      // feature 34 fixture: three courses (5° A, 5° B, 6° A) so the folio's
      // plural grammar ("3 cursos") is exercised. The previous single-row
      // fixture only covered the singular path; with 3 rows the visual
      // smoke can catch a regression that drops the pluralized noun.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 1, name: '5° A', grade: '5°', paralelo: 'A', shift: 'morning' },
        { id: 2, name: '5° B', grade: '5°', paralelo: 'B', shift: 'morning' },
        { id: 3, name: '6° A', grade: '6°', paralelo: 'A', shift: 'afternoon' },
      ]) });
    }
    if (url.includes('/api/citations')) {
      const fixture = [
        {
          enrollmentId: 101,
          rosterNumber: 1,
          studentName: 'Ana Torres',
          guardianId: 11,
          guardianName: 'María Torres',
          guardianPhone: '+593991234567',
          whatsappLink: 'https://wa.me/593991234567',
          citations: [
            { id: 1, date: '2026-05-10', time: '08:30', guardianId: 11, status: 'pending', observations: 'Atrasos reiterados en el trimestre.', closedAt: null, closedByUserId: null, createdByUserId: 1, createdAt: '2026-05-10T09:00:00.000Z', reasonIds: [1] },
            { id: 2, date: '2026-04-22', time: '08:00', guardianId: 11, status: 'closed', observations: 'Asistencia confirmada.', closedAt: '2026-04-23T10:00:00.000Z', closedByUserId: 1, createdByUserId: 1, createdAt: '2026-04-22T09:00:00.000Z', reasonIds: [2] },
          ],
        },
        {
          enrollmentId: 102,
          rosterNumber: 2,
          studentName: 'Luis Pérez',
          guardianId: 12,
          guardianName: 'Carlos Pérez',
          guardianPhone: '+593992345678',
          whatsappLink: 'https://wa.me/593992345678',
          citations: [
            { id: 3, date: '2026-06-01', time: '07:45', guardianId: 12, status: 'pending', observations: null, closedAt: null, closedByUserId: null, createdByUserId: 1, createdAt: '2026-06-01T08:00:00.000Z', reasonIds: [3] },
          ],
        },
        {
          enrollmentId: 103,
          rosterNumber: 3,
          studentName: 'Sofía Andrade',
          guardianId: null,
          guardianName: null,
          guardianPhone: null,
          whatsappLink: null,
          citations: [],
        },
      ];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
    }
    if (url.includes('/api/institutions')) {
      // feature 33 fixture: each institution carries the stats the backend
      // attaches via findAll (backend #17). Mixed counts so the visual
      // smoke actually exercises the singular/plural grammar ("1 estudiante"
      // vs "N estudiantes") and the dot separators, instead of rendering
      // one trivial row. logoUrl intentionally omitted on the second one
      // so the initials-fallback seal is also exercised.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 1, name: 'Unidad Educativa San Martín', logoUrl: null, primaryColor: '#6366f1', secondaryColor: '#8b5cf6', isActive: true, stats: { students: 248, courses: 12, users: 34 } },
        { id: 2, name: 'Colegio Andino',           logoUrl: null, primaryColor: '#0ea5e9', secondaryColor: '#22d3ee', isActive: true, stats: { students: 1,   courses: 1,  users: 1 } },
      ]) });
    }
    if (url.includes('/api/notification-templates')) {
      // ProfileComponent fetches this in ngOnInit to load the WhatsApp template.
      // Returning an array (not `{}`) so the component's `.find()` doesn't throw.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { actionKey: 'absences', template: 'Estimado representante, le informamos que {{nombre}} registró {{tipo}} el día {{fecha}} en el curso {{curso}}. Por favor comuníquese con la institución para más información.' },
        { actionKey: 'citations', template: 'Estimado apoderado, se ha registrado una citación para {{nombre}} el {{fecha}}. Por favor confirmar asistencia.' },
      ]) });
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

    // feature 41: walk up from `el` to <body>, and for every ancestor whose
    // computed overflow (x or y) is 'hidden'/'clip', check whether `el`'s
    // bounding rect is fully contained inside that ancestor's bounding rect.
    // If not, the ancestor is actually clipping `el` in the rendered page —
    // this is a behavioral check (real coordinates), not a visual read of
    // the screenshot.
    function clippingAncestor(el) {
      if (!el) return { clipped: null, ancestorSelector: null, elementRect: null, ancestorRect: null };
      const elRect = el.getBoundingClientRect().toJSON();
      let node = el.parentElement;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        const hides = (v) => v === 'hidden' || v === 'clip';
        if (hides(cs.overflowX) || hides(cs.overflowY) || hides(cs.overflow)) {
          const ancRect = node.getBoundingClientRect().toJSON();
          const contained =
            elRect.left >= ancRect.left - 0.5 &&
            elRect.right <= ancRect.right + 0.5 &&
            elRect.top >= ancRect.top - 0.5 &&
            elRect.bottom <= ancRect.bottom + 0.5;
          if (!contained) {
            return {
              clipped: true,
              ancestorSelector: node.className ? `.${String(node.className).trim().split(/\s+/).join('.')}` : node.tagName,
              elementRect: elRect,
              ancestorRect: ancRect,
            };
          }
        }
        node = node.parentElement;
      }
      return { clipped: false, ancestorSelector: null, elementRect: elRect, ancestorRect: null };
    }

    const timelineTrackEl = document.querySelector('.timeline-track');
    const timelineHoyEl = document.querySelector('.timeline-hoy');
    const timelineHoyLabelEl = document.querySelector('.timeline-hoy-label');
    const timelineSegmentEls = sel('.timeline-segment');
    const timelineSegments = timelineSegmentEls.map((s) => ({
      title: s.getAttribute('title'),
      rect: s.getBoundingClientRect().toJSON(),
      left: getComputedStyle(s).left,
      width: getComputedStyle(s).width,
    }));
    // The fixture (see MOCK_QUARTERS above) puts the mocked "today" inside
    // T2 — assert the HOY marker's left edge falls within T2's own
    // bounding-box [left, right], not wherever a gap-less packed layout
    // would have placed it.
    const t2Segment = timelineSegments.find((s) => (s.title || '').startsWith('T2'));
    const timelineHoyLabelClipping = clippingAncestor(timelineHoyLabelEl);
    const timelineHoyClipping = clippingAncestor(timelineHoyEl);
    const timelineHoyRect = timelineHoyEl ? timelineHoyEl.getBoundingClientRect().toJSON() : null;
    const timelineHoyAlignment = (t2Segment && timelineHoyRect) ? {
      hoyLeft: timelineHoyRect.left,
      t2Left: t2Segment.rect.left,
      t2Right: t2Segment.rect.right,
      hoyWithinT2: timelineHoyRect.left >= t2Segment.rect.left - 0.5 && timelineHoyRect.left <= t2Segment.rect.right + 0.5,
    } : null;
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
    const pills = sel('.pill').map((p) => p.textContent.replace(/\s+/g, ' ').trim());
    const sectionLabels = sel('.section-label').map((s) => s.textContent.trim());
    const dialogDates = sel('.history-row-date').map((d) => d.textContent.replace(/\s+/g, ' ').trim());
    const pendingBannerItems = sel('.pending-banner-list li').map((li) => li.textContent.replace(/\s+/g, ' ').trim());
    // feature 30 selectors — Cuaderno Users tab folio + seals + scope lines.
    const folioEl = document.querySelector('.users-folio');
    const folioFileteInkEl = document.querySelector('.users-folio .filete-ink');
    const folioFileteBorderEl = document.querySelector('.users-folio .filete-border');
    const folioTextEl = document.querySelector('.users-folio-text');
    const folioNumberEl = document.querySelector('.users-folio-text b');
    const sealEls = sel('.admin-row .seal, table .seal, .users-folio ~ * .seal');
    const userRowEls = sel('.admin-row.user-row');
    const scopeLineEls = sel('.admin-row .user-scope, table .user-scope, .users-folio ~ * .user-scope');
    // Fallback: scope lines are inline-styled in admin.component.ts (no
    // dedicated class), so the selector above may miss them. Match by
    // text content as a backup so the assertion always runs.
    const inlineScopeEls = Array.from(document.querySelectorAll('.admin-row div, table tbody td div'))
      .filter((d) => {
        const t = (d.textContent || '').trim();
        return /^(Todos los cursos|1 curso asignado|\d+ cursos asignados)$/.test(t);
      });
    const allScopeEls = scopeLineEls.length ? scopeLineEls : inlineScopeEls;
    const allSealEls = sealEls.length ? sealEls : sel('.seal');
    const original = {
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
        const quarters = document.querySelector('.admin-row .admin-row-quarters');
        const row = quarters?.closest('.admin-row');
        const nameDiv = row ? Array.from(row.querySelectorAll('div')).find(d => {
          const m = (d.getAttribute('style') || '').match(/font-weight\s*:\s*600/);
          return !!m;
        }) : null;
        return nameDiv?.textContent?.trim() ?? null;
      })(),
      pills,
      sectionLabels,
      dialogDates,
      pendingBannerItems,
      // feature 41 assertions — timeline HOY clipping + segment/HOY alignment.
      timelineTrackRect: timelineTrackEl ? timelineTrackEl.getBoundingClientRect().toJSON() : null,
      timelineSegments,
      timelineHoyRect,
      timelineHoyLabelRect: timelineHoyLabelEl ? timelineHoyLabelEl.getBoundingClientRect().toJSON() : null,
      timelineHoyLabelClipping,
      timelineHoyClipping,
      timelineHoyAlignment,
      // feature 30 assertions — Cuaderno Users tab behavior.
      usersFolio: folioEl ? {
        present: true,
        text: folioTextEl?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        numberText: folioNumberEl?.textContent?.trim() ?? null,
        numberIsBold: folioNumberEl ? getComputedStyle(folioNumberEl).fontWeight === '800' : null,
        fileteInk: folioFileteInkEl ? {
          height: getComputedStyle(folioFileteInkEl).height,
          background: getComputedStyle(folioFileteInkEl).backgroundColor,
          opacity: getComputedStyle(folioFileteInkEl).opacity,
        } : null,
        fileteBorder: folioFileteBorderEl ? {
          height: getComputedStyle(folioFileteBorderEl).height,
          background: getComputedStyle(folioFileteBorderEl).backgroundColor,
        } : null,
      } : { present: false },
      userSeals: allSealEls.map((s) => {
        const cs = getComputedStyle(s);
        return {
          borderRadius: cs.borderRadius,
          isCircular: cs.borderRadius === '50%',
          hasDoubleRing: cs.borderTopWidth === '2px' && cs.outlineStyle === 'solid',
          size: { w: s.getBoundingClientRect().width, h: s.getBoundingClientRect().height },
        };
      }),
      userSealCount: allSealEls.length,
      userSealsAllCircular: allSealEls.length > 0 && allSealEls.every((s) => getComputedStyle(s).borderRadius === '50%'),
      userScopeLines: allScopeEls.map((d) => {
        const b = d.querySelector('b');
        return {
          text: (d.textContent || '').replace(/\s+/g, ' ').trim(),
          numberIsBold: b ? getComputedStyle(b).fontWeight === '700' || getComputedStyle(b).fontWeight === '800' : null,
          matchesAllCourses: /^Todos los cursos$/.test((d.textContent || '').trim()),
          matchesCounted: /^(1 curso asignado|\d+ cursos asignados)$/.test((d.textContent || '').trim()) && !/^1 cursos asignados$/.test((d.textContent || '').trim()),
        };
      }),
      userCardLayout: userRowEls.length > 0 ? {
        count: userRowEls.length,
        flexDirection: getComputedStyle(userRowEls[0]).flexDirection,
        isHorizontal: getComputedStyle(userRowEls[0]).flexDirection === 'row',
        isVertical: getComputedStyle(userRowEls[0]).flexDirection === 'column',
      } : { count: 0 },
      // Layout presence: on desktop the table is visible and cards are
      // hidden; on mobile cards are visible and the table is hidden.
      layoutMode: (() => {
        const tableWrap = document.querySelector('.data-table-wrap.hidden-mobile');
        const cardsWrap = document.querySelector('.hidden-desktop');
        const tableVisible = tableWrap ? getComputedStyle(tableWrap).display !== 'none' : null;
        const cardsVisible = cardsWrap ? getComputedStyle(cardsWrap).display !== 'none' : null;
        if (tableVisible === null || cardsVisible === null) return null;
        if (tableVisible && !cardsVisible) return 'desktop';
        if (!tableVisible && cardsVisible) return 'mobile-or-tablet-cards';
        return 'mixed';
      })(),
      // feature 33 assertions — Cuaderno Instituciones tab behavior.
      // Each one is a real behavior check, not a structural node count:
      // the chapter-header eyebrow must read "Capítulo VII — Instituciones
      // del sistema", every institution row must show the live stats line
      // with the bold numbers and singular/plural grammar the spec
      // requires, the seal must be the circular double-ring feature-base
      // variant, and there must be NO INS-001 folio (acceptance #4).
      institutionEyebrow: (() => {
        const el = document.querySelector('.chapter-eyebrow');
        if (!el) return { present: false };
        const roman = el.querySelector('.chapter-roman')?.textContent?.trim() ?? null;
        const sub   = el.querySelector('.chapter-sub')?.textContent?.trim() ?? null;
        const sep   = el.querySelector('.chapter-sep')?.textContent?.trim() ?? null;
        return { present: true, roman, sub, separator: sep, full: el.textContent.replace(/\s+/g, ' ').trim() };
      })(),
      institutionTitle: document.querySelector('.chapter-title')?.textContent?.trim() ?? null,
      institutionFiletePresent: !!document.querySelector('.chapter-filete .filete-ink') && !!document.querySelector('.chapter-filete .filete-border'),
      institutionRowCount: document.querySelectorAll('.admin-row.inst-row').length,
      institutionStatsLines: Array.from(document.querySelectorAll('.admin-row.inst-row .inst-stats')).map((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const boldEls = Array.from(el.querySelectorAll('b'));
        return {
          text,
          boldCount: boldEls.length,
          boldValuesAllBold: boldEls.length === 3 && boldEls.every((b) => {
            const fw = getComputedStyle(b).fontWeight;
            return fw === '700' || fw === '800';
          }),
          // Grammar: must never be "1 estudiantes" / "1 cursos" / "1 usuarios".
          matchesSingularForOne: /(^|\D)1\s+(estudiante|curso|usuario)(\s|$)/.test(text),
          matchesPluralForMany:  /(^|\D)[0-9]{2,}\s+(estudiantes|cursos|usuarios)(\s|$)/.test(text),
          // Three counts, two separators.
          separatorCount: (text.match(/·/g) || []).length,
        };
      }),
      institutionSeals: Array.from(document.querySelectorAll('.admin-row.inst-row .seal')).map((s) => {
        const cs = getComputedStyle(s);
        return {
          borderRadius: cs.borderRadius,
          isCircular: cs.borderRadius === '50%',
          hasDoubleRing: cs.borderTopWidth === '2px' && cs.outlineStyle === 'solid',
        };
      }),
      institutionSealsAllCircular: (() => {
        const seals = Array.from(document.querySelectorAll('.admin-row.inst-row .seal'));
        return seals.length > 0 && seals.every((s) => getComputedStyle(s).borderRadius === '50%');
      })(),
      institutionCardLayout: (() => {
        const row = document.querySelector('.admin-row.inst-row');
        if (!row) return { count: 0 };
        const cs = getComputedStyle(row);
        return {
          count: document.querySelectorAll('.admin-row.inst-row').length,
          flexDirection: cs.flexDirection,
          isHorizontal: cs.flexDirection === 'row',
          isVertical: cs.flexDirection === 'column',
          hasDivider: !!row.querySelector('.inst-card-divider'),
        };
      })(),
      institutionFolioAbsent: !document.querySelector('.inst-folio, .institutions-folio, [class*="inst"][class*="folio"]'),
    };
    // feature 34 assertions — Cuaderno admin tabs II/IV/V/VI. Each tab's
    // eyebrow Roman numeral must read correctly, the page-level double
    // filete must render, and (for Cursos/Motivos) the folio must show
    // the real count with correct singular/plural grammar. Severity
    // badges in Motivos are checked to still emit .badge-F/.badge-AT/
    // .badge-J (NOT replaced by a folio class). Lateral spine check
    // confirms .admin-row cards keep the border-left: 4px the spec calls
    // for, matching Usuarios/Años lectivos.
    const folioSnapshot = (selector) => {
      const root = document.querySelector(selector);
      if (!root) return { present: false };
      const ink = root.querySelector('.filete-ink');
      const border = root.querySelector('.filete-border');
      const text = root.querySelector('[class$="-folio-text"]');
      const number = text?.querySelector('b');
      const fullText = text?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
      return {
        present: true,
        text: fullText,
        numberText: number?.textContent?.trim() ?? null,
        numberIsBold: number ? getComputedStyle(number).fontWeight === '800' : null,
        fileteInk: ink ? {
          height: getComputedStyle(ink).height,
          background: getComputedStyle(ink).backgroundColor,
          opacity: getComputedStyle(ink).opacity,
        } : null,
        fileteBorder: border ? {
          height: getComputedStyle(border).height,
          background: getComputedStyle(border).backgroundColor,
        } : null,
      };
    };
    const coursesFolio = folioSnapshot('.courses-folio');
    const citationReasonsFolio = folioSnapshot('.citation-reasons-folio');
    // Eyebrow / filete / title are shared across every active tab (the
    // page-level <app-chapter-header> reads the same ADMIN_TAB_* maps);
    // these helpers report what's rendered so a per-tab smoke can assert
    // the Roman numeral matches (II / IV / V / VI).
    const eyebrowInfo = (() => {
      const el = document.querySelector('.chapter-eyebrow');
      if (!el) return { present: false };
      return {
        present: true,
        roman: el.querySelector('.chapter-roman')?.textContent?.trim() ?? null,
        sub:   el.querySelector('.chapter-sub')?.textContent?.trim() ?? null,
        separator: el.querySelector('.chapter-sep')?.textContent?.trim() ?? null,
        full: el.textContent.replace(/\s+/g, ' ').trim(),
      };
    })();
    const chapterFilete = {
      ink: !!document.querySelector('.chapter-filete .filete-ink'),
      border: !!document.querySelector('.chapter-filete .filete-border'),
    };
    const coursesEyebrow = eyebrowInfo;
    const coursesTitle = document.querySelector('.chapter-title')?.textContent?.trim() ?? null;
    const coursesFiletePresent = chapterFilete.ink && chapterFilete.border;
    const coursesFolioPresent = coursesFolio.present;
    const coursesFolioCount = coursesFolio.numberText !== null ? Number(coursesFolio.numberText) : null;
    const coursesFolioGrammar = (() => {
      const t = coursesFolio.text;
      if (!t) return { matches: null };
      return {
        matches: t === 'Registros: 1 curso' || /^Registros: \d+ cursos$/.test(t),
        rejectsOnePlural: !/^Registros: 1 cursos$/.test(t),
      };
    })();
    const citationReasonsEyebrow = eyebrowInfo;
    const citationReasonsTitle = document.querySelector('.chapter-title')?.textContent?.trim() ?? null;
    const citationReasonsFiletePresent = chapterFilete.ink && chapterFilete.border;
    const citationReasonsFolioPresent = citationReasonsFolio.present;
    const citationReasonsFolioCount = citationReasonsFolio.numberText !== null ? Number(citationReasonsFolio.numberText) : null;
    const citationReasonsFolioGrammar = (() => {
      const t = citationReasonsFolio.text;
      if (!t) return { matches: null };
      return {
        matches: t === 'Registros: 1 motivo' || /^Registros: \d+ motivos$/.test(t),
        rejectsOnePlural: !/^Registros: 1 motivos$/.test(t),
      };
    })();
    const permissionsEyebrow = eyebrowInfo;
    const permissionsTitle = document.querySelector('.chapter-title')?.textContent?.trim() ?? null;
    const permissionsFiletePresent = chapterFilete.ink && chapterFilete.border;
    // Permisos tab doesn't render a folio (per spec) — explicit absent check.
    const permissionsFolioAbsent = !document.querySelector('.permissions-folio');
    const rosterEyebrow = eyebrowInfo;
    const rosterTitle = document.querySelector('.chapter-title')?.textContent?.trim() ?? null;
    const rosterFiletePresent = chapterFilete.ink && chapterFilete.border;
    const rosterFolioAbsent = !document.querySelector('.roster-folio');
    // Severity badges in Motivos: must still emit .badge-F / .badge-AT /
    // .badge-J (NOT replaced by a folio class). The fixture has all three
    // severities so this asserts the page-level severity-badges invariant.
    const severityBadgeClassPreserved = (() => {
      const badges = Array.from(document.querySelectorAll('.admin-row .badge-F, .admin-row .badge-AT, .admin-row .badge-J, table .badge-F, table .badge-AT, table .badge-J'));
      const hasF = badges.some((b) => b.classList.contains('badge-F'));
      const hasAT = badges.some((b) => b.classList.contains('badge-AT'));
      const hasJ = badges.some((b) => b.classList.contains('badge-J'));
      return { count: badges.length, hasF, hasAT, hasJ, all: hasF && hasAT && hasJ };
    })();
    // Lateral spine: .admin-row cards in Cursos/Motivos must keep the
    // border-left: 4px the shared .admin-row rule provides. The desktop
    // table rows live inside .data-table (no border-left needed there).
    const lateralSpine = (() => {
      const adminRowEls = Array.from(document.querySelectorAll('.admin-row'));
      if (adminRowEls.length === 0) return { present: false, count: 0 };
      return {
        present: true,
        count: adminRowEls.length,
        allHaveSpine: adminRowEls.every((r) => {
          const blw = getComputedStyle(r).borderLeftWidth;
          return blw === '4px';
        }),
        allHaveSpineColor: adminRowEls.every((r) => {
          const c = getComputedStyle(r).borderLeftColor;
          return c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
        }),
      };
    })();
    return {
      ...original,
      coursesEyebrow,
      coursesTitle,
      coursesFiletePresent,
      coursesFolioPresent,
      coursesFolio,
      coursesFolioCount,
      coursesFolioGrammar,
      citationReasonsEyebrow,
      citationReasonsTitle,
      citationReasonsFiletePresent,
      citationReasonsFolioPresent,
      citationReasonsFolio,
      citationReasonsFolioCount,
      citationReasonsFolioGrammar,
      permissionsEyebrow,
      permissionsTitle,
      permissionsFiletePresent,
      permissionsFolioAbsent,
      rosterEyebrow,
      rosterTitle,
      rosterFiletePresent,
      rosterFolioAbsent,
      severityBadgeClassPreserved,
      lateralSpine,
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
// byte-identical to before when VISUAL_CLICK isn't provided. VISUAL_CLICK_2
// (and VISUAL_WAIT_MS_2) chain a second click after the first when an open
// overlay needs to be resolved (e.g. clicking a mat-option to confirm a
// selection opened by VISUAL_CLICK).
if (process.env.VISUAL_CLICK) {
  await page.click(process.env.VISUAL_CLICK, { timeout: 10000 });
  await wait(Number(process.env.VISUAL_WAIT_MS) || 1000);
}
if (process.env.VISUAL_CLICK_2) {
  await wait(500);
  await page.click(process.env.VISUAL_CLICK_2, { timeout: 10000 });
  await wait(Number(process.env.VISUAL_WAIT_MS_2) || 1500);
}
if (process.env.VISUAL_CLICK_3) {
  await wait(500);
  await page.click(process.env.VISUAL_CLICK_3, { timeout: 10000 });
  await wait(Number(process.env.VISUAL_WAIT_MS_3) || 1500);
}
if (process.env.VISUAL_CLICK_4) {
  await wait(500);
  await page.click(process.env.VISUAL_CLICK_4, { timeout: 10000 });
  await wait(Number(process.env.VISUAL_WAIT_MS_4) || 1500);
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