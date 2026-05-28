import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('header is visible on all public pages', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible();
    for (const path of ['/services', '/portfolio', '/contact', '/quote']) {
      await page.goto(path);
      await expect(page.locator('header')).toBeVisible();
    }
  });

  test('footer is visible on homepage', async ({ page }) => {
    await expect(page.locator('footer')).toBeVisible();
  });

  test('desktop nav shows Services, Portfolio, Contact, Get a Quote', async ({ page }) => {
    // Use a viewport that shows the desktop nav
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Services' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Portfolio' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Contact' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Get a Quote/i }).first()).toBeVisible();
  });

  test('desktop nav shows Sign In when logged out', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible();
  });

  test('desktop nav does not show Purchasing or Pipeline when logged out', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Purchasing' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Pipeline' })).not.toBeVisible();
  });

  test('mobile: hamburger button toggles menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const hamburger = page.getByRole('button', { name: /toggle menu/i });
    await expect(hamburger).toBeVisible();
    await hamburger.click();
    await expect(page.getByRole('link', { name: 'Services' }).first()).toBeVisible();
  });

  test('Services link navigates to /services', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByRole('link', { name: 'Services' }).first().click();
    await expect(page).toHaveURL('/services');
  });

  test('Contact link navigates to /contact', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByRole('link', { name: 'Contact' }).first().click();
    await expect(page).toHaveURL('/contact');
  });

  test('logo links back to homepage', async ({ page }) => {
    await page.goto('/services');
    await page.getByRole('link', { name: /Thread Giant/i }).first().click();
    await expect(page).toHaveURL('/');
  });
});
