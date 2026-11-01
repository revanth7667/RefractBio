import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { printDocument, getOrCreatePrintRoot } from '../../src/export/print';
import { GAPS_DELIMITER } from '../../src/config';

describe('Print export module (§16.3)', () => {
  let printSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.documentElement.dataset.paper = '';
    const existingRoot = document.getElementById('print-root');
    if (existingRoot) existingRoot.remove();
    const existingStyle = document.getElementById('page-size');
    if (existingStyle) existingStyle.remove();

    printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  afterEach(() => {
    printSpy.mockRestore();
  });

  it('escapes raw HTML such as <script> or <img onerror> in #print-root', () => {
    const maliciousDraft = '# Candidate Name\n<script>alert("pwned")</script>\n<img src="x" onerror="alert(1)" />\nText here.';
    printDocument(maliciousDraft, 'letter', 'RESUME');

    const printRoot = getOrCreatePrintRoot();
    expect(printRoot.innerHTML).toContain('&lt;script&gt;alert("pwned")&lt;/script&gt;');
    expect(printRoot.innerHTML).toContain('&lt;img src="x" onerror="alert(1)" /&gt;');
    expect(printRoot.querySelector('script')).toBeNull();
    expect(printRoot.querySelector('img')).toBeNull();
  });

  it('sets data-paper on documentElement and keeps exactly one @page rule across letter, A4, letter switches', () => {
    printDocument('# Resume draft', 'letter', 'RESUME');
    expect(document.documentElement.dataset.paper).toBe('letter');
    let styles = document.querySelectorAll('style#page-size');
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toBe('@page { size: letter; margin: 1.9cm; }');

    // Switch to A4
    printDocument('# Resume draft', 'a4', 'RESUME');
    expect(document.documentElement.dataset.paper).toBe('a4');
    styles = document.querySelectorAll('style#page-size');
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toBe('@page { size: A4; margin: 1.9cm; }');

    // Switch back to letter
    printDocument('# Resume draft', 'letter', 'RESUME');
    expect(document.documentElement.dataset.paper).toBe('letter');
    styles = document.querySelectorAll('style#page-size');
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toBe('@page { size: letter; margin: 1.9cm; }');
  });

  it('replaces content on consecutive prints, never appending', () => {
    printDocument('# First Print Document', 'letter', 'RESUME');
    const root = getOrCreatePrintRoot();
    expect(root.innerHTML).toContain('First Print Document');

    printDocument('# Second Print Document', 'letter', 'RESUME');
    expect(root.innerHTML).toContain('Second Print Document');
    expect(root.innerHTML).not.toContain('First Print Document');
  });

  it('marks data-kind on #print-root for cover letter and resume', () => {
    printDocument('Dear Team,\n\nCover letter body.', 'letter', 'COVER_LETTER');
    const root = getOrCreatePrintRoot();
    expect(root.dataset.kind).toBe('cover_letter');

    printDocument('# Resume Header', 'letter', 'RESUME');
    expect(root.dataset.kind).toBe('resume');
  });

  it('calls window.print once per invocation', () => {
    expect(printSpy).not.toHaveBeenCalled();
    printDocument('# My Resume', 'letter', 'RESUME');
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('clears #print-root on afterprint event', () => {
    printDocument('# Resume to be cleared', 'letter', 'RESUME');
    const root = getOrCreatePrintRoot();
    expect(root.innerHTML).not.toBe('');

    // Dispatch afterprint event
    window.dispatchEvent(new Event('afterprint'));
    expect(root.innerHTML).toBe('');
  });

  it('never receives Gaps text when editorText is passed', () => {
    const rawModelOutput = `# Jordan Sample\nExperience here.\n${GAPS_DELIMITER}\n- Distinctive Gaps note line`;
    // As SPEC §16.3 dictates, print takes editorText (which excludes the gaps delimiter and note)
    const editorText = rawModelOutput.split(GAPS_DELIMITER)[0].trim();
    printDocument(editorText, 'letter', 'RESUME');

    const root = getOrCreatePrintRoot();
    expect(root.textContent).toContain('Jordan Sample');
    expect(root.textContent).not.toContain(GAPS_DELIMITER);
    expect(root.textContent).not.toContain('Distinctive Gaps note line');
  });

  it('verifies that print.css contains no @page, no url() and no @import', () => {
    const cssPath = path.resolve(__dirname, '../../src/export/print.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    expect(css).not.toMatch(/@page/i);
    expect(css).not.toMatch(/url\s*\(/i);
    expect(css).not.toMatch(/@import/i);
  });
});
