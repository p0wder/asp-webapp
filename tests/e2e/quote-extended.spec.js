import { test, expect } from '@playwright/test';

test.describe('Quote form – multi-step flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quote');
  });

  test('shows step progress indicators (1–4)', async ({ page }) => {
    // Step indicators are <span> elements; use first() to avoid strict-mode
    // violations when the current step label also appears as an h2.
    for (const label of ['Your Info', 'Garment', 'Decoration', 'Review']) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test('step 1 shows last name field', async ({ page }) => {
    await expect(page.locator('input[name="lname"]')).toBeVisible();
  });

  test('step 1 shows company field', async ({ page }) => {
    await expect(page.locator('input[name="company"]')).toBeVisible();
  });

  test('shows required-field error for missing email', async ({ page }) => {
    await page.locator('input[name="fname"]').fill('Test');
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByText(/email/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('advances to step 2 after completing step 1', async ({ page }) => {
    await page.locator('input[name="fname"]').fill('Jane');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByRole('heading', { name: /^Garment$/i })).toBeVisible({ timeout: 5000 });
  });

  test('step 2 shows all garment type options', async ({ page }) => {
    await page.locator('input[name="fname"]').fill('Jane');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.getByRole('button', { name: /Continue/i }).click();

    for (const garment of ['T-Shirt', 'Hoodie', 'Sweatshirt', 'Long Sleeve', 'Headwear']) {
      await expect(page.getByText(garment)).toBeVisible({ timeout: 5000 });
    }
  });

  test('step 2 shows quantity (qty) input', async ({ page }) => {
    await page.locator('input[name="fname"]').fill('Jane');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.getByRole('button', { name: /Continue/i }).click();

    // The quantity field is registered as "qty" in react-hook-form
    await expect(page.locator('input[name="qty"]')).toBeVisible({ timeout: 5000 });
  });

  test('step 2 shows garment quality options (Standard, Premium)', async ({ page }) => {
    await page.locator('input[name="fname"]').fill('Jane');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.getByRole('button', { name: /Continue/i }).click();

    await expect(page.getByText('Standard')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Premium')).toBeVisible();
  });

  test('can navigate back from step 2 to step 1', async ({ page }) => {
    await page.locator('input[name="fname"]').fill('Jane');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByRole('heading', { name: /^Garment$/i }).waitFor({ timeout: 5000 });

    await page.getByRole('button', { name: /Back/i }).click();
    await expect(page.getByRole('heading', { name: /Your Info/i })).toBeVisible({ timeout: 5000 });
  });

  test('advances to step 3 (Decoration) after completing step 2', async ({ page }) => {
    // Step 1
    await page.locator('input[name="fname"]').fill('Jane');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByRole('heading', { name: /^Garment$/i }).waitFor({ timeout: 5000 });

    // Step 2
    await page.getByText('T-Shirt').click();
    await page.locator('input[name="qty"]').fill('24');
    await page.getByRole('button', { name: /Continue/i }).click();

    await expect(page.getByRole('heading', { name: /Decoration/i })).toBeVisible({ timeout: 5000 });
  });

  test('step 3 shows decoration method options', async ({ page }) => {
    // Step 1
    await page.locator('input[name="fname"]').fill('Jane');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByRole('heading', { name: /^Garment$/i }).waitFor({ timeout: 5000 });

    // Step 2
    await page.getByText('T-Shirt').click();
    await page.locator('input[name="qty"]').fill('24');
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByRole('heading', { name: /Decoration/i }).waitFor({ timeout: 5000 });

    for (const method of ['Screen Printing', 'Embroidery', 'DTF Transfer', 'Not Sure']) {
      await expect(page.getByText(method)).toBeVisible();
    }
  });
});
