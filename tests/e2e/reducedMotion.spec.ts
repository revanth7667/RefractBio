import { test, expect } from '@playwright/test';
import { loadFixture } from './helpers';

test.describe('prefers-reduced-motion (§17.7)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';

  test('Test connection pending spinner respects prefers-reduced-motion', async ({ page }) => {
    // Setup hanging route for /v1/models so "Testing…" stays active
    await page.route('https://api.anthropic.com/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      }
      if (req.url().includes('/v1/models')) {
        // Hang request
        return;
      }
      return route.fulfill({ status: 200, body: '{}' });
    });

    await page.goto('/');

    // 1. Without reduced motion: spinner animates
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Settings' }).click();
    const keyInput = page.getByPlaceholder('Enter your Anthropic API key');
    await keyInput.fill(fakeKey);
    const testBtn = page.getByRole('button', { name: 'Test connection' }).first();
    await testBtn.click();

    await expect(page.getByRole('button', { name: /Testing…/i })).toBeVisible();
    const spinner = page.locator('button:has-text("Testing…") .animate-spin');
    await expect(spinner).toBeVisible();

    const normalAnimation = await spinner.evaluate((el) => window.getComputedStyle(el).animationName);
    expect(normalAnimation).not.toBe('none');

    // 2. With reduced motion: spinner animation is 'none' while visible text "Testing…" is still present
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedAnimation = await spinner.evaluate((el) => window.getComputedStyle(el).animationName);
    expect(reducedAnimation).toBe('none');
    await expect(page.getByRole('button', { name: /Testing…/i })).toBeVisible();
  });

  test('Generating tab spinner respects prefers-reduced-motion', async ({ page }) => {
    const editedMasterInfo = loadFixture('master/edited.md');

    // Route for models responds, but /v1/messages hangs
    await page.route('https://api.anthropic.com/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      }
      if (req.url().includes('/v1/models')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            data: [{ id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet' }],
          }),
        });
      }
      if (req.url().includes('/v1/messages')) {
        // Hang request so generating spinner stays active
        return;
      }
      return route.fulfill({ status: 200, body: '{}' });
    });

    await page.goto('/');

    // Setup valid key, test connection to load models, and master info
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByPlaceholder('Enter your Anthropic API key').fill(fakeKey);
    const testBtn = page.getByRole('button', { name: 'Test connection' }).first();
    await testBtn.click();
    await expect(page.getByText(/connected/i)).toBeVisible();

    await page.getByRole('tab', { name: 'Master Info' }).click();
    await page.getByRole('textbox', { name: 'Master Info' }).fill(editedMasterInfo);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Close' }).click();

    // Fill job context
    await page.getByLabel('Job context').fill('Senior software engineer position');

    // 1. Without reduced motion: spinner animates
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: /^Send$/ }).click();

    const generatingSpinner = page.locator('.animate-spin[aria-label="Generating"]').first();
    await expect(generatingSpinner).toBeVisible();

    const normalAnimation = await generatingSpinner.evaluate((el) => window.getComputedStyle(el).animationName);
    expect(normalAnimation).not.toBe('none');

    // 2. With reduced motion: spinner animation is 'none' while "Generating" indicator is still present
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedAnimation = await generatingSpinner.evaluate((el) => window.getComputedStyle(el).animationName);
    expect(reducedAnimation).toBe('none');
    await expect(generatingSpinner).toBeVisible();
    await expect(page.getByRole('tab', { name: /Generating/i }).first()).toBeVisible();
  });
});

