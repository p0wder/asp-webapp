import { test, expect } from '@playwright/test';

/**
 * TG-001-04 changed what this page is.
 *
 * It used to seed the amount from `?amount=` and offer a free-text cents
 * input, so the customer chose what to pay. Several tests below previously
 * asserted exactly that — they encoded the defect. They now assert the
 * replacement: the amount is fetched from the server, displayed read-only,
 * and cannot be influenced from the address bar.
 */

/** Stub the amount endpoint so the page can be exercised without Printavo. */
async function stubAmount(page, { amountCents = 41848, status = 200, body } = {}) {
  await page.route('**/api/create-payment-session**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(
        body ?? { invoiceId: 'test-123', visualId: '1042', amountCents, description: 'Order #1042' },
      ),
    });
  });
}

test.describe('Pay page – detailed', () => {
  test('shows the server-derived balance, not a figure from the URL', async ({ page }) => {
    await stubAmount(page, { amountCents: 5000 });
    // A tampered `amount` parameter is present and must be ignored entirely.
    await page.goto('/pay?invoiceId=test-123&amount=1');
    await expect(page.getByRole('button', { name: /Pay \$50\.00/i })).toBeVisible();
  });

  test('the amount is not editable', async ({ page }) => {
    await stubAmount(page);
    await page.goto('/pay?invoiceId=test-123');
    // The free-text cents input is gone: there is nothing on this page a
    // customer can change that alters what they are charged.
    await expect(page.locator('input[type="number"]')).toHaveCount(0);
  });

  test('button is enabled once the balance loads', async ({ page }) => {
    await stubAmount(page, { amountCents: 5000 });
    await page.goto('/pay?invoiceId=test-123');
    await expect(page.getByRole('button', { name: /Pay/i })).toBeEnabled();
  });

  test('button is disabled with no invoiceId', async ({ page }) => {
    await page.goto('/pay?amount=5000');
    await expect(page.getByRole('button', { name: /Pay/i })).toBeDisabled();
  });

  test('button stays disabled when the balance cannot be obtained', async ({ page }) => {
    // AC4: fail closed. No payable amount means no payment attempt.
    await stubAmount(page, { status: 502, body: { error: 'Could not verify invoice' } });
    await page.goto('/pay?invoiceId=test-123');
    await expect(page.getByRole('button', { name: /Pay/i })).toBeDisabled();
    await expect(page.getByText(/Could not verify invoice/i)).toBeVisible();
  });

  test('a zero-balance invoice is refused with its reason shown', async ({ page }) => {
    await stubAmount(page, {
      status: 409,
      body: { error: 'This invoice has no balance due.', code: 'ZERO_BALANCE' },
    });
    await page.goto('/pay?invoiceId=test-123');
    await expect(page.getByText(/no balance due/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Pay/i })).toBeDisabled();
  });

  test('shows invoice ID in the card when provided via param', async ({ page }) => {
    await stubAmount(page);
    await page.goto('/pay?invoiceId=INV-999');
    await expect(page.getByText('INV-999')).toBeVisible();
  });

  test('labels the figure as the current balance due', async ({ page }) => {
    await stubAmount(page);
    await page.goto('/pay?invoiceId=test-123');
    await expect(page.getByText(/Balance Due/i)).toBeVisible();
    await expect(page.getByText(/current balance on your invoice/i)).toBeVisible();
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
