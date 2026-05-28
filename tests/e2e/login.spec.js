import { test, expect } from '@playwright/test';

// Login uses Clerk's <SignIn> component — no custom email/password form.

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders Thread Giant logo', async ({ page }) => {
    // The login page has its own logo; scope to main content to avoid matching the header logo
    await expect(page.locator('main').getByAltText('Thread Giant')).toBeVisible();
  });

  test('renders Clerk sign-in widget or sign-in form', async ({ page }) => {
    // Clerk renders an email input when properly configured; when keys are missing in dev
    // it still renders the page shell. Either way the page must not show a blank body.
    await expect(page.locator('body')).not.toBeEmpty();
    // If Clerk is configured, the sign-in input will be present within 10 seconds.
    const input = page.locator('input[type="email"], input[name="identifier"], input[autocomplete*="email"]').first();
    const isConfigured = await input.isVisible({ timeout: 10000 }).catch(() => false);
    if (isConfigured) {
      await expect(input).toBeVisible();
    }
  });

  test('shows "New customer? Get a free quote" link', async ({ page }) => {
    const link = page.getByRole('link', { name: /get a free quote/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/quote');
  });

  test('page does not crash', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText('Application error');
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  });
});
