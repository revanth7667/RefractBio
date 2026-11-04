import { test, expect, type Page } from '@playwright/test';
import { loadFixture, makeAnthropicStream } from './helpers';

async function setupTestApp(page: Page, key: string, masterText: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const keyInput = page.getByPlaceholder('Enter your Anthropic API key');
  await keyInput.fill(key);
  const testBtn = page.getByRole('button', { name: 'Test connection' }).first();
  await testBtn.click();
  await expect(page.getByText(/connected/i)).toBeVisible();

  await page.getByRole('tab', { name: 'Master Info' }).click();
  const masterEditor = page.getByRole('textbox', { name: 'Master Info' });
  await masterEditor.fill(masterText);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Close' }).click();
}

test.describe('E2E Stop generation (§14.8)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';

  test('hanging request cancelled on Stop, UI recovers, inputs preserved, Send re-enabled and resend succeeds', async ({
    page,
  }) => {
    let hangingRouteAborted = false;
    let sendSucceeded = false;

    const resumeFixture = loadFixture('outputs/resume.txt');
    const editedMasterInfo = loadFixture('master/edited.md');

    // Track request failure (abort)
    page.on('requestfailed', (req) => {
      if (req.url().includes('api.anthropic.com/v1/messages')) {
        hangingRouteAborted = true;
      }
    });

    // Mock Anthropic endpoints
    await page.route('https://api.anthropic.com/**', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      }

      if (url.includes('/v1/models')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            data: [
              { id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet' },
              { id: 'claude-3-5-haiku-20241022', display_name: 'Claude 3.5 Haiku' },
            ],
          }),
        });
      }

      if (url.includes('/v1/messages')) {
        if (!sendSucceeded) {
          // Never answers until aborted by client Stop
          return new Promise(() => {});
        } else {
          // Subsequent successful send
          return route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'text/event-stream',
            },
            body: makeAnthropicStream(resumeFixture),
          });
        }
      }

      return route.continue();
    });

    await setupTestApp(page, fakeKey, editedMasterInfo);

    // Job context & custom instructions
    const jobText = 'Data Analyst position at Example Corp';
    const instructionsText = 'Keep resume to one page';

    await page.getByLabel('Job context').fill(jobText);
    await page.getByText('Custom instructions (this job only)').click();
    await page.getByPlaceholder(/Emphasise reporting automation/i).fill(instructionsText);

    // Unselect Cover Letter so only Resume runs
    const coverLetterBtn = page.getByRole('button', { name: /^Cover Letter$/i });
    if ((await coverLetterBtn.getAttribute('aria-pressed')) === 'true') {
      await coverLetterBtn.click();
    }

    // Send
    const sendBtn = page.getByRole('button', { name: /^Send$/i });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Tab shows Stop button
    const stopResumeBtn = page.getByRole('button', { name: 'Stop Resume' });
    await expect(stopResumeBtn).toBeVisible();

    // Send bar shows Stop all
    const stopAllBtn = page.getByRole('button', { name: 'Stop all outputs' });
    await expect(stopAllBtn).toBeVisible();

    // Press Stop
    await stopResumeBtn.click();

    // Request is cancelled / aborted
    await expect.poll(() => hangingRouteAborted).toBe(true);

    // Tab/UI recovers: stopped message shown
    await expect(
      page.getByText('Stopped before anything came back. Press Retry, or choose another provider or model.'),
    ).toBeVisible();

    // Job context & custom instructions still present
    await expect(page.getByLabel('Job context')).toHaveValue(jobText);
    await expect(page.getByPlaceholder(/Emphasise reporting automation/i)).toHaveValue(instructionsText);

    // Send is re-enabled
    await expect(sendBtn).toBeEnabled();

    // Switch model
    await page.selectOption('#sendbar-model-picker', 'claude-3-5-haiku-20241022');

    // Resend successfully
    sendSucceeded = true;
    await sendBtn.click();

    // Completes successfully
    const expectedDocument = resumeFixture.split('<!-- GAPS-NOTE -->')[0].trim();
    await expect(page.locator('textarea[aria-label="Resume draft"]')).toHaveValue(expectedDocument);
  });

  test('partial stream kept on Stop with stopped notice shown', async ({ page }) => {
    const editedMasterInfo = loadFixture('master/edited.md');
    const partialText = 'Partial draft text before user cancelled';

    await page.addInitScript(({ partial }) => {
      // Mock window.fetch for /v1/messages to stream partial text and then stall
      const originalFetch = window.fetch;
      window.fetch = async (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.href
            : input.url;
        if (url.includes('api.anthropic.com/v1/messages')) {
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              const sseChunk = [
                'event: content_block_delta',
                `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(
                  partial,
                )}}}`,
                '',
                '',
              ].join('\n');
              controller.enqueue(encoder.encode(sseChunk));

              init?.signal?.addEventListener('abort', () => {
                try {
                  controller.error(new DOMException('Aborted', 'AbortError'));
                } catch {
                  // Ignore if stream already closed
                }
              });
            },
          });

          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }
        return originalFetch(input, init);
      };
    }, { partial: partialText });

    // Mock models endpoint
    await page.route('https://api.anthropic.com/**', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      }

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

      return route.continue();
    });

    await setupTestApp(page, fakeKey, editedMasterInfo);

    await page.getByLabel('Job context').fill('Data Analyst position');

    // Unselect Cover Letter
    const coverLetterBtn = page.getByRole('button', { name: /^Cover Letter$/i });
    if ((await coverLetterBtn.getAttribute('aria-pressed')) === 'true') {
      await coverLetterBtn.click();
    }

    const sendBtn = page.getByRole('button', { name: /^Send$/i });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Editor receives partial text
    const editor = page.locator('textarea[aria-label="Resume draft"]');
    await expect(editor).toHaveValue(new RegExp(partialText));

    // Press Stop
    const stopResumeBtn = page.getByRole('button', { name: 'Stop Resume' });
    await expect(stopResumeBtn).toBeVisible();
    await stopResumeBtn.click();

    // Stopped notice is shown
    await expect(
      page.getByText('Stopped early. This draft is incomplete. Press Regenerate to run it again.'),
    ).toBeVisible();

    // Partial text is kept in the editor
    await expect(editor).toHaveValue(partialText);

    // Send is re-enabled
    await expect(sendBtn).toBeEnabled();
  });
});
