/**
 * Full screenshot pass — registers fresh student/teacher/sponsor accounts,
 * logs in, walks every role-appropriate route at three viewport widths,
 * and saves PNGs to `e2e/screenshots/<role>/<viewport>/<route>.png`.
 *
 * Run after `npm run dev` + uvicorn are up on the default ports.
 *
 *     npm run test:e2e -- screenshot-all
 *
 * The frontend stores auth state in localStorage (`auth_token`,
 * `current_user`) — Phase B5's HttpOnly cookie is a secondary path. We
 * register via the REST API, then seed localStorage on first page load so
 * the dashboards render their authenticated UI without going through the
 * login form (saves ~3 minutes per role).
 */

import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.E2E_API_URL || 'http://localhost:8000';
const APP = process.env.E2E_BASE_URL || 'http://localhost:3000';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

type Role = 'student' | 'teacher' | 'sponsor';

const ROUTES: Record<Role, string[]> = {
  student: [
    '/students/dashboard',
    '/students/live-sessions',
    '/students/pre-recorded-lessons',
    '/students/content-library',
    '/students/network/find-teachers',
    '/students/scholarships',
    '/students/scholarships/applications',
    '/students/redeem-code',
    '/students/forum',
    '/students/events',
    '/students/chat',
    '/students/meetings',
    '/students/payment-history',
    '/students/settings/accessibility',
    '/students/accessibility-onboarding',
    '/students/exams',
    '/students/certificates',
    '/students/progress-report',
    '/students/groups',
    '/students/peers',
    '/students/downloads',
  ],
  teacher: [
    '/teachers/dashboard',
    '/teachers/home',
    '/teachers/students',
    '/teachers/live-sessions',
    '/teachers/schedule',
    '/teachers/content',
    '/teachers/content/upload',
    '/teachers/content-management',
    '/teachers/accessibility-tracks',
    '/teachers/accessibility-specialization',
    '/teachers/meetings',
    '/teachers/earnings',
    '/teachers/payment-history',
    '/teachers/settings/specializations',
    '/teachers/exams',
    '/teachers/analytics',
  ],
  sponsor: [
    '/sponsors/dashboard',
    '/sponsors/campaigns',
    '/sponsors/scholarships',
    '/sponsors/access-codes',
    '/sponsors/connect-teachers',
    '/sponsors/events',
    '/sponsors/analytics',
    '/sponsors/impact',
  ],
};

const PUBLIC_ROUTES = [
  '/',
  '/auth',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/guardian-verify',
  '/impact',
];

interface UserSession {
  token: string;
  user: any;
}

async function register(role: Role): Promise<UserSession> {
  const email = `ss-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'Test1234!';
  const regRes = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      first_name: 'QA',
      last_name: role.charAt(0).toUpperCase() + role.slice(1),
      role,
    }),
  });
  if (!regRes.ok) {
    throw new Error(`register ${role} failed: ${regRes.status} ${await regRes.text()}`);
  }
  const loginRes = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    throw new Error(`login ${role} failed: ${loginRes.status}`);
  }
  const data = await loginRes.json();
  if (role === 'sponsor') {
    await fetch(`${API}/api/v1/sponsors/profile/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.access_token}`,
      },
      body: JSON.stringify({
        company_name: 'QA Sponsor Ltd',
        industry: 'Technology',
        website: 'https://example.com',
        contact_person: 'QA Tester',
        contact_phone: '+94770000000',
      }),
    });
  }
  return { token: data.access_token, user: data.user };
}

async function seedAuth(page: Page, session: UserSession) {
  await page.addInitScript(
    ({ token, user }) => {
      try {
        localStorage.setItem('access_token', token);
        localStorage.setItem('current_user', JSON.stringify(user));
      } catch {}
    },
    { token: session.token, user: session.user }
  );
}

const sessions: Partial<Record<Role, UserSession>> = {};

test.beforeAll(async () => {
  test.setTimeout(180_000);
  for (const role of ['student', 'teacher', 'sponsor'] as const) {
    try {
      sessions[role] = await register(role);
    } catch (e) {
      console.warn(`skip ${role} routes — register failed:`, (e as Error).message);
    }
  }
});

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('public + auth routes', async ({ page }) => {
      test.setTimeout(180_000);
      for (const route of PUBLIC_ROUTES) {
        const safe = route.replace(/^\//, '_root_').replace(/\//g, '__') || '_index';
        const outDir = path.resolve('e2e/screenshots/public', vp.name);
        fs.mkdirSync(outDir, { recursive: true });
        const out = path.join(outDir, `${safe}.png`);
        try {
          await page.goto(`${APP}${route}`, { waitUntil: 'networkidle', timeout: 30_000 });
        } catch {
          await page.goto(`${APP}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        }
        await page.waitForTimeout(800);
        await page.screenshot({ path: out, fullPage: true });
      }
    });

    for (const role of ['student', 'teacher', 'sponsor'] as const) {
      test(`${role} routes`, async ({ page }) => {
        test.setTimeout(300_000);
        const session = sessions[role];
        test.skip(!session, `no ${role} session (DB unreachable)`);
        await seedAuth(page, session!);
        for (const route of ROUTES[role]) {
          const safe = route.replace(/^\//, '').replace(/\//g, '__');
          const outDir = path.resolve(`e2e/screenshots/${role}`, vp.name);
          fs.mkdirSync(outDir, { recursive: true });
          const out = path.join(outDir, `${safe}.png`);
          try {
            await page.goto(`${APP}${route}`, { waitUntil: 'networkidle', timeout: 30_000 });
          } catch {
            try {
              await page.goto(`${APP}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            } catch {
              continue;
            }
          }
          await page.waitForTimeout(1200);
          try {
            await page.screenshot({ path: out, fullPage: true });
          } catch (e) {
            console.warn(`screenshot ${role}/${vp.name}/${route} failed:`, (e as Error).message);
          }
        }
      });
    }
  });
}
