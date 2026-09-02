import type { Page } from '@playwright/test';

export const WAREHOUSE_EMAIL = 'warehouse@erp.local';
export const SEED_PASSWORD = 'Password123!';

export async function signIn(page: Page, email: string = WAREHOUSE_EMAIL, password: string = SEED_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}
