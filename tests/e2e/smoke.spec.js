import { test, expect } from '@playwright/test';

// Smoke tests for pages not covered by dedicated spec files.

test.describe('Pay page', () => {
  test('renders heading and disabled Pay button when no invoice', async ({ page }) => {
    await page.goto('/pay');
    await expect(page.getByRole('heading', { name: /pay your invoice/i })).toBeVisible();
    const btn = page.getByRole('button', { name: /pay/i });
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });

  test('shows amount when amount param is provided', async ({ page }) => {
    await page.goto('/pay?invoiceId=test-123&amount=25000');
    await expect(page.getByText('$250.00')).toBeVisible();
  });

  test('pay success page renders confirmation', async ({ page }) => {
    await page.goto('/pay/success');
    await expect(page.getByRole('heading', { name: /payment received/i })).toBeVisible();
  });
});

test.describe('Order status page', () => {
  test('shows error state with no params (no crash)', async ({ page }) => {
    await page.goto('/order-status');
    await expect(page.locator('body')).not.toContainText('Application error');
    // Should show a friendly message, not a blank page
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('shows error state with invalid token', async ({ page }) => {
    await page.goto('/order-status?id=fake-id&token=invalidtoken');
    await expect(page.locator('body')).not.toContainText('Application error');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Proof review page', () => {
  test('shows error state with missing params (no crash)', async ({ page }) => {
    await page.goto('/proof');
    await expect(page.locator('body')).not.toContainText('Application error');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('shows error state with invalid token', async ({ page }) => {
    await page.goto('/proof?id=fake-id&token=invalidtoken');
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});
