import { test, expect } from '@playwright/test';

test.describe('Pay page – detailed', () => {
  test('button label says "Pay Now →" when no amount is pre-filled', async ({ page }) => {
    await page.goto('/pay?invoiceId=test-123');
    await expect(page.getByRole('button', { name: /Pay Now →/i })).toBeVisible();
  });

  test('button label shows amount when amount param is provided', async ({ page }) => {
    await page.goto('/pay?invoiceId=test-123&amount=5000');
    // $50.00
    await expect(page.getByRole('button', { name: /Pay \$50\.00/i })).toBeVisible();
  });

  test('button is enabled when both invoiceId and amount are present', async ({ page }) => {
    await page.goto('/pay?invoiceId=test-123&amount=5000');
    const btn = page.getByRole('button', { name: /Pay/i });
    await expect(btn).toBeEnabled();
  });

  test('button is disabled with no invoiceId', async ({ page }) => {
    await page.goto('/pay?amount=5000');
    const btn = page.getByRole('button', { name: /Pay/i });
    await expect(btn).toBeDisabled();
  });

  test('shows invoice ID in the card when provided via param', async ({ page }) => {
    await page.goto('/pay?invoiceId=INV-999&amount=10000');
    await expect(page.getByText('INV-999')).toBeVisible();
  });

  test('shows Stripe secure checkout disclaimer', async ({ page }) => {
    await page.goto('/pay');
    await expect(page.getByText(/Secure payment powered by Stripe/i)).toBeVisible();
  });

  test('has "Contact us" link', async ({ page }) => {
    await page.goto('/pay');
    const contactLink = page.getByRole('link', { name: /Contact us/i });
    await expect(contactLink).toBeVisible();
    await expect(contactLink).toHaveAttribute('href', '/contact');
  });

  test('manual amount input is shown when no amount param given', async ({ page }) => {
    await page.goto('/pay?invoiceId=test-123');
    const amountInput = page.locator('input[type="number"]');
    await expect(amountInput).toBeVisible();
  });

  test('entering an amount enables the Pay button', async ({ page }) => {
    await page.goto('/pay?invoiceId=test-123');
    const amountInput = page.locator('input[type="number"]');
    await amountInput.fill('5000');
    await expect(page.getByRole('button', { name: /Pay/i })).toBeEnabled();
  });
});

test.describe('Pay success page – detailed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pay/success');
  });

  test('shows checkmark emoji', async ({ page }) => {
    await expect(page.getByText('✅')).toBeVisible();
  });

  test('has "View My Orders" link', async ({ page }) => {
    const link = page.getByRole('link', { name: /View My Orders/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/my-orders');
  });

  test('has "Contact Us" link', async ({ page }) => {
    const link = page.getByRole('link', { name: /Contact Us/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/contact');
  });

  test('explains payment was processed', async ({ page }) => {
    await expect(page.getByText(/Your payment has been processed/i)).toBeVisible();
  });
});
