import { test, expect } from '@playwright/test';
import * as path from 'path';
import {
  extractPdfInfo,
  setupAnthropicMock,
  loadFixture,
} from './helpers';

interface CspViolationReport {
  blockedURI: string;
  violatedDirective: string;
  effectiveDirective?: string;
}

declare global {
  interface Window {
    __printCalls?: number;
    __cspViolations?: CspViolationReport[];
  }
}

test.describe('Single-file build e2e check (§18.1, §20 M11b, V16)', () => {
  // Construct fake key at runtime (§19.3, §22.2)
  const fakeKey = 'sk-' + 'test-fake-0000';

  test('loads single-file build from file:// URL, extracts DOCX text, and runs print flow with zero CSP violations', async ({
    page,
  }) => {
    // 1. Setup CSP violation listener and stub window.print
    const externalRequests: string[] = [];

    await page.addInitScript(() => {
      window.__printCalls = 0;
      window.print = () => {
        window.__printCalls = (window.__printCalls || 0) + 1;
      };

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
        !url.startsWith('file://') &&
        !url.startsWith('data:') &&
        !url.startsWith('blob:') &&
        !url.startsWith('https://api.anthropic.com')
      ) {
        externalRequests.push(url);
      }
    });

    const resumeFixture = loadFixture('outputs/resume.txt');
    const editedMasterInfo = loadFixture('master/edited.md');

    await setupAnthropicMock(page, {
      resume: resumeFixture,
    });

    // 2. Load dist-single/index.html from file:// URL
    const singleFilePath = path.resolve(process.cwd(), 'dist-single/index.html');
    const singleFileUrl = `file://${singleFilePath}`;

    await page.goto(singleFileUrl);

    // Assert: the app renders
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByText(/your drafts will appear here/i)).toBeVisible();

    // Assert: CSP meta tag is present
    const cspMeta = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(cspMeta).toHaveCount(1);
    const cspContent = await cspMeta.getAttribute('content');
    expect(cspContent).toContain("script-src 'unsafe-inline'");
    expect(cspContent).toContain('connect-src https://api.anthropic.com https://generativelanguage.googleapis.com');

    // Assert: no external network requests on load
    expect(externalRequests).toEqual([]);

    // Assert: no securitypolicyviolation events
    const initialViolations = await page.evaluate(() => window.__cspViolations || []);
    expect(initialViolations).toEqual([]);

    // Assert: localStorage keys are a subset of the four allowed keys
    const allowedKeys = [
      'masterInfo',
      'instructions',
      'apiKeys',
      'settings',
    ].map((k) => `refractbio:v1:${k}`);
    const initialStorageKeys = await page.evaluate(() => Object.keys(localStorage));
    for (const key of initialStorageKeys) {
      expect(allowedKeys).toContain(key);
    }

    // 3. Adding tests/fixtures/jobs/notes.docx extracts its text via mammoth running from inlined bundle
    const docxPath = path.resolve(process.cwd(), 'tests/fixtures/jobs/notes.docx');
    const fileInput = page.locator('input[type="file"][multiple]');
    await fileInput.setInputFiles(docxPath);

    await expect(page.getByText('notes.docx')).toBeVisible();
    await expect(page.getByText(/ready/i)).toBeVisible();

    const previewBtn = page.getByRole('button', { name: /preview text/i });
    await expect(previewBtn).toBeVisible();
    await previewBtn.click();

    // Verify extracted text preview from mammoth
    await expect(
      page.getByText(/Led migration of reporting database to Postgres/i),
    ).toBeVisible();
    await expect(
      page.getByText(/Built automated data quality pipelines with Python/i),
    ).toBeVisible();

    // 4. Print flow works under single-file CSP (Resume at Letter and A4)
    // Setup Settings with key and edited master info
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByPlaceholder('Enter your Anthropic API key').fill(fakeKey);
    await page.getByRole('button', { name: 'Test connection' }).first().click();
    await expect(page.getByText(/connected/i)).toBeVisible();

    await page.getByRole('tab', { name: 'Master Info' }).click();
    await page.getByRole('textbox', { name: 'Master Info' }).fill(editedMasterInfo);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Close' }).click();

    // Paste job context and generate Resume
    const jobContextInput = page.getByLabel('Job context');
    await jobContextInput.fill('Freight Logistics Inc seeking Data Analyst.');

    // Only Resume selected
    const coverLetterBtn = page.getByRole('button', { name: /^cover letter$/i });
    await coverLetterBtn.click();

    const sendBtn = page.getByRole('button', { name: /^send$/i });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    const resumeTab = page.getByRole('tab', { name: /resume/i });
    await expect(resumeTab).toBeVisible({ timeout: 15000 });

    const printBtn = page.getByRole('button', { name: /print \/ save as pdf/i });
    await expect(printBtn).toBeVisible();

    const paperSelect = page.getByLabel('Paper size');

    // (a) Test Letter
    await paperSelect.selectOption('letter');
    await printBtn.click();

    // Assert #print-root is filled
    const printRoot = page.locator('#print-root');
    await expect(printRoot).toBeAttached();
    const printRootHtml = await printRoot.innerHTML();
    expect(printRootHtml.trim().length).toBeGreaterThan(0);

    // Assert exactly one @page rule naming letter
    expect(await page.locator('style#page-size').count()).toBe(1);
    const letterStyle = await page.locator('style#page-size').textContent();
    expect(letterStyle?.trim()).toBe('@page { size: letter; margin: 1.9cm; }');

    const pdfLetter = await page.pdf({ preferCSSPageSize: true });
    const infoLetter = await extractPdfInfo(pdfLetter);
    expect(infoLetter.numPages).toBe(1);
    expect(Math.abs(infoLetter.width - 612)).toBeLessThanOrEqual(2);
    expect(Math.abs(infoLetter.height - 792)).toBeLessThanOrEqual(2);

    // (b) Test A4
    await paperSelect.selectOption('a4');
    await printBtn.click();

    expect(await page.locator('style#page-size').count()).toBe(1);
    const a4Style = await page.locator('style#page-size').textContent();
    expect(a4Style?.trim()).toBe('@page { size: A4; margin: 1.9cm; }');

    const pdfA4 = await page.pdf({ preferCSSPageSize: true });
    const infoA4 = await extractPdfInfo(pdfA4);
    expect(infoA4.numPages).toBe(1);
    expect(Math.abs(infoA4.width - 595)).toBeLessThanOrEqual(2);
    expect(Math.abs(infoA4.height - 842)).toBeLessThanOrEqual(2);

    // Assert zero CSP violations occurred throughout
    const finalViolations = await page.evaluate(() => window.__cspViolations || []);
    expect(finalViolations).toEqual([]);
  });
});
