import { test, expect } from '@playwright/test';
import { gotoAuth, openRegister, pickRole, fillRegistration, uniqueEmail } from './helpers';

test('sponsor signup → dashboard', async ({ page }) => {
  await gotoAuth(page);
  await openRegister(page);
  await pickRole(page, 'sponsor');

  const email = uniqueEmail('sponsor');
  await fillRegistration(page, {
    email,
    password: 'TestPass123!',
    first: 'E2E',
    last: 'Sponsor',
  });

  await page.getByLabel(/company name/i).fill('E2E Corp');
  const industry = page.getByLabel(/industry/i);
  if (await industry.isVisible().catch(() => false)) {
    await industry.fill('Technology');
  }
  const contactPerson = page.getByLabel(/contact person/i);
  if (await contactPerson.isVisible().catch(() => false)) {
    await contactPerson.fill('E2E Sponsor');
  }

  await page
    .getByRole('button', { name: /create account|sign up|register/i })
    .first()
    .click();

  await expect(
    page.locator('text=/sponsor dashboard|verify your email|welcome/i').first(),
  ).toBeVisible({ timeout: 30_000 });
});
