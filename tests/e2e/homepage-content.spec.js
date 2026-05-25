import { test, expect } from '@playwright/test';

test.describe('Homepage content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows key stats (orders, years, turnaround, rating)', async ({ page }) => {
    await expect(page.getByText('1000+')).toBeVisible();
    await expect(page.getByText('Orders Completed')).toBeVisible();
    await expect(page.getByText('10+')).toBeVisible();
    await expect(page.getByText('Years in Business')).toBeVisible();
    await expect(page.getByText('5-Star')).toBeVisible();
  });

  test('shows at least one testimonial', async ({ page }) => {
    // Each testimonial card has 5 stars
    await expect(page.getByText('★★★★★').first()).toBeVisible();
  });

  test('testimonial names are visible', async ({ page }) => {
    await expect(page.getByText('Scottie G')).toBeVisible();
  });

  test('shows "Our Work" portfolio preview section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Our Work' })).toBeVisible();
  });

  test('"View all" link in portfolio preview points to /portfolio', async ({ page }) => {
    const viewAll = page.getByRole('link', { name: /View all/i }).first();
    await expect(viewAll).toBeVisible();
    await expect(viewAll).toHaveAttribute('href', '/portfolio');
  });

  test('portfolio preview has images', async ({ page }) => {
    // The preview grid contains Next.js Image elements
    const images = page.locator('a[href="/portfolio"] img');
    await expect(images.first()).toBeVisible();
  });

  test('shows quick specs bar with minimum order info', async ({ page }) => {
    await expect(page.getByText(/12-piece minimum/i)).toBeVisible();
    await expect(page.getByText(/No minimum.*DTF/i)).toBeVisible();
  });

  test('shows bottom CTA section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Ready to get started/i })).toBeVisible();
  });

  test('bottom CTA link points to /quote', async ({ page }) => {
    const links = page.getByRole('link', { name: /Get Your Free Quote/i });
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(1);
    // Both hero and bottom CTAs must link to /quote
    for (let i = 0; i < count; i++) {
      await expect(links.nth(i)).toHaveAttribute('href', '/quote');
    }
  });

  test('service highlight cards visible (Screen Printing, Embroidery, DTF Transfer, Bulk Orders)', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Screen Printing' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Embroidery' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'DTF Transfer' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bulk Orders' })).toBeVisible();
  });
});
