import { test, expect } from '@playwright/test';

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function completeStep1(page, { fname = 'Jane', email = 'jane@example.com' } = {}) {
  await page.locator('input[name="fname"]').fill(fname);
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.getByRole('heading', { name: /Your Order/i }).waitFor({ timeout: 5000 });
}

async function completeStep2(page, { qty = '24' } = {}) {
  await page.getByPlaceholder('e.g. 48').fill(qty);
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.getByRole('heading', { name: /Artwork/i }).waitFor({ timeout: 5000 });
}

async function completeStep3(page) {
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.getByRole('heading', { name: /Review/i }).waitFor({ timeout: 5000 });
}

// ─── Step indicators ─────────────────────────────────────────────────────────

test.describe('Quote form – step indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quote');
  });

  test('shows 4 step labels in the progress bar', async ({ page }) => {
    for (const label of ['Your Info', 'Your Order', 'Artwork', 'Review']) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });
});

// ─── Step 1: Your Info ───────────────────────────────────────────────────────

test.describe('Quote form – step 1 (Your Info)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quote');
  });

  test('shows all contact fields', async ({ page }) => {
    await expect(page.locator('input[name="fname"]')).toBeVisible();
    await expect(page.locator('input[name="lname"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="phone"]')).toBeVisible();
    await expect(page.locator('input[name="company"]')).toBeVisible();
  });

  test('shows due date and job name fields', async ({ page }) => {
    await expect(page.locator('input[name="dueDate"]')).toBeVisible();
    await expect(page.locator('input[name="jobName"]')).toBeVisible();
  });

  test('errors when first name is missing', async ({ page }) => {
    await page.locator('input[name="email"]').fill('test@example.com');
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByText(/First name is required/i)).toBeVisible({ timeout: 5000 });
  });

  test('errors when email is missing', async ({ page }) => {
    await page.locator('input[name="fname"]').fill('Jane');
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByText(/email/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('errors when email format is invalid', async ({ page }) => {
    await page.locator('input[name="fname"]').fill('Jane');
    await page.locator('input[name="email"]').fill('not-an-email');
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByText(/valid email/i)).toBeVisible({ timeout: 5000 });
  });

  test('advances to step 2 with valid name and email', async ({ page }) => {
    await page.locator('input[name="fname"]').fill('Jane');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByRole('heading', { name: /Your Order/i })).toBeVisible({ timeout: 5000 });
  });
});

// ─── Step 2: Your Order ───────────────────────────────────────────────────────

test.describe('Quote form – step 2 (Your Order)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quote');
    await completeStep1(page);
  });

  test('shows all 5 garment type chips', async ({ page }) => {
    for (const g of ['T-Shirt', 'Hoodie', 'Sweatshirt', 'Long Sleeve', 'Headwear']) {
      await expect(page.getByText(g)).toBeVisible();
    }
  });

  test('shows all 4 decoration method options', async ({ page }) => {
    for (const m of ['Screen Printing', 'Embroidery', 'DTF Transfer', 'Not Sure']) {
      await expect(page.getByText(m)).toBeVisible();
    }
  });

  test('shows Standard and Premium quality cards', async ({ page }) => {
    await expect(page.getByText('Standard')).toBeVisible();
    await expect(page.getByText('Premium')).toBeVisible();
  });

  test('T-Shirt quality shows Gildan and Next Level options', async ({ page }) => {
    await page.getByText('T-Shirt').click();
    await expect(page.getByText(/Gildan/i)).toBeVisible();
    await expect(page.getByText(/Next Level/i)).toBeVisible();
  });

  test('Hoodie quality shows Gildan and Ind. Trading options', async ({ page }) => {
    await page.getByText('Hoodie').click();
    await expect(page.getByText(/Gildan/i)).toBeVisible();
    await expect(page.getByText(/Ind\. Trading/i)).toBeVisible();
  });

  test('Headwear quality shows Valucap and Richardson options', async ({ page }) => {
    await page.getByText('Headwear').click();
    await expect(page.getByText(/Valucap/i)).toBeVisible();
    await expect(page.getByText(/Richardson/i)).toBeVisible();
  });

  test('shows color and quantity input fields', async ({ page }) => {
    await expect(page.getByPlaceholder('e.g. Black, Navy')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. 48')).toBeVisible();
  });

  test('shows ink color selector for Screen Printing', async ({ page }) => {
    await page.getByText('Screen Printing').click();
    await expect(page.getByText(/Ink colors/i)).toBeVisible();
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await expect(page.getByRole('button', { name: String(n) })).toBeVisible();
    }
  });

  test('shows ink color selector for DTF Transfer', async ({ page }) => {
    await page.getByText('DTF Transfer').click();
    await expect(page.getByText(/Ink colors/i)).toBeVisible();
  });

  test('shows thread color selector for Embroidery', async ({ page }) => {
    await page.getByText('Embroidery').click();
    await expect(page.getByText(/Thread colors/i)).toBeVisible();
  });

  test('hides color count selector for Not Sure', async ({ page }) => {
    await page.getByText('Not Sure').click();
    await expect(page.getByText(/Ink colors/i)).not.toBeVisible();
    await expect(page.getByText(/Thread colors/i)).not.toBeVisible();
  });

  test('shows quantity error when continuing with empty qty', async ({ page }) => {
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByText(/valid quantity/i)).toBeVisible({ timeout: 5000 });
  });

  test('shows quantity error when qty is zero', async ({ page }) => {
    await page.getByPlaceholder('e.g. 48').fill('0');
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByText(/valid quantity/i)).toBeVisible({ timeout: 5000 });
  });

  test('advances to step 3 (Artwork) with valid qty', async ({ page }) => {
    await page.getByPlaceholder('e.g. 48').fill('24');
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByRole('heading', { name: /Artwork/i })).toBeVisible({ timeout: 5000 });
  });

  test('back button returns to step 1', async ({ page }) => {
    await page.getByRole('button', { name: /Back/i }).click();
    await expect(page.getByRole('heading', { name: /Your Info/i })).toBeVisible({ timeout: 5000 });
  });

  test('step 1 data is preserved after going back and forward', async ({ page }) => {
    // Fill in step 1 with specific data, then go back and verify it's still there
    await page.getByRole('button', { name: /Back/i }).click();
    await expect(page.locator('input[name="fname"]')).toHaveValue('Jane');
    await expect(page.locator('input[name="email"]')).toHaveValue('jane@example.com');
  });
});

