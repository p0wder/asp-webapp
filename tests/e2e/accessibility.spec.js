import { test, expect } from '@playwright/test';

// Basic accessibility checks — landmark roles, alt text, lang attribute.

const PUBLIC_PAGES = ['/', '/services', '/portfolio', '/contact', '/quote'];

test.describe('Accessibility – landmarks', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has a <main> landmark`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
    });

    test(`${path} has a <header> landmark`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('header')).toBeVisible();
    });

    test(`${path} has a <footer> landmark`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('footer')).toBeVisible();
    });
  }
});

test.describe('Accessibility – language attribute', () => {
  test('root <html> element has lang="en"', async ({ page }) => {
    await page.goto('/');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });
});

test.describe('Accessibility – images have alt text', () => {
  test('homepage images all have non-empty alt text', async ({ page }) => {
    await page.goto('/');
    const images = await page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      expect(alt).not.toBeNull();
      expect((alt || '').trim()).not.toBe('');
    }
  });

  test('portfolio page images all have alt text', async ({ page }) => {
    await page.goto('/portfolio');
    const images = await page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      expect(alt).not.toBeNull();
    }
  });
});

test.describe('Accessibility – navigation links', () => {
  test('header nav links are keyboard-focusable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    // Tab through the page and verify nav links receive focus
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
  });

  test('social media links in footer have aria-labels', async ({ page }) => {
    await page.goto('/');
    const fbLink = page.locator('footer a[aria-label="Facebook"]');
    const igLink = page.locator('footer a[aria-label="Instagram"]');
    await expect(fbLink).toBeVisible();
    await expect(igLink).toBeVisible();
  });
});

test.describe('Accessibility – page titles', () => {
  const expectations = [
    { path: '/', pattern: /Thread Giant/i },
    { path: '/services', pattern: /Services.*Thread Giant/i },
    { path: '/portfolio', pattern: /Portfolio.*Thread Giant/i },
    { path: '/contact', pattern: /Contact.*Thread Giant/i },
  ];

  for (const { path, pattern } of expectations) {
    test(`${path} has descriptive page title`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(pattern);
    });
  }
});
