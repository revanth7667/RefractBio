import { test, expect } from '@playwright/test';
import { setupAnthropicRoutes, loadFixture } from './helpers';

test.describe('Print typography reproduction and verification (§16.3, M10-FIX-2)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';

  test('asserts computed styles under media print, screen hiding, and PDF largest text size', async ({
    page,
  }) => {
    // Stub window.print to prevent browser dialog
    await page.addInitScript(() => {
      window.print = () => {};
    });

    const resumeFixture = loadFixture('outputs/resume.txt');
    const coverLetterFixture = loadFixture('outputs/cover-letter.txt');
    const editedMasterInfo = loadFixture('master/edited.md');

    await setupAnthropicRoutes(page, resumeFixture, coverLetterFixture);

    await page.goto('/');

    // Setup key in Settings
    await page.getByRole('button', { name: 'Settings' }).click();
    const keyInput = page.getByPlaceholder('Enter your Anthropic API key');
    await keyInput.fill(fakeKey);

    // Test connection
    const testBtn = page.getByRole('button', { name: 'Test connection' }).first();
    await testBtn.click();
    await expect(page.getByText(/connected/i)).toBeVisible();

    // Master Info
    await page.getByRole('tab', { name: 'Master Info' }).click();
    const masterEditor = page.getByRole('textbox', { name: 'Master Info' });
    await masterEditor.fill(editedMasterInfo);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Close' }).click();

    // Paste job context and generate
    const jobContextInput = page.getByLabel('Job context');
    await jobContextInput.fill('Data Analyst role');
    const sendBtn = page.getByRole('button', { name: /^send$/i });
    await sendBtn.click();

    // Wait for Resume tab print button
    const printBtn = page.getByRole('button', { name: /print \/ save as pdf/i });
    await expect(printBtn).toBeVisible({ timeout: 15000 });

    // Click print
    await printBtn.click();

    // Task 7: Confirm #print-root is hidden on screen
    const screenDisplay = await page.evaluate(() => {
      const root = document.getElementById('print-root');
      return root ? window.getComputedStyle(root).display : null;
    });
    expect(screenDisplay).toBe('none');

    // Emulate print media
    await page.emulateMedia({ media: 'print' });

    // Task 7: Confirm #print-root is visible in print and all other body children are hidden
    const printDisplays = await page.evaluate(() => {
      const printRoot = document.getElementById('print-root');
      const otherChildren = Array.from(document.querySelectorAll('body > *:not(#print-root)'));
      return {
        printRootDisplay: printRoot ? window.getComputedStyle(printRoot).display : null,
        otherDisplays: otherChildren.map((el) => window.getComputedStyle(el).display),
      };
    });
    expect(printDisplays.printRootDisplay).toBe('block');
    expect(printDisplays.otherDisplays.length).toBeGreaterThan(0);
    for (const d of printDisplays.otherDisplays) {
      expect(d).toBe('none');
    }

    // Read computed styles under print media
    const styles = await page.evaluate(() => {
      const getProps = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          fontSize: parseFloat(cs.fontSize),
          fontWeight: cs.fontWeight,
          lineHeight: parseFloat(cs.lineHeight),
          marginTop: parseFloat(cs.marginTop),
          marginBottom: parseFloat(cs.marginBottom),
          paddingLeft: parseFloat(cs.paddingLeft),
          textAlign: cs.textAlign,
          textTransform: cs.textTransform,
          letterSpacing: parseFloat(cs.letterSpacing),
          borderBottomWidth: parseFloat(cs.borderBottomWidth),
          color: cs.color,
          listStyleType: cs.listStyleType,
          textDecorationLine: cs.textDecorationLine,
        };
      };

      return {
        root: getProps('#print-root'),
        h1: getProps('#print-root h1'),
        contactP: getProps('#print-root h1 + p'),
        h2: getProps('#print-root h2'),
        h3: getProps('#print-root h3'),
        afterH3P: getProps('#print-root h3 + p'),
        ul: getProps('#print-root ul'),
        li: getProps('#print-root li'),
        a: getProps('#print-root a'),
      };
    });

    // Task 4 Assertions (tolerance 0.5 px)
    // body: 14 px (10.5 pt), line-height 18.2 px
    expect(styles.root?.fontSize).toBeCloseTo(14, 0);
    expect(styles.root?.lineHeight).toBeCloseTo(18.2, 0);

    // h1: 24 px (18 pt), text-align center, margin-top 0
    expect(styles.h1?.fontSize).toBeCloseTo(24, 0);
    expect(styles.h1?.textAlign).toBe('center');
    expect(styles.h1?.marginTop).toBeCloseTo(0, 0);

    // contact line: 12.67 px (9.5 pt), centered
    expect(styles.contactP?.fontSize).toBeCloseTo(12.67, 0);
    expect(styles.contactP?.textAlign).toBe('center');

    // h2: 15.33 px (11.5 pt), text-transform uppercase, letter-spacing about 0.77 px (0.05 em), border-bottom 1 px (0.75 pt), margin-top 13.23 px (0.35 cm)
    expect(styles.h2?.fontSize).toBeCloseTo(15.33, 0);
    expect(styles.h2?.textTransform).toBe('uppercase');
    expect(styles.h2?.letterSpacing).toBeCloseTo(0.77, 0);
    expect(styles.h2?.borderBottomWidth).toBeCloseTo(1, 0);
    expect(styles.h2?.marginTop).toBeCloseTo(13.23, 0);

    // h3: 14 px, font-weight 600 or more, margin-top 7.56 px (0.2 cm)
    expect(styles.h3?.fontSize).toBeCloseTo(14, 0);
    expect(parseInt(styles.h3?.fontWeight || '0', 10)).toBeGreaterThanOrEqual(600);
    expect(styles.h3?.marginTop).toBeCloseTo(7.56, 0);

    // paragraph after h3: 12.67 px, color rgb(68, 68, 68)
    expect(styles.afterH3P?.fontSize).toBeCloseTo(12.67, 0);
    expect(styles.afterH3P?.color).toBe('rgb(68, 68, 68)');

    // ul: padding-left 17.01 px (0.45 cm) and list-style-type disc
    expect(styles.ul?.paddingLeft).toBeCloseTo(17.01, 0);
    expect(styles.ul?.listStyleType).toBe('disc');

    // li: margin 1.89 px (0.05 cm)
    expect(styles.li?.marginTop).toBeCloseTo(1.89, 0);
    expect(styles.li?.marginBottom).toBeCloseTo(1.89, 0);

    // links: black, no underline
    expect(styles.a).toBeTruthy();
    expect(styles.a?.color).toBe('rgb(0, 0, 0)');
    expect(styles.a?.textDecorationLine).toBe('none');

    // Resume PDF inspection: largest text is 18 pt ± 1 pt
    const resumePdfBuffer = await page.pdf({ preferCSSPageSize: true });
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument({ data: new Uint8Array(resumePdfBuffer) });
    const doc = await loadingTask.promise;
    const pdfPage = await doc.getPage(1);
    const textContent = await pdfPage.getTextContent();

    const sizes = textContent.items
      .filter((item): item is typeof item & { str: string; transform: number[] } => 'str' in item && item.str.trim().length > 0)
      .map((item) => Math.hypot(item.transform[0], item.transform[1]));

    const largestSize = Math.max(...sizes);
    expect(largestSize).toBeGreaterThanOrEqual(17);
    expect(largestSize).toBeLessThanOrEqual(19);

    pdfPage.cleanup();
    await loadingTask.destroy();

    // Restore screen media to click UI elements
    await page.emulateMedia({ media: 'screen' });

    // Switch to Cover Letter tab
    const coverTab = page.getByRole('tab', { name: /cover letter/i });
    await coverTab.click();
    await printBtn.click();

    // Emulate print media for Cover Letter
    await page.emulateMedia({ media: 'print' });

    const coverParaMarginBottom = await page.evaluate(() => {
      const el = document.querySelector('#print-root[data-kind="cover_letter"] p');
      return el ? parseFloat(window.getComputedStyle(el).marginBottom) : null;
    });

    // cover letter paragraphs: margin-bottom 11.34 px (0.3 cm)
    expect(coverParaMarginBottom).toBeCloseTo(11.34, 0);
  });
});
