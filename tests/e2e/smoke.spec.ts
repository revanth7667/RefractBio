import { test, expect } from '@playwright/test';
import {
  setupAnthropicMock,
  loadFixture,
  type AnthropicRequestBody,
} from './helpers';
import { GAPS_DELIMITER } from '../../src/config';

interface CspViolationReport {
  blockedURI: string;
  violatedDirective: string;
  effectiveDirective?: string;
}

declare global {
  interface Window {
    __cspViolations?: CspViolationReport[];
  }
}

test.describe('E2E smoke test (§19.5)', () => {
  // Construct fake key at runtime (§19.3, §22.2)
  const fakeKey = 'sk-' + 'test-fake-0000';

  test('full end-to-end user workflow against hosted build with mocked Anthropic API', async ({
    page,
  }) => {
    // 0. Setup CSP violation listener and external request tracking
    const externalRequests: string[] = [];

    await page.addInitScript(() => {
      window.__cspViolations = [];
      window.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations?.push({
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          effectiveDirective: e.effectiveDirective,
        });
      });
    });

    page.on('request', (req) => {
      const url = req.url();
      if (
        !url.startsWith('http://localhost') &&
        !url.startsWith('http://127.0.0.1') &&
        !url.startsWith('https://api.anthropic.com') &&
        !url.startsWith('blob:') &&
        !url.startsWith('data:')
      ) {
        externalRequests.push(url);
      }
    });

    // Load test fixtures
    const resumeFixture = loadFixture('outputs/resume.txt');
    const linkedinFixture = loadFixture('outputs/linkedin-two-variants.txt');
    const answersFixture = loadFixture('outputs/answers.txt');
    const emailFixture = [
      'Subject: Senior Freight Data Analyst Application',
      '',
      'Dear Hiring Team,',
      '',
      'I am applying for the Senior Freight Data Analyst position at Fictional Logistics Inc.',
      '',
      GAPS_DELIMITER,
      '- None',
    ].join('\n');

    const editedMasterInfo = loadFixture('master/edited.md');
    const postingFixture = loadFixture('jobs/posting-data-analyst.txt');
    const questionsFixture = loadFixture('questions/questions.txt');

    const capturedRequests: Array<{
      url: string;
      method: string;
      postData: string;
      parsedBody?: AnthropicRequestBody;
    }> = [];

    await setupAnthropicMock(page, {
      resume: resumeFixture,
      linkedin: linkedinFixture,
      answers: answersFixture,
      email: emailFixture,
      capturedRequests,
    });

    // -------------------------------------------------------------
    // Step 1: Load app, assert CSP meta, no external requests, empty state,
    // Resume & Cover Letter pre-selected, Questions box not visible
    // -------------------------------------------------------------
    await page.goto('/');

    expect(externalRequests).toEqual([]);

    const cspMeta = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(cspMeta).toHaveCount(1);

    await expect(page.getByText(/your drafts will appear here/i)).toBeVisible();

    const resumeBtn = page.getByRole('button', { name: /^resume$/i });
    const coverLetterBtn = page.getByRole('button', { name: /^cover letter$/i });
    await expect(resumeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(coverLetterBtn).toHaveAttribute('aria-pressed', 'true');

    const questionsBox = page.getByLabel(/application questions/i);
    await expect(questionsBox).not.toBeVisible();

    // -------------------------------------------------------------
    // Step 2: Open Settings, paste fake key, Test connection -> "Connected"
    // -------------------------------------------------------------
    await page.getByRole('button', { name: 'Settings' }).click();
    const keyInput = page.getByPlaceholder('Enter your Anthropic API key');
    await keyInput.fill(fakeKey);

    const testBtn = page.getByRole('button', { name: 'Test connection' }).first();
    await testBtn.click();
    await expect(page.getByText(/connected/i)).toBeVisible();

    // -------------------------------------------------------------
    // Step 3: Effective Master Info is sample -> Send blocked with sample-marker message
    // -------------------------------------------------------------
    await page.getByRole('button', { name: 'Close' }).click();

    const sendBtn = page.getByRole('button', { name: /^send$/i });
    await expect(sendBtn).toBeDisabled();
    await expect(page.getByText(/contains the sample marker on its first line/i)).toBeVisible();

    // -------------------------------------------------------------
    // Step 4: In Settings -> Master Info, replace with edited.md and save
    // -------------------------------------------------------------
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Master Info' }).click();

    const masterEditor = page.getByRole('textbox', { name: 'Master Info' });
    await masterEditor.fill(editedMasterInfo);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Close' }).click();

    await expect(page.getByText(/contains the sample marker on its first line/i)).not.toBeVisible();

    // -------------------------------------------------------------
    // Step 5: Paste posting-data-analyst.txt into Job context;
    // select Resume, Email, LinkedIn and Application Answers;
    // Questions box appears; Send blocked with questions message;
    // paste questions.txt; Send
    // -------------------------------------------------------------
    const jobContextInput = page.getByLabel('Job context');
    await jobContextInput.fill(postingFixture);

    // Deselect Cover Letter, select Email, LinkedIn, Answers
    await coverLetterBtn.click();
    await expect(coverLetterBtn).toHaveAttribute('aria-pressed', 'false');

    const emailBtn = page.getByRole('button', { name: /^email$/i });
    const linkedinBtn = page.getByRole('button', { name: /linkedin message/i });
    const answersBtn = page.getByRole('button', { name: /application answers/i });

    await emailBtn.click();
    await linkedinBtn.click();
    await answersBtn.click();

    await expect(questionsBox).toBeVisible();
    await expect(sendBtn).toBeDisabled();
    await expect(page.getByText(/add the application questions/i)).toBeVisible();

    await questionsBox.fill(questionsFixture);
    await expect(page.getByText(/add the application questions/i)).not.toBeVisible();
    await expect(sendBtn).toBeEnabled();

    await sendBtn.click();

    // -------------------------------------------------------------
    // Step 6: All four tabs appear and reach done;
    // Resume shows Gaps note; Email starts with Subject:;
    // LinkedIn shows Copy buttons; Answers shows ### headings;
    // Answers request body contains <questions>; others do not;
    // every request body contains <today>
    // -------------------------------------------------------------
    const resumeTab = page.getByRole('tab', { name: /resume/i });
    const emailTab = page.getByRole('tab', { name: /email/i });
    const linkedinTab = page.getByRole('tab', { name: /linkedin/i });
    const answersTab = page.getByRole('tab', { name: /answers/i });

    await expect(resumeTab).toBeVisible({ timeout: 15000 });
    await expect(emailTab).toBeVisible({ timeout: 15000 });
    await expect(linkedinTab).toBeVisible({ timeout: 15000 });
    await expect(answersTab).toBeVisible({ timeout: 15000 });

    // Resume tab shows Gaps note
    await resumeTab.click();
    await expect(page.getByText(/Gaps/i).first()).toBeVisible();
    await expect(page.getByText(/Kubernetes cluster management/i).first()).toBeVisible();

    // Email tab starts with Subject:
    await emailTab.click();
    const emailEditor = page.locator('textarea[aria-label="Email draft"]');
    await expect(emailEditor).toBeVisible();
    const emailText = await emailEditor.inputValue();
    expect(emailText.trim().startsWith('Subject:')).toBe(true);

    // LinkedIn tab shows "Copy connection note" and "Copy direct message"
    await linkedinTab.click();
    await expect(page.getByRole('button', { name: /copy connection note/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /copy direct message/i })).toBeVisible();
    await page.getByRole('button', { name: /copy connection note/i }).click();

    // Trigger download .md per SPEC §18.3 end-of-flow requirements
    await resumeTab.click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .md' }).click();
    await downloadPromise;

    // Answers tab shows ### headings
    await answersTab.click();
    const answersEditor = page.locator('textarea[aria-label="Application Answers draft" i]');
    await expect(answersEditor).toBeVisible();
    const answersText = await answersEditor.inputValue();
    expect(answersText).toContain('### Tell me about a time you fixed a data problem');

    // Assert on captured requests:
    // The mocked Answers request body contains a <questions> block and the other requests do not
    expect(capturedRequests.length).toBe(4);

    const answersReq = capturedRequests.find((r) => r.postData.includes('ANSWERS'));
    expect(answersReq).toBeDefined();
    const answersUserText = answersReq?.parsedBody?.messages?.[0]?.content?.[0]?.text;
    expect(answersUserText).toContain('<questions>');

    const otherReqs = capturedRequests.filter((r) => !r.postData.includes('ANSWERS'));
    expect(otherReqs.length).toBe(3);
    for (const req of otherReqs) {
      const otherUserText = req.parsedBody?.messages?.[0]?.content?.[0]?.text;
      expect(otherUserText).not.toContain('<questions>');
    }

    for (const req of capturedRequests) {
      expect(req.postData).toContain('<today>');
      expect(req.postData).toContain('</today>');
    }

    // -------------------------------------------------------------
    // Step 7: Edit Resume text; press Regenerate -> confirm dialog appears
    // -------------------------------------------------------------
    await resumeTab.click();
    const resumeEditor = page.locator('textarea[aria-label="Resume draft"]');
    const originalResumeText = await resumeEditor.inputValue();
    await resumeEditor.fill(originalResumeText + '\n\nEdited personal addition.');

    const regenBtn = page.getByRole('button', { name: /regenerate/i });
    await regenBtn.click();

    const overwriteDialog = page.getByRole('alertdialog');
    await expect(overwriteDialog).toBeVisible();
    await expect(overwriteDialog).toContainText(/replace your edits/i);

    // Dismiss confirm dialog
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(overwriteDialog).not.toBeVisible();

    // -------------------------------------------------------------
    // Step 8: Clear job -> confirm -> tabs gone, Questions box empty,
    // empty state returns; Master Info present after reload; key absent
    // -------------------------------------------------------------
    await page.getByRole('button', { name: 'Clear job', exact: true }).click();
    const clearDialog = page.getByRole('alertdialog');
    await expect(clearDialog).toBeVisible();

    await clearDialog.getByRole('button', { name: 'Clear job' }).click();

    await expect(resumeTab).not.toBeVisible();
    await expect(emailTab).not.toBeVisible();
    await expect(linkedinTab).not.toBeVisible();
    await expect(answersTab).not.toBeVisible();

    await expect(page.getByText(/your drafts will appear here/i)).toBeVisible();

    // Reload page to verify persistence behaviors
    await page.reload();

    // Verify Master Info persisted
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Master Info' }).click();
    const reloadedMasterText = await page.getByRole('textbox', { name: 'Master Info' }).inputValue();
    expect(reloadedMasterText).toContain('Career History: Alex Morgan');

    // Verify key NOT persisted (rememberKeys OFF)
    await page.getByRole('tab', { name: 'Providers' }).click();
    const reloadedKeyInput = page.getByPlaceholder('Enter your Anthropic API key');
    await expect(reloadedKeyInput).toHaveValue('');
    await page.getByRole('button', { name: 'Close' }).click();

    // -------------------------------------------------------------
    // Step 9: localStorage keys ⊆ the four allowed keys; zero CSP violations
    // -------------------------------------------------------------
    const storageKeys = await page.evaluate(() => Object.keys(localStorage));
    const allowedKeys = [
      'masterInfo',
      'instructions',
      'apiKeys',
      'settings',
    ].map((k) => `refractbio:v1:${k}`);

    for (const key of storageKeys) {
      expect(allowedKeys).toContain(key);
    }

    const cspViolations = await page.evaluate(() => window.__cspViolations || []);
    expect(cspViolations).toEqual([]);

    // Assert at the end of the full flow (after generation, copy, download, clear, reload)
    // that the only external hosts contacted are the mocked provider endpoints (SPEC §18.3)
    expect(externalRequests).toEqual([]);
  });
});
