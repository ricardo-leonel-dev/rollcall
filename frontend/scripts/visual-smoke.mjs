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

// Withdrawal reasons fixture: one row with a description and one without, so
// the capture shows both the description cell and its "—" fallback. The
// empty state is captured with VISUAL_EMPTY_WITHDRAWAL_REASONS=1.
const MOCK_WITHDRAWAL_REASONS = [
  { id: 1, institutionId: 1, name: 'Cambio de domicilio', description: 'La familia se mudó de ciudad.', isActive: true, createdAt: '2026-01-10T12:00:00.000Z', updatedAt: '2026-01-10T12:00:00.000Z', deletedAt: null },
  { id: 2, institutionId: 1, name: 'Otro', description: null, isActive: true, createdAt: '2026-01-10T12:00:00.000Z', updatedAt: '2026-01-10T12:00:00.000Z', deletedAt: null },
  { id: 3, institutionId: 1, name: 'Motivo anterior', description: null, isActive: false, createdAt: '2026-01-10T12:00:00.000Z', updatedAt: '2026-01-10T12:00:00.000Z', deletedAt: null },
];

// Roster fixture for the students screen: two students of 5° A, so the
// capture can show the row menu of a student and the numbers the roster
// keeps as they are stored.
const MOCK_ENROLLMENTS = [
  {
    enrollmentId: 101, academicYearId: 1, academicYear: 'Año Lectivo 2026', courseId: 1, course: '5° A',
    teacher: null, studentId: 11, rosterNumber: 1, idNumber: '0750110011', fullName: 'Ana Torres',
    gender: 'F', birthDate: '2013-04-11', age: 13, isEnrolled: true, studentPhone: null, studentEmail: null,
    guardianId: 21, guardianName: 'María Torres', guardianPhone: '+593991234567',
    whatsappLink: 'https://wa.me/593991234567', guardianEmail: null, guardianIdNumber: null, isActive: true,
  },
  {
    enrollmentId: 102, academicYearId: 1, academicYear: 'Año Lectivo 2026', courseId: 1, course: '5° A',
    teacher: null, studentId: 12, rosterNumber: 2, idNumber: '0750110022', fullName: 'Luis Pérez',
    gender: 'M', birthDate: '2012-09-02', age: 14, isEnrolled: true, studentPhone: null, studentEmail: null,
    guardianId: 22, guardianName: 'Carlos Pérez', guardianPhone: '+593992345678',
    whatsappLink: 'https://wa.me/593992345678', guardianEmail: null, guardianIdNumber: null, isActive: true,
  },
];

// Withdrawals fixture: one active withdrawal and one that was already
// reincorporated, so the capture shows both states of the table (the flat
// pills and the muted name of a reincorporated student).
const MOCK_WITHDRAWALS = [
  {
    id: 11, enrollmentId: 101, studentId: 21, studentName: 'Ana Torres', idNumber: '0750110011',
    courseId: 1, courseName: '5° A', academicYearId: 1, academicYear: 'Año Lectivo 2026',
    withdrawalDate: '2026-05-10', reason: { id: 1, name: 'Cambio de domicilio' },
    notes: 'La familia se mudó de ciudad.', statsVisibility: 'until_withdrawal',
    withdrawnAt: '2026-05-10T14:00:00.000Z', withdrawnBy: { id: 1, fullName: 'Visual Smoke' },
    revertedAt: null, revertedBy: null,
  },
  {
    id: 12, enrollmentId: 102, studentId: 22, studentName: 'Luis Pérez', idNumber: '0750110022',
    courseId: 2, courseName: '5° B', academicYearId: 1, academicYear: 'Año Lectivo 2026',
    withdrawalDate: '2026-04-02', reason: { id: 2, name: 'Otro' },
    notes: null, statsVisibility: 'whole_year',
    withdrawnAt: '2026-04-02T14:00:00.000Z', withdrawnBy: { id: 1, fullName: 'Visual Smoke' },
    revertedAt: '2026-06-01T15:30:00.000Z', revertedBy: { id: 1, fullName: 'Visual Smoke' },
  },
];

// The record of the withdrawals of one student, drawn as a ledger.
const MOCK_WITHDRAWAL_RECORD = [
  MOCK_WITHDRAWALS[1],
  MOCK_WITHDRAWALS[0],
];

