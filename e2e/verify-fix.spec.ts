/**
 * Focused screenshot pass on the pages that were broken in the user's
 * earlier reported screenshots: live-sessions, pre-recorded-lessons,
 * content-library, find-teachers, plus the redesigned student dashboard
 * for the alignment baseline. Desktop viewport only.
 */
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const API = 'http://localhost:8000';
const APP = 'http://localhost:3000';

const ROUTES = [
  '/students/dashboard',
  '/students/live-sessions',
  '/students/pre-recorded-lessons',
  '/students/content-library',
  '/students/network/find-teachers',
  '/students/scholarships',
  '/students/forum',
  '/students/chat',
  '/students/events',
  '/students/groups',
  '/students/peers',
  '/students/certificates',
  '/students/exams',
  '/students/downloads',
  '/students/progress-report',
  '/students/settings/accessibility',
];

test.describe('verify sidebar fix', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('student pages', async ({ page }) => {
    test.setTimeout(300_000);
    const email = `vfix-${Date.now()}@example.com`;
    const reg = await fetch(`${API}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Test1234!', first_name: 'VFix', last_name: 'QA', role: 'student' }),
    });
    if (!reg.ok) throw new Error(`reg: ${await reg.text()}`);
    const login = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Test1234!' }),
    });
    const data = await login.json();
    await page.addInitScript(
      ({ token, user }) => {
        localStorage.setItem('access_token', token);
        localStorage.setItem('current_user', JSON.stringify(user));
      },
      { token: data.access_token, user: data.user }
    );

    const out = path.resolve('e2e/verify');
    fs.mkdirSync(out, { recursive: true });
    for (const route of ROUTES) {
      const safe = route.replace(/^\//, '').replace(/\//g, '__') + '.png';
      try {
        await page.goto(`${APP}${route}`, { waitUntil: 'networkidle', timeout: 20_000 });
      } catch {
        try {
          await page.goto(`${APP}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        } catch {
          continue;
        }
      }
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, safe), fullPage: true });
    }
  });
});
