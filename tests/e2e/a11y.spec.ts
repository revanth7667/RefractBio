import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { makeAnthropicStream, loadFixture } from './helpers';
import { GAPS_DELIMITER } from '../../src/config';

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

async function setupAllFiveOutputsRoute(
  page: Page,
  options?: { truncateCoverLetter?: boolean; failAnswers?: boolean }
) {
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();

    // CORS preflight OPTIONS
    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // Models endpoint GET
    if (url.includes('/v1/models')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          data: [{ id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet' }],
        }),
      });
    }

    // Messages generation endpoint POST
    if (url.includes('/v1/messages')) {
      const postData = request.postData() || '';

      if (options?.failAnswers && postData.includes('Write the answers to the questions')) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            type: 'error',
            error: { type: 'api_error', message: 'Internal server error while generating answers' },
          }),
        });
      }

      let text = '';
      let stopReason: string | null = 'end_turn';

      if (postData.includes('Write the resume now')) {
        text = loadFixture('outputs/resume.txt');
      } else if (postData.includes('Write the cover letter now')) {
        text = loadFixture('outputs/cover-letter.txt');
        if (options?.truncateCoverLetter) {
          stopReason = 'max_tokens';
        }
      } else if (postData.includes('Write the LinkedIn message now')) {
        text =
          `Variant 1: Connection request note\nHi Jordan, noticed your work in analytics.\n\nVariant 2: Direct message\nHello Jordan, reaching out about the senior role.\n\n${GAPS_DELIMITER}\n- None.`;
      } else if (postData.includes('Write the email now')) {
        text =
          `Subject: Application for Senior Data Analyst - Jordan Sample\n\nDear Hiring Team,\n\nI am applying for the role.\n\n${GAPS_DELIMITER}\n- None.`;
      } else if (postData.includes('Write the answers to the questions')) {
        text = `### 1. Tell me about a time when...\nI automated reporting.\n\n${GAPS_DELIMITER}\n- None.`;
      }

      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: makeAnthropicStream(text, stopReason),
      });
    }

    return route.abort();
  });
}

