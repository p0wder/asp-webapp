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

  test('ignores an amount supplied in the URL (TG-001-04)', async ({ page }) => {
    // This previously asserted that `?amount=` set the displayed figure —
    // which was the defect: the customer chose what to pay. The amount now
    // comes from the invoice balance, so a URL-supplied figure must not
    // appear anywhere on the page.
    await page.goto('/pay?invoiceId=test-123&amount=25000');
    await expect(page.getByText('$250.00')).toHaveCount(0);
    await expect(page.getByText(/Balance Due/i)).toBeVisible();
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
