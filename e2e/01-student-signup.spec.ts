import { test, expect } from '@playwright/test';
import { gotoAuth, openRegister, pickRole, fillRegistration, uniqueEmail } from './helpers';

test('student signup → dashboard', async ({ page }) => {
  await gotoAuth(page);
  await openRegister(page);
  await pickRole(page, 'student');

  const email = uniqueEmail('student');
  await fillRegistration(page, {
    email,
    password: 'TestPass123!',
    first: 'E2E',
    last: 'Student',
  });

  const noBtn = page.getByRole('button', { name: /^no$/i }).first();
  if (await noBtn.isVisible().catch(() => false)) {
    await noBtn.click();
  }

  await page
    .getByRole('button', { name: /create account|sign up|register/i })
    .first()
    .click();

  await expect(
    page.locator('text=/dashboard|verify your email|welcome/i').first(),
  ).toBeVisible({ timeout: 30_000 });
});
