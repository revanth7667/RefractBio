import { test, expect } from '@playwright/test';

test.describe('Help page rendering and computed styles (§17.5)', () => {
  test('asserts computed styles of headings, lists, blockquotes, and links in real browser', async ({
    page,
  }) => {
    await page.goto('/#/help');

    // Wait for the help content wrapper
    const helpWrapper = page.locator('.help-content');
    await expect(helpWrapper).toBeVisible();

    const styles = await page.evaluate(() => {
      const bodyEl = document.querySelector('.help-content p');
      const h1El = document.querySelector('.help-content h1');
      const h2El = document.querySelector('.help-content h2');
      const h3El = document.querySelector('.help-content h3');
      const ulEl = document.querySelector('.help-content ul');
      const bqEl = document.querySelector('.help-content blockquote');
      const aEl = document.querySelector('.help-content a');

      const bodyCs = bodyEl ? window.getComputedStyle(bodyEl) : null;
      const h1Cs = h1El ? window.getComputedStyle(h1El) : null;
      const h2Cs = h2El ? window.getComputedStyle(h2El) : null;
      const h3Cs = h3El ? window.getComputedStyle(h3El) : null;
      const ulCs = ulEl ? window.getComputedStyle(ulEl) : null;
      const bqCs = bqEl ? window.getComputedStyle(bqEl) : null;

      return {
        bodyFontSize: bodyCs ? parseFloat(bodyCs.fontSize) : 0,
        h1FontSize: h1Cs ? parseFloat(h1Cs.fontSize) : 0,
        h1FontWeight: h1Cs ? parseInt(h1Cs.fontWeight, 10) : 0,
        h2FontSize: h2Cs ? parseFloat(h2Cs.fontSize) : 0,
        h2FontWeight: h2Cs ? parseInt(h2Cs.fontWeight, 10) : 0,
        h3FontSize: h3Cs ? parseFloat(h3Cs.fontSize) : 0,
        ulListStyleType: ulCs ? ulCs.listStyleType : '',
        bqBorderLeftWidth: bqCs ? parseFloat(bqCs.borderLeftWidth) : 0,
        bqBorderLeftStyle: bqCs ? bqCs.borderLeftStyle : '',
        linkTarget: aEl ? aEl.getAttribute('target') : null,
        linkRel: aEl ? aEl.getAttribute('rel') : null,
      };
    });

    // Body font size is typically ~16px
    expect(styles.bodyFontSize).toBeGreaterThan(0);

    // Headings larger than body text
    expect(styles.h1FontSize).toBeGreaterThan(styles.bodyFontSize);
    expect(styles.h2FontSize).toBeGreaterThan(styles.bodyFontSize);
    expect(styles.h3FontSize).toBeGreaterThan(styles.bodyFontSize);

    // Heading weights are bold (>= 600)
    expect(styles.h1FontWeight).toBeGreaterThanOrEqual(600);
    expect(styles.h2FontWeight).toBeGreaterThanOrEqual(600);

    // List bullet is disc
    expect(styles.ulListStyleType).toBe('disc');

    // Blockquote has left border
    expect(styles.bqBorderLeftWidth).toBeGreaterThanOrEqual(3);
    expect(styles.bqBorderLeftStyle).toBe('solid');

    // Links open in new tab with security attributes
    expect(styles.linkTarget).toBe('_blank');
    expect(styles.linkRel).toBe('noopener noreferrer');
  });
});
