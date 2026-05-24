import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders sign-in form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Admin Sign In/i })).toBeVisible();
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });

  test('shows error message on bad credentials', async ({ page }) => {
    await page.getByLabel(/Email/i).fill('bad@example.com');
    await page.getByLabel(/Password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page.getByText(/Invalid email or password/i)).toBeVisible({ timeout: 8000 });
  });

  test('requires email and password fields', async ({ page }) => {
    // HTML5 required validation prevents empty submit — button should stay enabled before submit
    const emailInput = page.getByLabel(/Email/i);
    const passwordInput = page.getByLabel(/Password/i);
    await expect(emailInput).toHaveAttribute('required');
    await expect(passwordInput).toHaveAttribute('required');
  });

  test('password field masks input', async ({ page }) => {
    await expect(page.getByLabel(/Password/i)).toHaveAttribute('type', 'password');
  });
});
