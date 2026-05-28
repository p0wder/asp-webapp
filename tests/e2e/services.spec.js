import { test, expect } from '@playwright/test';

test.describe('Services page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/services');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Our Services/i })).toBeVisible();
  });

  test('shows all six service cards', async ({ page }) => {
    const services = [
      'Screen Printing',
      'Embroidery',
      'Bulk Orders',
      'Online Stores & Fundraisers',
      'DTF Printing',
      'Custom Design',
    ];
    for (const name of services) {
      await expect(page.getByRole('heading', { name })).toBeVisible();
    }
  });

  test('quote CTA is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Get Your Free Quote/i })).toBeVisible();
  });

  test('page title is correct', async ({ page }) => {
    await expect(page).toHaveTitle(/Services.*Thread Giant/i);
  });
});
