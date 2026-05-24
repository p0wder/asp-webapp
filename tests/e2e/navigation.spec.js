import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // Opens the mobile hamburger menu if it is visible (i.e. on small viewports).
  async function openMobileMenuIfNeeded(page) {
    const hamburger = page.getByRole('button', { name: /toggle menu/i });
    if (await hamburger.isVisible()) {
      await hamburger.click();
    }
  }

  test('header is visible on all public pages', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible();

    for (const path of ['/services', '/portfolio', '/contact', '/quote']) {
      await page.goto(path);
      await expect(page.locator('header')).toBeVisible();
    }
  });

  test('footer is visible on all public pages', async ({ page }) => {
    await expect(page.locator('footer')).toBeVisible();
  });

  test('navigates to services via header link', async ({ page }) => {
    await openMobileMenuIfNeeded(page);
    await page.getByRole('link', { name: /Services/i }).first().click();
    await expect(page).toHaveURL('/services');
  });

  test('navigates to contact via header link', async ({ page }) => {
    await openMobileMenuIfNeeded(page);
    await page.getByRole('link', { name: /Contact/i }).first().click();
    await expect(page).toHaveURL('/contact');
  });

  test('logo/home link returns to homepage', async ({ page }) => {
    await page.goto('/services');
    await page.getByRole('link', { name: /Thread Giant/i }).first().click();
    await expect(page).toHaveURL('/');
  });
});
