import { test, expect } from '@playwright/test';
import { signIn, WAREHOUSE_EMAIL, SEED_PASSWORD } from './helpers';

test.describe('auth', () => {
  test('signs in with valid seed credentials', async ({ page }) => {
    await signIn(page, WAREHOUSE_EMAIL, SEED_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('shows an error for a wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(WAREHOUSE_EMAIL);
    await page.getByLabel('Password').fill('definitely-wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/products');
    await page.waitForURL('**/login');
    await expect(page.getByRole('heading', { name: 'Mini ERP' })).toBeVisible();
  });
});