// The counts of the panel of the withdrawals: six reasons, so the panel has
// to fill its two columns row by row, and two of them without withdrawals.
const MOCK_WITHDRAWAL_STATS = {
  total: 8,
  byReason: [
    { reasonId: 1, reasonName: 'Cambio de domicilio', count: 3 },
    { reasonId: 2, reasonName: 'Motivos económicos', count: 2 },
    { reasonId: 4, reasonName: 'Salud', count: 0 },
    { reasonId: 5, reasonName: 'Cambio de ciudad', count: 1 },
    { reasonId: 6, reasonName: 'Problemas familiares', count: 1 },
    { reasonId: 7, reasonName: 'Otros', count: 0 },
  ],
};

const MOCK_STUDENT_HISTORY_SUMMARY = {
  enrollment: {
    enrollmentId: 101, studentName: 'Ana Torres', idNumber: '0750110011', rosterNumber: 1,
    courseId: 1, courseName: '5° A', academicYearId: 1, academicYear: 'Año Lectivo 2026',
  },
  absences: { total: 1, items: [{ id: 1, date: '2026-05-01', createdAt: '2026-05-01T08:00:00.000Z', isJustified: false }] },
  tardies: { total: 0, items: [] },
  justifications: { total: 0, items: [] },
  citations: { total: 0, items: [] },
};

// The timeline of the history, with a citation among the other events.
const MOCK_STUDENT_HISTORY_TIMELINE = [
  { type: 'enrollment', recordedAt: '2026-01-10T08:00:00.000Z', occurredAt: '2026-01-10', title: 'Matrícula', description: 'El estudiante fue matriculado en el curso.', createdByName: 'Visual Smoke', origin: null },
  { type: 'absence', recordedAt: '2026-05-01T08:00:00.000Z', occurredAt: '2026-05-01', title: 'Falta', description: 'Falta registrada en el curso.', createdByName: 'Visual Smoke', origin: null },
  { type: 'citation', recordedAt: '2026-05-05T10:30:00.000Z', occurredAt: '2026-05-05', title: 'Citación', description: 'Citación al representante el 15 de octubre de 2026 a las 10:30. Motivos: Conducta', createdByName: 'Visual Smoke', origin: null },
];

