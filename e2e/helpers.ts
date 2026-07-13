import { Page, expect } from '@playwright/test';

/**
 * Returns a fresh email that won't collide with prior runs. The Supabase
 * unique-on-email constraint means a re-run would otherwise 409 on the
 * second pass.
 */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@e2e.skillhub.lk`;
}

export async function gotoAuth(page: Page) {
  await page.goto('/auth');
  await expect(page).toHaveURL(/\/auth/);
}

/**
 * Open the registration step. The auth page lands on `login` — we click
 * "Sign up" to switch.
 */
export async function openRegister(page: Page) {
  const cta = page
    .getByRole('button', { name: /sign up|create account|register/i })
    .or(page.getByRole('link', { name: /sign up|create account|register/i }))
    .first();
  await cta.click();
}

export async function pickRole(page: Page, role: 'student' | 'teacher' | 'sponsor') {
  const tile = page
    .getByRole('button', { name: new RegExp(role, 'i') })
    .or(page.locator(`text=/${role}/i`))
    .first();
  await tile.click();
}

export async function fillRegistration(
  page: Page,
  opts: { email: string; password: string; first: string; last: string },
) {
  await page.getByLabel(/first name/i).fill(opts.first);
  await page.getByLabel(/last name/i).fill(opts.last);
  await page.getByLabel(/email/i).fill(opts.email);
  await page.getByLabel(/password/i).first().fill(opts.password);
}
