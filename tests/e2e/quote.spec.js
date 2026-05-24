import { test, expect } from '@playwright/test';

test.describe('Quote form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quote');
  });

  test('renders step 1 (Your Info) on load', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Your Info/i })).toBeVisible();
  });

  test('step 1 has first name, email, and phone fields', async ({ page }) => {
    await expect(page.locator('input[name="fname"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="phone"]')).toBeVisible();
  });

  test('advances to step 2 (Garment) after filling required fields', async ({ page }) => {
    await page.locator('input[name="fname"]').fill('Test');
    await page.locator('input[name="email"]').fill('test@example.com');
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByRole('heading', { name: /^Garment$/i })).toBeVisible({ timeout: 5000 });
  });

  test('shows required-field errors if step 1 submitted empty', async ({ page }) => {
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByText(/First name is required/i)).toBeVisible({ timeout: 5000 });
  });

  test('shows garment type options on step 2', async ({ page }) => {
    await page.locator('input[name="fname"]').fill('Test');
    await page.locator('input[name="email"]').fill('test@example.com');
    await page.getByRole('button', { name: /Continue/i }).click();

    await expect(page.getByText('T-Shirt')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Hoodie')).toBeVisible();
  });
});