async function mockApi(context, options = {}) {
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
      const rows = [
        { resource: 'absences',       canRead: true,  canCreate: true,  canUpdate: true,  canDelete: false },
        { resource: 'students',        canRead: true,  canCreate: true,  canUpdate: true,  canDelete: false },
        { resource: 'justifications',  canRead: true,  canCreate: true,  canUpdate: true,  canDelete: true  },
        { resource: 'withdrawal-reasons', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
      ];
      if (FEATURE === 'student_withdraw_action') {
        rows.push({ resource: 'student-withdrawals', canRead: true, canCreate: true, canUpdate: true, canDelete: false });
      }
      if (FEATURE === 'withdrawn_students_view') {
        rows.push({ resource: 'student-withdrawals', canRead: true, canCreate: true, canUpdate: true, canDelete: true });
      }
      if (FEATURE === 'withdrawal_stats_panel') {
        rows.push({ resource: 'student-withdrawals', canRead: true, canCreate: true, canUpdate: true, canDelete: true });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    if (url.includes('/api/roles')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 1, name: 'admin', description: 'Administrador', institutionId: 1, permissions: null },
      ]) });
    }
    if (url.includes('/api/citation-reasons')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CITATION_REASONS) });
    }
    if (url.includes('/api/withdrawal-reasons')) {
      const empty = options.emptyReasons === true || process.env.VISUAL_EMPTY_WITHDRAWAL_REASONS === '1';
      const reasons = empty ? [] : MOCK_WITHDRAWAL_REASONS;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reasons) });
    }
    if (url.includes('/api/enrollments')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENROLLMENTS) });
    }
    if (url.includes('/api/student-withdrawals/students/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WITHDRAWAL_RECORD) });
    }
    if (url.includes('/api/student-history/') && url.includes('/summary')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_STUDENT_HISTORY_SUMMARY) });
    }
    if (url.includes('/api/student-history/') && url.includes('/timeline')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_STUDENT_HISTORY_TIMELINE) });
    }
    if (url.includes('/api/student-withdrawals/stats')) {
      // The counts of the panel of the withdrawals. The empty and the refused
      // answers are captured with VISUAL_EMPTY_WITHDRAWAL_STATS=1 and
      // VISUAL_WITHDRAWAL_STATS_ERROR=1.
      const empty = options.statsEmpty === true || process.env.VISUAL_EMPTY_WITHDRAWAL_STATS === '1';
      const failed = options.statsError === true || process.env.VISUAL_WITHDRAWAL_STATS_ERROR === '1';
      if (failed) {
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Sin permiso de read en student-withdrawals' }) });
      }
      const body = empty ? { total: 0, byReason: [] } : MOCK_WITHDRAWAL_STATS;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (url.includes('/api/student-withdrawals')) {
      const failed = options.withdrawalsError === true || process.env.VISUAL_WITHDRAWALS_ERROR === '1';
      if (failed) {
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Sin permiso de read en student-withdrawals' }) });
      }
      const empty = options.emptyWithdrawals === true || process.env.VISUAL_EMPTY_WITHDRAWALS === '1';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty ? [] : MOCK_WITHDRAWALS) });
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
      // the chapter-header eyebrow must read "Capítulo VIII — Instituciones
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
    // feature 34 assertions — Cuaderno admin tabs II/IV/V/VI (roster is
    // VII and institutions VIII since the withdrawal reasons tab took
    // VI). Each tab's eyebrow Roman numeral must read correctly, the
    // page-level double filete must render, and (for Cursos/Motivos) the
    // folio must show the real count with correct singular/plural grammar.
    // Severity badges in Motivos are checked to still emit .badge-F/.badge-AT/
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
    // the Roman numeral matches (II / IV / V / VI, roster VII and
    // institutions VIII).
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
    // Withdrawal reasons tab: the folio, the rows (name + description, with
    // the "—" fallback for a reason without description) and the empty state.
    const withdrawalReasonsFolio = folioSnapshot('.withdrawal-reasons-folio');
    const withdrawalReasonsEyebrow = eyebrowInfo;
    const withdrawalReasonsTitle = document.querySelector('.chapter-title')?.textContent?.trim() ?? null;
    const withdrawalReasonsFiletePresent = chapterFilete.ink && chapterFilete.border;
    const withdrawalReasonsRows = Array.from(document.querySelectorAll('.data-table tbody tr')).map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim());
      return {
        name: cells[0] ?? null,
        description: cells[1] ?? null,
        hasEdit: !!tr.querySelector('button[aria-label="Editar motivo"]'),
        hasDelete: !!tr.querySelector('button[aria-label="Eliminar motivo"]'),
      };
    });
    const withdrawalReasonsEmptyState = (() => {
      const p = Array.from(document.querySelectorAll('.tab-content p'))
        .find(el => /No hay motivos de retiro registrados\./.test(el.textContent || ''));
      if (!p) return { present: false };
      const cs = getComputedStyle(p);
      return {
        present: true,
        text: (p.textContent || '').replace(/\s+/g, ' ').trim(),
        padding: cs.padding,
        textAlign: cs.textAlign,
        color: cs.color,
        fontSize: cs.fontSize,
      };
    })();
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
      withdrawalReasonsEyebrow,
      withdrawalReasonsTitle,
      withdrawalReasonsFiletePresent,
      withdrawalReasonsFolio,
      withdrawalReasonsRows,
      withdrawalReasonsEmptyState,
      rosterEyebrow,
      rosterTitle,
      rosterFiletePresent,
      rosterFolioAbsent,
      severityBadgeClassPreserved,
      lateralSpine,
    };
  });
}

