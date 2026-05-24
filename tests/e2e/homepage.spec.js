import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders hero heading and CTA', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Custom Apparel/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Get Your Free Quote/i })).toBeVisible();
  });

  test('CTA links to /quote', async ({ page }) => {
    const cta = page.getByRole('link', { name: /Get Your Free Quote/i }).first();
    await expect(cta).toHaveAttribute('href', '/quote');
  });

  test('shows service cards (Screen Printing, Embroidery, etc.)', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Screen Printing' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Embroidery' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'DTF Transfer' })).toBeVisible();
  });

  test('shows "Why Customers Choose Thread Giant" section', async ({ page }) => {
    await expect(page.getByText(/Why Customers Choose/i)).toBeVisible();
  });

  test('page title contains Thread Giant', async ({ page }) => {
    await expect(page).toHaveTitle(/Thread Giant/i);
  });
});
