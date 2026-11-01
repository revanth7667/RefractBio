import { test, expect } from '@playwright/test';
import {
  extractPdfInfo,
  setupAnthropicRoutes,
  loadFixture,
} from './helpers';

test.describe('M10 Export and Print e2e check (§16.3, §20 M10)', () => {
  // Never write literal keys - construct at runtime (§19.3, §22.2)
  const fakeKey = 'sk-' + 'test-fake-0000';

  test('generates resume and cover letter, runs print-check procedure on both sizes with clean PDF output and zero CSP violations', async ({
    page,
  }) => {
    // 1. Stub window.print to a no-op so no native dialog appears and afterprint does not fire (§16.3)
    await page.addInitScript(() => {
      (window as any).__printCalls = 0;
      window.print = () => {
        (window as any).__printCalls = ((window as any).__printCalls || 0) + 1;
      };

      // Track CSP violations
      (window as any).__cspViolations = [];
      window.addEventListener('securitypolicyviolation', (e) => {
        (window as any).__cspViolations.push({
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          effectiveDirective: e.effectiveDirective,
        });
      });
    });

    // Load fixtures
    const resumeFixture = loadFixture('outputs/resume.txt');
    const coverLetterFixture = loadFixture('outputs/cover-letter.txt');
    const editedMasterInfo = loadFixture('master/edited.md');

    // Setup CORS-enabled routes for Anthropic
    await setupAnthropicRoutes(page, resumeFixture, coverLetterFixture);

    // Load app against vite preview (with CSP injected)
    await page.goto('/');

    // Verify CSP meta tag exists in DOM
    const cspMeta = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(cspMeta).toHaveCount(1);

    // 2. Open Settings, enter API key, test connection
    await page.getByRole('button', { name: 'Settings' }).click();
    const keyInput = page.getByPlaceholder('Enter your Anthropic API key');
    await keyInput.fill(fakeKey);

    // Ensure remember keys is OFF
    const rememberSwitch = page.getByLabel('Remember my API keys on this device');
    await expect(rememberSwitch).toHaveAttribute('aria-checked', 'false');

    // Test connection
    const testBtn = page.getByRole('button', { name: 'Test connection' }).first();
    await testBtn.click();
    await expect(page.getByText(/connected/i)).toBeVisible();

    // 3. In Settings -> Master Info, replace the sample with edited.md and Save
    await page.getByRole('tab', { name: 'Master Info' }).click();
    const masterEditor = page.getByRole('textbox', { name: 'Master Info' });
    await masterEditor.fill(editedMasterInfo);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // Close Settings
    await page.getByRole('button', { name: 'Close' }).click();

    // 4. Paste job context
    const jobContextInput = page.getByLabel('Job context');
    await jobContextInput.fill('Logistics Freight Co. seeking Data Analyst with reporting automation skills.');

    // 5. Send with Resume and Cover Letter selected (default)
    const sendBtn = page.getByRole('button', { name: /^send$/i });
    await sendBtn.click();

    // Wait for Resume tab to be ready
    const resumeTab = page.getByRole('tab', { name: /resume/i });
    await expect(resumeTab).toBeVisible();

    // Ensure Print button is visible
    const printBtn = page.getByRole('button', { name: /print \/ save as pdf/i });
    await expect(printBtn).toBeVisible({ timeout: 15000 });

    // -------------------------------------------------------------
    // PRINT CHECK PROCEDURE (§20 M10): RESUME
    // -------------------------------------------------------------
    const paperSelect = page.getByLabel('Paper size');

    // (1) Select US Letter, click Print
    await paperSelect.selectOption('letter');
    await printBtn.click();

    // (5) Assert <style id="page-size"> contains exactly one @page rule naming 'letter'
    let styleCount = await page.locator('style#page-size').count();
    expect(styleCount).toBe(1);
    let styleText = await page.locator('style#page-size').textContent();
    expect(styleText?.trim()).toBe('@page { size: letter; margin: 1.9cm; }');

    // (3) Call page.pdf({ preferCSSPageSize: true }) and assert 1 page and MediaBox 612x792 pt ±2 pt
    const resumeLetterPdf = await page.pdf({ preferCSSPageSize: true });
    const resumeLetterInfo = await extractPdfInfo(resumeLetterPdf);
    expect(resumeLetterInfo.numPages).toBe(1);
    expect(Math.abs(resumeLetterInfo.width - 612)).toBeLessThanOrEqual(2);
    expect(Math.abs(resumeLetterInfo.height - 792)).toBeLessThanOrEqual(2);

    // (6) Assert no app chrome text appears in PDF text
    expect(resumeLetterInfo.text).not.toContain('Send');
    expect(resumeLetterInfo.text).not.toContain('Settings');
    expect(resumeLetterInfo.text).not.toContain('Job context');

    // (7) Assert distinctive Gaps sentence does NOT appear in PDF text
    expect(resumeLetterInfo.text).not.toContain('Kubernetes');

    // (4) Select A4, click Print again (do not reload)
    await paperSelect.selectOption('a4');
    await printBtn.click();

    // (5) Assert <style id="page-size"> contains exactly one @page rule naming 'A4'
    styleCount = await page.locator('style#page-size').count();
    expect(styleCount).toBe(1);
    styleText = await page.locator('style#page-size').textContent();
    expect(styleText?.trim()).toBe('@page { size: A4; margin: 1.9cm; }');

    // Page.pdf again, assert 1 page at 595 × 842 pt ±2 pt
    const resumeA4Pdf = await page.pdf({ preferCSSPageSize: true });
    const resumeA4Info = await extractPdfInfo(resumeA4Pdf);
    expect(resumeA4Info.numPages).toBe(1);
    expect(Math.abs(resumeA4Info.width - 595)).toBeLessThanOrEqual(2);
    expect(Math.abs(resumeA4Info.height - 842)).toBeLessThanOrEqual(2);

    // (8) Assert after Letter-to-A4 switch the PDF is A4, not a mix
    expect(resumeA4Info.width).toBeLessThan(resumeLetterInfo.width);
    expect(resumeA4Info.height).toBeGreaterThan(resumeLetterInfo.height);
    expect(resumeA4Info.text).not.toContain('Send');
    expect(resumeA4Info.text).not.toContain('Kubernetes');

    // -------------------------------------------------------------
    // PRINT CHECK PROCEDURE (§20 M10): COVER LETTER
    // -------------------------------------------------------------
    const coverLetterTab = page.getByRole('tab', { name: /cover letter/i });
    await coverLetterTab.click();

    await expect(printBtn).toBeVisible();

    // Select US Letter, click Print
    await paperSelect.selectOption('letter');
    await printBtn.click();

    styleCount = await page.locator('style#page-size').count();
    expect(styleCount).toBe(1);
    styleText = await page.locator('style#page-size').textContent();
    expect(styleText?.trim()).toBe('@page { size: letter; margin: 1.9cm; }');

    const coverLetterPdf = await page.pdf({ preferCSSPageSize: true });
    const coverLetterInfo = await extractPdfInfo(coverLetterPdf);
    expect(coverLetterInfo.numPages).toBe(1);
    expect(Math.abs(coverLetterInfo.width - 612)).toBeLessThanOrEqual(2);
    expect(Math.abs(coverLetterInfo.height - 792)).toBeLessThanOrEqual(2);

    expect(coverLetterInfo.text).not.toContain('Send');
    expect(coverLetterInfo.text).not.toContain('Settings');
    expect(coverLetterInfo.text).not.toContain('Job context');
    expect(coverLetterInfo.text).not.toContain('Apache Kafka');

    // Select A4, click Print again
    await paperSelect.selectOption('a4');
    await printBtn.click();

    styleCount = await page.locator('style#page-size').count();
    expect(styleCount).toBe(1);
    styleText = await page.locator('style#page-size').textContent();
    expect(styleText?.trim()).toBe('@page { size: A4; margin: 1.9cm; }');

    const coverA4Pdf = await page.pdf({ preferCSSPageSize: true });
    const coverA4Info = await extractPdfInfo(coverA4Pdf);
    expect(coverA4Info.numPages).toBe(1);
    expect(Math.abs(coverA4Info.width - 595)).toBeLessThanOrEqual(2);
    expect(Math.abs(coverA4Info.height - 842)).toBeLessThanOrEqual(2);

    expect(coverA4Info.width).toBeLessThan(coverLetterInfo.width);
    expect(coverA4Info.height).toBeGreaterThan(coverLetterInfo.height);
    expect(coverA4Info.text).not.toContain('Send');
    expect(coverA4Info.text).not.toContain('Apache Kafka');

    // Assert zero security policy violations throughout the entire flow
    const violations = await page.evaluate(() => (window as any).__cspViolations);
    expect(violations).toEqual([]);
  });
});
