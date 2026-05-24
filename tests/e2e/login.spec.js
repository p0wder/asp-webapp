import { test, expect } from '@playwright/test';

// Login uses Clerk's <SignIn> component — no custom email/password form.

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders Thread Giant logo', async ({ page }) => {
    await expect(page.getByAltText('Thread Giant')).toBeVisible();
  });

  test('renders Clerk sign-in widget with email input', async ({ page }) => {
    await expect(
      page.locator('input[type="email"], input[name="identifier"], input[autocomplete*="email"]').first()
    ).toBeVisible({ timeout: 10000 });
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
