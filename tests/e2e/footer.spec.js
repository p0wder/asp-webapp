import { test, expect } from '@playwright/test';

test.describe('Footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows copyright text', async ({ page }) => {
    await expect(page.locator('footer')).toContainText('Thread Giant');
    await expect(page.locator('footer')).toContainText('All rights reserved');
  });

  test('has Facebook social link', async ({ page }) => {
    const fbLink = page.locator('footer').getByRole('link', { name: /facebook/i });
    await expect(fbLink).toBeVisible();
    await expect(fbLink).toHaveAttribute('target', '_blank');
    await expect(fbLink).toHaveAttribute('rel', /noopener/);
  });

  test('has Instagram social link', async ({ page }) => {
    const igLink = page.locator('footer').getByRole('link', { name: /instagram/i });
    await expect(igLink).toBeVisible();
    await expect(igLink).toHaveAttribute('target', '_blank');
    await expect(igLink).toHaveAttribute('rel', /noopener/);
  });

  test('footer is present on all public pages', async ({ page }) => {
    for (const path of ['/services', '/portfolio', '/contact', '/quote', '/pay', '/pay/success']) {
      await page.goto(path);
      await expect(page.locator('footer')).toBeVisible();
    }
  });
});
