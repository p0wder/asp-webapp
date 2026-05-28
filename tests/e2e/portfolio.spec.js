import { test, expect } from '@playwright/test';

test.describe('Portfolio Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/portfolio');
  });

  test('renders "Our Work" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Our Work/i })).toBeVisible();
  });

  test('page title is correct', async ({ page }) => {
    await expect(page).toHaveTitle('Portfolio - Thread Giant');
  });

  test('at least one image is visible in the grid', async ({ page }) => {
    await expect(page.locator('img').first()).toBeVisible();
  });
});