// The "Retirar" action of the students screen: the states worth looking at
// (the row menu, the dialog, the counter, the catalog without active reasons
// and the confirmation) live behind clicks, so this feature gets its own
// capture sequence.
async function captureStudentWithdrawAction(browser, page, outDir) {
  const report = { states: [] };
  const shot = async (target, name) => {
    const path = join(outDir, `visual_${FEATURE}_${VW}_${name}.png`);
    await target.screenshot({ path, fullPage: false });
    report.states.push({ name, screenshot: path });
  };

  // Below the md breakpoint the roster is a list of cards instead of a
  // table, so the row and its menu live in a different place.
  const isMobile = Number(VW) < 768;

  const openRoster = async (target) => {
    await target.goto(`${BASE_URL}/students/manage`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const courseSelect = target.locator('mat-form-field:has(mat-label:text-is("Curso")) mat-select').first();
    await courseSelect.waitFor({ state: 'visible', timeout: 15000 });
    await courseSelect.click();
    await target.locator('mat-option', { hasText: '5° A' }).first().click();
    // The course filter is a multiple select: the overlay stays open.
    await target.keyboard.press('Escape');
    await firstRow(target).waitFor({ state: 'visible', timeout: 15000 });
  };

  const firstRow = (target) => isMobile
    ? target.locator('.md\\:hidden .card').first()
    : target.locator('table.data-table tbody tr').first();

  const menuTrigger = (target) => isMobile
    ? target.locator('.md\\:hidden .card').first().locator('button').last()
    : target.locator('table.data-table tbody tr').first().locator('td:last-child button');

  const openRowMenu = async (target) => {
    await menuTrigger(target).click();
    await target.locator('.mat-mdc-menu-panel').waitFor({ state: 'visible', timeout: 10000 });
  };

  const openWithdrawDialog = async (target) => {
    const dialog = target.locator('mat-dialog-container').filter({ hasText: 'Fecha de retiro' });
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await wait(600);
    return dialog;
  };

  await openRoster(page);

  // 1. the row menu of a student, with the Retirar item.
  await openRowMenu(page);
  report.menuItems = (await page.locator('.mat-mdc-menu-item').allTextContents())
    .map(t => t.replace(/\s+/g, ' ').trim());
  await shot(page, 'menu');

  // 2. the dialog in its default state.
  await page.locator('.mat-mdc-menu-item', { hasText: 'Retirar' }).first().click();
  const dialog = await openWithdrawDialog(page);
  report.dialog = {
    title: (await dialog.locator('h2[mat-dialog-title]').textContent()).trim(),
    student: (await dialog.locator('.who-name').textContent()).trim(),
    course: (await dialog.locator('.who-course').textContent()).replace(/\s+/g, ' ').trim(),
    fields: (await dialog.locator('mat-label').allTextContents()).map(t => t.trim()),
    date: await dialog.locator('input[matinput]').first().inputValue(),
    counter: (await dialog.locator('.notes-counter').textContent()).trim(),
    visibilityOptions: await dialog.locator('.visibility-row').evaluateAll(rows => rows.map(row => ({
      label: row.querySelector('.option-label')?.textContent.trim() ?? null,
      help: row.querySelector('.option-help')?.textContent.trim() ?? null,
      selected: row.classList.contains('selected'),
    }))),
    notices: (await dialog.locator('.pending-banner').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim()),
  };
  await shot(page, 'dialog');

  // 3. the counter near the limit.
  await dialog.locator('textarea').fill('x'.repeat(980));
  await wait(300);
  report.counterNearLimit = (await dialog.locator('.notes-counter').textContent()).trim();
  await shot(page, 'notes');

  // 4. the confirmation.
  await dialog.locator('mat-select').click();
  await page.locator('mat-option', { hasText: 'Cambio de domicilio' }).first().click();
  await wait(300);
  await dialog.locator('mat-dialog-actions button', { hasText: 'Retirar' }).click();
  const confirm = page.locator('mat-dialog-container').filter({ hasText: '¿Retirar a' });
  await confirm.waitFor({ state: 'visible', timeout: 10000 });
  await wait(400);
  report.confirmation = {
    title: (await confirm.locator('.title').textContent()).trim(),
    message: (await confirm.locator('.message').textContent()).replace(/\s+/g, ' ').trim(),
  };
  await shot(page, 'confirm');

  // 5. the catalog without active reasons (its own context, so the reasons
  // list is empty for that page only).
  const emptyContext = await browser.newContext({
    viewport: { width: Number(VW), height: Number(VH) },
    serviceWorkers: 'block',
  });
  await mockApi(emptyContext, { emptyReasons: true });
  const emptyPage = await emptyContext.newPage();
  await injectAuth(emptyPage);
  await openRoster(emptyPage);
  await openRowMenu(emptyPage);
  await emptyPage.locator('.mat-mdc-menu-item', { hasText: 'Retirar' }).first().click();
  const emptyDialog = await openWithdrawDialog(emptyPage);
  report.emptyCatalogNotice = (await emptyDialog.locator('.pending-banner').textContent())
    .replace(/\s+/g, ' ').trim();
  report.emptyCatalogRetirarDisabled = await emptyDialog
    .locator('mat-dialog-actions button', { hasText: 'Retirar' }).isDisabled();
  await shot(emptyPage, 'no_reasons');
  await emptyContext.close();

  return report;
}

// The screen of the withdrawn students: most of its states live behind a
// click (the row menu, the two dialogs, the timeline tab) and two of them
// live behind the mocks (the empty list and the list the backend refuses),
// so this feature gets its own capture sequence.
async function captureWithdrawnStudentsView(browser, page, outDir) {
  const report = { states: [] };
  const shot = async (target, name) => {
    const path = join(outDir, `visual_${FEATURE}_${VW}_${name}.png`);
    await target.screenshot({ path, fullPage: false });
    report.states.push({ name, screenshot: path });
  };

  // Below the md breakpoint the list is a set of cards instead of a table,
  // so the row and its menu live in a different place.
  const isMobile = Number(VW) < 768;

  const firstRow = (target) => isMobile
    ? target.locator('.md\\:hidden .card').first()
    : target.locator('table.data-table tbody tr').first();

  const menuTrigger = (target) => isMobile
    ? target.locator('.md\\:hidden .card').first().locator('button').last()
    : target.locator('table.data-table tbody tr').first().locator('td:last-child button');

  const openList = async (target) => {
    await target.goto(`${BASE_URL}/students/withdrawn`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await firstRow(target).waitFor({ state: 'visible', timeout: 15000 });
  };

  const openRowMenu = async (target) => {
    await menuTrigger(target).click();
    await target.locator('.mat-mdc-menu-panel').waitFor({ state: 'visible', timeout: 10000 });
  };

  await openList(page);

  // 1. the list, with an active and a reincorporated withdrawal.
  report.header = (await page.locator('.page-title').textContent()).trim();
  report.eyebrow = (await page.locator('.chapter-eyebrow').textContent()).replace(/\s+/g, ' ').trim();
  report.counter = (await page.locator('.filter-bar div', { hasText: /retiro/ }).first().textContent()).replace(/\s+/g, ' ').trim();
  report.rows = (await page.locator('table.data-table tbody tr').allTextContents())
    .map(t => t.replace(/\s+/g, ' ').trim());
  await shot(page, 'list');

  // 2. the row menu.
  await openRowMenu(page);
  report.menuItems = (await page.locator('.mat-mdc-menu-item .mat-mdc-menu-item-text').allTextContents())
    .map(t => t.replace(/\s+/g, ' ').trim());
  await shot(page, 'menu');

  // 3. the record of the withdrawals of the student, drawn as a ledger.
  await page.locator('.mat-mdc-menu-item', { hasText: 'Ver retiros' }).first().click();
  const record = page.locator('mat-dialog-container').filter({ hasText: 'Retiros de Ana Torres' });
  await record.waitFor({ state: 'visible', timeout: 10000 });
  await wait(500);
  report.record = {
    title: (await record.locator('h2[mat-dialog-title]').textContent()).trim(),
    entries: await record.locator('.entry').evaluateAll(rows => rows.map(row => ({
      text: row.textContent.replace(/\s+/g, ' ').trim(),
      stamp: row.querySelector('.stamp')?.textContent.trim() ?? null,
      stampColor: row.querySelector('.stamp') ? getComputedStyle(row.querySelector('.stamp')).color : null,
    }))),
  };
  await shot(page, 'record');
  await page.keyboard.press('Escape');
  await wait(400);

  // 4. the visibility of the records.
  await openRowMenu(page);
  await page.locator('.mat-mdc-menu-item', { hasText: 'Cambiar visibilidad' }).first().click();
  const visibility = page.locator('mat-dialog-container').filter({ hasText: 'Visibilidad en reportes' });
  await visibility.waitFor({ state: 'visible', timeout: 10000 });
  await wait(400);
  report.visibility = {
    title: (await visibility.locator('h2[mat-dialog-title]').textContent()).trim(),
    options: await visibility.locator('.visibility-row').evaluateAll(rows => rows.map(row => ({
      label: row.querySelector('.option-label')?.textContent.trim() ?? null,
      selected: row.classList.contains('selected'),
    }))),
    guardarDisabled: await visibility.locator('mat-dialog-actions button', { hasText: 'Guardar' }).isDisabled(),
  };
  await shot(page, 'visibility');
  await page.keyboard.press('Escape');
  await wait(400);

  // 5. the history of the student, with the citation on the timeline.
  await openRowMenu(page);
  await page.locator('.mat-mdc-menu-item', { hasText: 'Ver historial' }).first().click();
  const history = page.locator('mat-dialog-container').filter({ hasText: 'Ana Torres' });
  await history.waitFor({ state: 'visible', timeout: 10000 });
  await history.locator('.mat-mdc-tab', { hasText: 'Histórica' }).click();
  await wait(800);
  report.timeline = {
    events: await history.locator('.timeline-title').allTextContents(),
    descriptions: await history.locator('.timeline-desc').allTextContents(),
    nodeClasses: await history.locator('.timeline-node').evaluateAll(nodes => nodes.map(n => n.className)),
  };
  await shot(page, 'history');
  await page.keyboard.press('Escape');
  await wait(400);

  // 6. the list without withdrawals, and the list the backend refuses.
  const stateContext = async (options) => {
    const context = await browser.newContext({
      viewport: { width: Number(VW), height: Number(VH) },
      serviceWorkers: 'block',
    });
    await mockApi(context, options);
    const target = await context.newPage();
    await injectAuth(target);
    return { context, target };
  };

  const { context: emptyContext, target: emptyPage } = await stateContext({ emptyWithdrawals: true });
  await emptyPage.goto(`${BASE_URL}/students/withdrawn`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await emptyPage.locator('.empty-state').first().waitFor({ state: 'visible', timeout: 15000 });
  report.emptyState = (await emptyPage.locator('.empty-state').first().textContent()).replace(/\s+/g, ' ').trim();
  await shot(emptyPage, 'empty');
  await emptyContext.close();

  const { context: errorContext, target: errorPage } = await stateContext({ withdrawalsError: true });
  await errorPage.goto(`${BASE_URL}/students/withdrawn`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await errorPage.locator('.empty-state').first().waitFor({ state: 'visible', timeout: 15000 });
  report.errorState = (await errorPage.locator('.empty-state').first().textContent()).replace(/\s+/g, ' ').trim();
  await shot(errorPage, 'error');
  await errorContext.close();

  return report;
}

// The panel of the counts of the withdrawals, above the list of the withdrawn
// students. Its states live behind the mocks (the empty counts and the counts
// the backend refuses) and behind the disclosure button, so this feature gets
// its own capture sequence.
async function captureWithdrawalStatsPanel(browser, page, outDir) {
  const report = { states: [] };
  const shot = async (target, name) => {
    const path = join(outDir, `visual_${FEATURE}_${VW}_${name}.png`);
    await target.screenshot({ path, fullPage: false });
    report.states.push({ name, screenshot: path });
  };

  const isMobile = Number(VW) < 768;
  const toggle = page.getByRole('button', { name: 'Retiros vigentes por motivo' });
  const panel = page.locator('section[aria-labelledby]', { has: toggle });
  const text = async (target) => (await target.innerText()).replace(/\s+/g, ' ').trim();

  // On a phone the filters take the whole screen, so the panel is brought
  // into view before every capture.
  const showPanel = async (target) => {
    await target.locator('section[aria-labelledby]', {
      has: target.getByRole('button', { name: 'Retiros vigentes por motivo' }),
    }).scrollIntoViewIfNeeded();
    await wait(300);
  };

  const filterSelect = (target, label) => target.locator('mat-form-field', {
    has: target.locator(`mat-label:text-is("${label}")`),
  }).locator('mat-select').first();

  const pickOption = async (target, label, optionText) => {
    await filterSelect(target, label).click();
    const option = target.locator('mat-option', { hasText: optionText }).first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
    await wait(400);
  };

  const open = async (target) => {
    await target.goto(`${BASE_URL}/students/withdrawn`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await toggle.waitFor({ state: 'visible', timeout: 15000 });
    await wait(700);
  };

  await open(page);

  // 1. the panel as it opens: closed on a phone, open on a screen.
  await showPanel(page);
  report.expandedOnOpen = await toggle.getAttribute('aria-expanded');
  report.panelOnOpen = await text(panel);
  await shot(page, isMobile ? 'collapsed' : 'panel');

  if (isMobile) {
    await toggle.click();
    await wait(400);
    report.expandedAfterToggle = await toggle.getAttribute('aria-expanded');
    report.panelExpanded = await text(panel);
    await showPanel(page);
    await shot(page, 'expanded');
  }

  // 2. the panel with the filters of the screen, so the caption names them.
  await pickOption(page, 'Curso', '5° A');
  await pickOption(page, 'Motivo', 'Cambio de domicilio');
  report.caption = await text(panel);
  await showPanel(page);
  await shot(page, 'filters');

  // 3. the panel without withdrawals, and the counts the backend refuses.
  const stateContext = async (options) => {
    const context = await browser.newContext({
      viewport: { width: Number(VW), height: Number(VH) },
      serviceWorkers: 'block',
    });
    await mockApi(context, options);
    const target = await context.newPage();
    await injectAuth(target);
    return { context, target };
  };

  const { context: emptyContext, target: emptyPage } = await stateContext({ statsEmpty: true });
  await open(emptyPage);
  await showPanel(emptyPage);
  report.emptyState = await text(emptyPage.locator('section[aria-labelledby]', { has: emptyPage.getByRole('button', { name: 'Retiros vigentes por motivo' }) }));
  await shot(emptyPage, 'empty');
  await emptyContext.close();

  const { context: errorContext, target: errorPage } = await stateContext({ statsError: true });
  await open(errorPage);
  await showPanel(errorPage);
  report.errorState = await text(errorPage.locator('section[aria-labelledby]', { has: errorPage.getByRole('button', { name: 'Retiros vigentes por motivo' }) }));
  await shot(errorPage, 'error');
  await errorContext.close();

  return report;
}

async function main() {
  if (!NO_SERVER) await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: Number(VW), height: Number(VH) },
      // The service worker caches two API paths of its own; blocking it keeps
      // the mocked API in charge of every request the page makes.
      serviceWorkers: FEATURE === 'student_withdraw_action' || FEATURE === 'withdrawn_students_view' || FEATURE === 'withdrawal_stats_panel' ? 'block' : 'allow',
    });
    await mockApi(context);
    const page = await context.newPage();
    await injectAuth(page);
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[console.error]', msg.text());
    });
    if (FEATURE === 'withdrawn_students_view') {
      const info = await captureWithdrawnStudentsView(browser, page, OUT_DIR);
      const payload = { ...info, viewport: { width: Number(VW), height: Number(VH) } };
      // One report per width, so the captures of both sizes are kept.
      const widthReport = join(OUT_DIR, `visual_${FEATURE}_${VW}.json`);
      writeFileSync(widthReport, JSON.stringify(payload, null, 2));
      writeFileSync(REPORT_PATH, JSON.stringify(payload, null, 2));
      console.log(JSON.stringify({ ok: true, report: widthReport, ...info }, null, 2));
      return;
    }
    if (FEATURE === 'student_withdraw_action') {
      const info = await captureStudentWithdrawAction(browser, page, OUT_DIR);
      const payload = { ...info, viewport: { width: Number(VW), height: Number(VH) } };
      // One report per width, so the captures of both sizes are kept.
      const widthReport = join(OUT_DIR, `visual_${FEATURE}_${VW}.json`);
      writeFileSync(widthReport, JSON.stringify(payload, null, 2));
      writeFileSync(REPORT_PATH, JSON.stringify(payload, null, 2));
      console.log(JSON.stringify({ ok: true, report: widthReport, ...info }, null, 2));
      return;
    }
    if (FEATURE === 'withdrawal_stats_panel') {
      const info = await captureWithdrawalStatsPanel(browser, page, OUT_DIR);
      const payload = { ...info, viewport: { width: Number(VW), height: Number(VH) } };
      // One report per width, so the captures of both sizes are kept.
      const widthReport = join(OUT_DIR, `visual_${FEATURE}_${VW}.json`);
      writeFileSync(widthReport, JSON.stringify(payload, null, 2));
      writeFileSync(REPORT_PATH, JSON.stringify(payload, null, 2));
      console.log(JSON.stringify({ ok: true, report: widthReport, ...info }, null, 2));
      return;
    }
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