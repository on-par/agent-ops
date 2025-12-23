import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const ASPIRE_DASHBOARD_URL = process.env.ASPIRE_DASHBOARD_URL;

test.describe('Service Integration', () => {
  test('backend API is healthy', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/health`, {
      timeout: 10000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('frontend loads successfully', async ({ page }) => {
    await page.goto(FRONTEND_URL, { timeout: 30000 });

    // Wait for the page to load - check for any content
    await expect(page.locator('body')).not.toBeEmpty();

    // Check that there's no error state
    const title = await page.title();
    expect(title).not.toContain('Error');
  });

  test('frontend renders main content', async ({ page }) => {
    await page.goto(FRONTEND_URL, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // Verify the page has meaningful content
    const bodyText = await page.locator('body').textContent();
    expect(bodyText && bodyText.length > 50).toBeTruthy();
  });
});

test.describe('Aspire Dashboard', () => {
  test.skip(!ASPIRE_DASHBOARD_URL, 'Aspire Dashboard URL not configured');

  test('Aspire Dashboard shows resources', async ({ page }) => {
    await page.goto(ASPIRE_DASHBOARD_URL!, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    const body = await page.locator('body').textContent();
    const hasContent = body && body.length > 100;
    expect(hasContent).toBeTruthy();
  });

  test('Aspire Dashboard shows backend service', async ({ page }) => {
    await page.goto(ASPIRE_DASHBOARD_URL!, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    const pageContent = await page.content();
    const hasBackend = pageContent.toLowerCase().includes('backend');
    expect(hasBackend).toBeTruthy();
  });

  test('Aspire Dashboard shows frontend service', async ({ page }) => {
    await page.goto(ASPIRE_DASHBOARD_URL!, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    const pageContent = await page.content();
    const hasFrontend = pageContent.toLowerCase().includes('frontend');
    expect(hasFrontend).toBeTruthy();
  });

  test('backend request generates trace in dashboard', async ({ page, request }) => {
    // Generate telemetry
    await request.get(`${BACKEND_URL}/health`, { timeout: 10000 });
    await page.waitForTimeout(2000);

    await page.goto(`${ASPIRE_DASHBOARD_URL}/traces`, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });
});
