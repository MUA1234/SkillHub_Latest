import { test, expect } from '@playwright/test';
import { gotoAuth, openRegister, pickRole, fillRegistration, uniqueEmail } from './helpers';

test('teacher signup → dashboard', async ({ page }) => {
  await gotoAuth(page);
  await openRegister(page);
  await pickRole(page, 'teacher');

  const email = uniqueEmail('teacher');
  await fillRegistration(page, {
    email,
    password: 'TestPass123!',
    first: 'E2E',
    last: 'Teacher',
  });

  await page
    .getByRole('button', { name: /create account|sign up|register/i })
    .first()
    .click();

  await expect(
    page.locator('text=/teacher dashboard|verify your email|welcome/i').first(),
  ).toBeVisible({ timeout: 30_000 });
});
