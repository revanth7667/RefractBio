import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupAnthropicRoutes, loadFixture } from './helpers';

const fakeKey = 'sk-' + 'test-fake-0000';

async function checkA11y(page: Page, contextName: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const criticalOrSerious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  if (criticalOrSerious.length > 0) {
    const summary = criticalOrSerious.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({
        html: n.html,
        target: n.target,
        failureSummary: n.failureSummary,
        any: n.any?.map((a) => ({ id: a.id, message: a.message, data: a.data })),
      })),
    }));
    // Fail test with clear details
    expect(summary, `Axe violations found in ${contextName}`).toEqual([]);
  }
  expect(criticalOrSerious).toEqual([]);
}

test.describe('Accessibility check with axe-core (§17.7)', () => {
  const themes: ('light' | 'dark')[] = ['light', 'dark'];

  for (const theme of themes) {
    test.describe(`${theme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
      });

      test(`main screen empty state in ${theme} mode`, async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText(/Your drafts will appear here/i)).toBeVisible();
        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/dark/);
        }
        await page.waitForTimeout(200);
        await checkA11y(page, `main screen empty state (${theme})`);
      });

      test(`Settings sheet in ${theme} mode`, async ({ page }) => {
        await page.goto('/');
        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/dark/);
        }
        await page.getByRole('button', { name: 'Settings' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.waitForTimeout(200);
        await checkA11y(page, `Settings sheet (${theme})`);
      });

      test(`Help page in ${theme} mode`, async ({ page }) => {
        await page.goto('/#/help');
        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/dark/);
        }
        await expect(page.locator('.help-content')).toBeVisible();
        await page.waitForTimeout(200);
        await checkA11y(page, `Help page (${theme})`);
      });

      test(`main screen with drafts in ${theme} mode`, async ({ page }) => {
        const resumeFixture = loadFixture('outputs/resume.txt');
        const coverLetterFixture = loadFixture('outputs/cover-letter.txt');
        const editedMasterInfo = loadFixture('master/edited.md');

        await setupAnthropicRoutes(page, resumeFixture, coverLetterFixture);

        await page.goto('/');
        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/dark/);
        }

        // Enter key in settings
        await page.getByRole('button', { name: 'Settings' }).click();
        const keyInput = page.getByPlaceholder('Enter your Anthropic API key');
        await keyInput.fill(fakeKey);

        const testBtn = page.getByRole('button', { name: 'Test connection' }).first();
        await testBtn.click();
        await expect(page.getByText(/connected/i)).toBeVisible();

        // Master Info
        await page.getByRole('tab', { name: 'Master Info' }).click();
        const masterEditor = page.getByRole('textbox', { name: 'Master Info' });
        await masterEditor.fill(editedMasterInfo);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByRole('button', { name: 'Close' }).click();

        // Enter job context and send
        const jobContext = page.getByLabel('Job context');
        await jobContext.fill('Senior Data Analyst job description');
        const sendBtn = page.getByRole('button', { name: /^send$/i });
        await sendBtn.click();

        // Wait for drafts to appear
        await expect(page.getByRole('tab', { name: /resume/i })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: /^copy$/i }).first()).toBeVisible();
        await page.waitForTimeout(200);

        await checkA11y(page, `main screen with drafts (${theme})`);
      });
    });
  }
});
