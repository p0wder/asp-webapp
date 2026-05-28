import { test, expect } from '@playwright/test';

test.describe('Contact page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Get In Touch/i })).toBeVisible();
  });

  test('shows phone contact card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Phone/i })).toBeVisible();
    await expect(page.getByText('712-389-8862')).toBeVisible();
  });

  test('shows email contact card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Email/i })).toBeVisible();
    await expect(page.getByText('aspmerch@gmail.com')).toBeVisible();
  });

  test('quote CTA links to /quote', async ({ page }) => {
    const cta = page.getByRole('link', { name: /Get Your Free Quote/i });
    await expect(cta).toHaveAttribute('href', '/quote');
  });

  test('shows business hours', async ({ page }) => {
    await expect(page.getByText(/Monday - Friday/i)).toBeVisible();
  });
});
