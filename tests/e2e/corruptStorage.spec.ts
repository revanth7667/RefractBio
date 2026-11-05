import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { getPrefixedKey } from '../../src/storage/keys';

async function checkA11y(page: Page, contextName: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const criticalOrSerious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
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
      })),
    }));
    expect(summary, `Axe violations found in ${contextName}`).toEqual([]);
  }
  expect(criticalOrSerious).toEqual([]);
}

test.describe('Corrupt storage notices and accessibility (§9.2, §17.7)', () => {
  test('Settings sheet with corrupt settings notice has no axe violations', async ({ page }) => {
    // Seed corrupt settings envelope via addInitScript before navigation
    const settingsKey = getPrefixedKey('settings');
    await page.addInitScript((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({ schemaVersion: 999, data: 'invalid-version' })
      );
    }, settingsKey);

    await page.goto('/');
    await expect(page.getByText(/Your drafts will appear here/i)).toBeVisible();

    // Open Settings sheet
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Assert corrupt settings notice is visible with exact expected text and action button
    const noticeText =
      'Your saved settings could not be loaded because the stored data is invalid or has an incompatible version. Default settings are in use.';
    await expect(page.getByText(noticeText)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset Settings' })).toBeVisible();

    // Run axe check
    await checkA11y(page, 'Settings sheet with corrupt settings notice');
  });
});