test.describe('Accessibility check with axe-core (§17.7)', () => {
  const themes: ('light' | 'dark')[] = ['light', 'dark'];

  for (const theme of themes) {
    test.describe(`${theme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
      });

      test(`empty state with blocker message and Settings sheet tabs in ${theme} mode`, async ({
        page,
      }) => {
        await page.goto('/');
        await expect(page.getByText(/Your drafts will appear here/i)).toBeVisible();
        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/dark/);
        }
        await page.waitForTimeout(200);

        // Blocker reason message and footer visible in empty state
        await expect(page.locator('#send-blocker-reason')).toBeVisible();
        await expect(page.locator('footer')).toBeVisible();
        await expect(page.getByRole('link', { name: 'MIT License' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Source' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible();
        await checkA11y(page, `main screen empty state with send blocker and footer (${theme})`);

        // Open Settings sheet
        await page.getByRole('button', { name: 'Settings' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.waitForTimeout(200);

        // 1. Providers tab (default active)
        await checkA11y(page, `Settings: Providers tab (${theme})`);

        // 2. Master Info tab
        await page.getByRole('tab', { name: 'Master Info' }).click();
        await expect(
          page.getByPlaceholder(/paste or write your master info/i)
        ).toBeVisible();
        await page.waitForTimeout(100);
        await checkA11y(page, `Settings: Master Info tab (${theme})`);

        // 3. Instructions tab
        await page.getByRole('tab', { name: 'Instructions' }).click();
        await expect(
          page.getByRole('button', { name: 'Save', exact: true })
        ).toBeVisible();
        await page.waitForTimeout(100);
        await checkA11y(page, `Settings: Instructions tab (${theme})`);

        // 4. Appearance tab
        await page.getByRole('tab', { name: 'Appearance' }).click();
        await expect(page.getByRole('button', { name: 'system' })).toBeVisible();
        await page.waitForTimeout(100);
        await checkA11y(page, `Settings: Appearance tab (${theme})`);

        // 5. Data tab
        await page.getByRole('tab', { name: 'Data' }).click();
        await expect(
          page.getByRole('button', { name: /delete all app data/i })
        ).toBeVisible();
        await page.waitForTimeout(100);
        await checkA11y(page, `Settings: Data tab (${theme})`);

        // 6. About tab
        await page.getByRole('tab', { name: 'About' }).click();
        await expect(page.getByRole('heading', { level: 3, name: /RefractBio/ })).toBeVisible();
        await page.waitForTimeout(100);
        await checkA11y(page, `Settings: About tab (${theme})`);
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

      test(`main screen with all 5 draft tabs (truncation and error callouts) in ${theme} mode`, async ({
        page,
      }) => {
        const editedMasterInfo = loadFixture('master/edited.md');

        await setupAllFiveOutputsRoute(page, {
          truncateCoverLetter: true,
          failAnswers: true,
        });

        await page.goto('/');
        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/dark/);
        }

        // Configure key & Master Info
        await page.getByRole('button', { name: 'Settings' }).click();
        const keyInput = page.getByPlaceholder('Enter your Anthropic API key');
        await keyInput.fill(fakeKey);

        const testBtn = page.getByRole('button', { name: 'Test connection' }).first();
        await testBtn.click();
        await expect(page.getByText(/connected/i)).toBeVisible();

        await page.getByRole('tab', { name: 'Master Info' }).click();
        const masterEditor = page.getByRole('textbox', { name: 'Master Info' });
        await masterEditor.fill(editedMasterInfo);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByRole('button', { name: 'Close' }).click();

        // Enable LinkedIn, Email, and Answers toggles
        await page.getByRole('button', { name: 'LinkedIn Message' }).click();
        await page.getByRole('button', { name: 'Email' }).click();
        await page.getByRole('button', { name: 'Application Answers' }).click();

        // Fill application questions and job context
        await page.getByLabel('Application questions').fill('Tell me about a time when you improved data reliability.');
        await page.getByLabel('Job context').fill('Senior Data Analyst job posting for Logistics Team.');

        const sendBtn = page.getByRole('button', { name: /^send$/i });
        await sendBtn.click();

        // Wait for draft tabs to finish generating
        await expect(page.getByRole('tab', { name: /resume/i })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: /^copy$/i }).first()).toBeVisible();

        // Tab 1: Resume
        await page.getByRole('tab', { name: /resume/i }).click();
        await page.waitForTimeout(150);
        await checkA11y(page, `Drafts: Resume tab (${theme})`);

        // Tab 2: Cover Letter (with Truncation Notice visible)
        await page.getByRole('tab', { name: /cover letter/i }).click();
        await expect(page.getByText(/draft was cut off/i)).toBeVisible();
        await page.waitForTimeout(150);
        await checkA11y(page, `Drafts: Cover Letter tab with truncation notice (${theme})`);

        // Tab 3: LinkedIn Message (with variant copy buttons visible)
        await page.getByRole('tab', { name: /linkedin/i }).click();
        await expect(page.getByRole('button', { name: /copy connection note/i })).toBeVisible();
        await page.waitForTimeout(150);
        await checkA11y(page, `Drafts: LinkedIn tab (${theme})`);

        // Tab 4: Email (with email part copy buttons visible)
        await page.getByRole('tab', { name: /email/i }).click();
        await expect(page.getByRole('button', { name: /copy subject/i })).toBeVisible();
        await page.waitForTimeout(150);
        await checkA11y(page, `Drafts: Email tab (${theme})`);

        // Tab 5: Application Answers (with Error Callout visible)
        await page.getByRole('tab', { name: /answers/i }).click();
        await expect(page.getByRole('button', { name: 'Retry' }).first()).toBeVisible();
        await page.waitForTimeout(150);
        await checkA11y(page, `Drafts: Answers tab with error callout (${theme})`);
      });

      test(`narrow viewport (390 x 844 px) in ${theme} mode`, async ({ page }) => {
        const editedMasterInfo = loadFixture('master/edited.md');
        await page.setViewportSize({ width: 390, height: 844 });

        await setupAllFiveOutputsRoute(page);

        await page.goto('/');
        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/dark/);
        }

        // Configure key & Master Info
        await page.getByRole('button', { name: 'Settings' }).click();
        const keyInput = page.getByPlaceholder('Enter your Anthropic API key');
        await keyInput.fill(fakeKey);

        const testBtn = page.getByRole('button', { name: 'Test connection' }).first();
        await testBtn.click();
        await expect(page.getByText(/connected/i)).toBeVisible();

        await page.getByRole('tab', { name: 'Master Info' }).click();
        const masterEditor = page.getByRole('textbox', { name: 'Master Info' });
        await masterEditor.fill(editedMasterInfo);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByRole('button', { name: 'Close' }).click();

        // 1. Narrow main screen with Inputs tab
        await page.waitForTimeout(150);
        await checkA11y(page, `Narrow: Inputs tab (${theme})`);

        // Fill context and send
        await page.getByLabel('Job context').fill('Senior Data Analyst job description');
        const sendBtn = page.getByRole('button', { name: /^send$/i });
        await sendBtn.click();

        // Auto-switches to Outputs tab on Send
        await expect(page.getByRole('tab', { name: /resume/i })).toBeVisible({ timeout: 15000 });

        // 2. Narrow main screen with Outputs tab showing drafts
        await page.waitForTimeout(150);
        await checkA11y(page, `Narrow: Outputs tab with drafts (${theme})`);

        // 3. Narrow Settings sheet (Providers tab & About tab)
        await page.getByRole('button', { name: 'Settings' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.waitForTimeout(150);
        await checkA11y(page, `Narrow: Settings sheet Providers tab (${theme})`);

        await page.getByRole('tab', { name: 'About' }).click();
        await expect(page.getByRole('heading', { level: 3, name: /RefractBio/ })).toBeVisible();
        await page.waitForTimeout(100);
        await checkA11y(page, `Narrow: Settings sheet About tab (${theme})`);
      });
    });
  }
});