// ─── Step 3: Artwork ─────────────────────────────────────────────────────────

test.describe('Quote form – step 3 (Artwork)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quote');
    await completeStep1(page);
    await completeStep2(page);
  });

  test('shows artwork upload heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Artwork/i })).toBeVisible();
  });

  test('shows drag-and-drop upload area', async ({ page }) => {
    await expect(page.getByText(/Drag & drop/i)).toBeVisible();
  });

  test('shows accepted file type hint', async ({ page }) => {
    await expect(page.getByText(/PNG|PDF|AI|EPS|SVG/i)).toBeVisible();
  });

  test('can advance to step 4 without uploading artwork', async ({ page }) => {
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByRole('heading', { name: /Review/i })).toBeVisible({ timeout: 5000 });
  });

  test('back button returns to step 2 (Your Order)', async ({ page }) => {
    await page.getByRole('button', { name: /Back/i }).click();
    await expect(page.getByRole('heading', { name: /Your Order/i })).toBeVisible({ timeout: 5000 });
  });
});

// ─── Step 4: Review & Submit ─────────────────────────────────────────────────

test.describe('Quote form – step 4 (Review & Submit)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quote');
    await completeStep1(page, { fname: 'Jane', email: 'jane@example.com' });
    await page.getByText('T-Shirt').click();
    await page.getByPlaceholder('e.g. Black, Navy').fill('Black');
    await completeStep2(page, { qty: '48' });
    await completeStep3(page);
  });

  test('shows Review & Submit heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Review/i })).toBeVisible();
  });

  test('shows garment type in order summary', async ({ page }) => {
    await expect(page.getByText('T-Shirt')).toBeVisible();
  });

  test('shows decoration method in order summary', async ({ page }) => {
    await expect(page.getByText('Screen Printing')).toBeVisible();
  });

  test('shows quantity in order summary', async ({ page }) => {
    await expect(page.getByText(/48/)).toBeVisible();
  });

  test('shows color in order summary', async ({ page }) => {
    await expect(page.getByText(/Black/)).toBeVisible();
  });

  test('shows promo code input', async ({ page }) => {
    await expect(page.getByPlaceholder(/promo|SUMMER/i)).toBeVisible();
  });

  test('shows notes / special requests textarea', async ({ page }) => {
    await expect(page.getByPlaceholder(/Art details|special request/i)).toBeVisible();
  });

  test('shows mailing list checkbox', async ({ page }) => {
    await expect(page.locator('input[type="checkbox"]')).toBeVisible();
  });

  test('shows Submit button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Submit/i })).toBeVisible();
  });

  test('back button returns to step 3 (Artwork)', async ({ page }) => {
    await page.getByRole('button', { name: /Back/i }).click();
    await expect(page.getByRole('heading', { name: /Artwork/i })).toBeVisible({ timeout: 5000 });
  });

  test('shows uploaded artwork count in summary', async ({ page }) => {
    await expect(page.getByText(/0 uploaded/)).toBeVisible();
  });
});

// ─── Full happy-path flow ─────────────────────────────────────────────────────

test.describe('Quote form – full flow', () => {
  test('completes all 4 steps and reaches submit', async ({ page }) => {
    await page.goto('/quote');

    // Step 1
    await page.locator('input[name="fname"]').fill('Alex');
    await page.locator('input[name="lname"]').fill('Smith');
    await page.locator('input[name="email"]').fill('alex@example.com');
    await page.locator('input[name="phone"]').fill('704-555-0100');
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByRole('heading', { name: /Your Order/i }).waitFor({ timeout: 5000 });

    // Step 2
    await page.getByText('Hoodie').click();
    await page.getByText('Embroidery').click();
    await page.getByText('Premium').click();
    await page.getByPlaceholder('e.g. Black, Navy').fill('Forest Green');
    await page.getByPlaceholder('e.g. 48').fill('72');
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByRole('heading', { name: /Artwork/i }).waitFor({ timeout: 5000 });

    // Step 3 — skip artwork
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByRole('heading', { name: /Review/i }).waitFor({ timeout: 5000 });

    // Step 4 — verify summary and submit button visible
    await expect(page.getByText('Hoodie')).toBeVisible();
    await expect(page.getByText('Embroidery')).toBeVisible();
    await expect(page.getByText(/72/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Submit/i })).toBeVisible();
  });
});
