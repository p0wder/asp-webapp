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

  test('shows three feature cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Quality Printing' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fast Turnaround' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Custom Designs' })).toBeVisible();
  });

  test('page title is correct', async ({ page }) => {
    await expect(page).toHaveTitle(/Thread Giant/i);
  });
});
