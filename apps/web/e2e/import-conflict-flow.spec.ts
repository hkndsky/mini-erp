import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { signIn, WAREHOUSE_EMAIL, SEED_PASSWORD } from './helpers';

// Uses apps/api's canonical fixture so the e2e numbers always match the
// integration suite. The e2e global-setup (playwright.config.ts) resets +
// re-seeds the database before the suite, so these exact counts hold on every
// run. If the banner below is wrong, the global-setup reset did not reach the
// database the API uses (check it is up and that E2E_DATABASE_URL is set).
const CSV_PATH = resolve(__dirname, '../../api/test/fixtures/sample-import.csv');
const FRESH_SEED_HINT =
  'Expected a freshly seeded database. The e2e global-setup should reset it — check the API is running and its database is reachable/writable.';

test.describe('import → conflict → resolve → order flow', () => {
  test('full flow on a freshly seeded database', async ({ page }) => {
    await signIn(page, WAREHOUSE_EMAIL, SEED_PASSWORD);

    // 1) CSV import applies fresh rows and flags the divergent quantities.
    await page.goto('/imports');
    await page.getByTestId('csv-file-input').setInputFiles({
      name: 'sample-import.csv',
      mimeType: 'text/csv',
      buffer: readFileSync(CSV_PATH),
    });
    await expect(page.getByTestId('import-result'), FRESH_SEED_HINT).toContainText('3 applied, 2 conflicts');

    // 2) Resolve the SKU-001 quantity conflict by applying the incoming value.
    await page.goto('/conflicts');
    const conflictRow = page.locator('tr', { hasText: 'SKU-001' });
    await conflictRow.getByRole('button', { name: 'Resolve' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('quantityOnHand');
    await page.getByTestId('resolve-submit').click();
    await expect(dialog).toBeHidden();

    // 3) Stock reflects the applied incoming quantity (On hand is column 3).
    await page.goto('/stock');
    const stockRow = page.locator('tr', { hasText: 'SKU-001' });
    await expect(stockRow.locator('td').nth(2)).toHaveText('130');

    // 4) Place a new order against the reconciled SKU.
    await page.goto('/orders');
    await page.getByRole('button', { name: 'New order' }).click();
    const orderDialog = page.getByRole('dialog');
    await expect(orderDialog).toBeVisible();
    await orderDialog.getByLabel('Customer').fill('Acme Retail');
    await orderDialog.getByLabel('SKU for line 1').fill('SKU-001');
    await orderDialog.getByLabel('Quantity for line 1').fill('5');
    await orderDialog.getByRole('button', { name: 'Create order' }).click();
    await expect(page.getByTestId('orders-grid').getByText('Acme Retail')).toBeVisible();
  });
});
