import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHelpMarkdownRenderer } from '../../src/ui/help/HelpPage';
import { GEMINI_FREE_TIER_NOTE } from '../../src/config';

describe('Help documentation & renderer (SPEC §17.5)', () => {
  const helpMdPath = path.resolve(__dirname, '../../docs/help.md');
  const helpContent = fs.readFileSync(helpMdPath, 'utf-8');

  it('docs/help.md contains no internal IDs matching \\bV\\d+\\b, \\bA\\d+\\b or "M\\d+"', () => {
    const internalIdRegex = /\b[VA]\d+\b|M\d+/;
    const lines = helpContent.split('\n');
    const matchedLines: { line: number; text: string }[] = [];

    lines.forEach((text, i) => {
      if (internalIdRegex.test(text)) {
        matchedLines.push({ line: i + 1, text });
      }
    });

    expect(matchedLines).toEqual([]);
  });

  it('contains the canonical Gemini free-tier paragraph exactly matching src/config.ts', () => {
    expect(helpContent).toContain(GEMINI_FREE_TIER_NOTE);
  });

  it('contains the verified Anthropic commercial terms sentence and link', () => {
    expect(helpContent).toContain('https://www.anthropic.com/legal/commercial-terms');
    expect(helpContent).toContain(
      'Anthropic may not train models on Customer Content from Services',
    );
  });

  it('contains all must-say items from §17.5', () => {
    // Master Info backup note
    expect(helpContent).toMatch(/download a copy of your Master Info|Download backup copies/i);
    // Leading BOM dropped
    expect(helpContent).toMatch(/leading BOM/i);
    // LinkedIn limits
    expect(helpContent).toContain('200 characters');
    expect(helpContent).toContain('3 invitation');
    // Send disabled while queued or generating
    expect(helpContent).toMatch(/Send.*disabled.*generating/i);
    // Printing to PDF must-say text
    expect(helpContent).toContain("choose 'Save as PDF', turn off 'Headers and footers'");
    expect(helpContent).toContain('Chrome and Firefox use the paper size chosen in the app');
    expect(helpContent).toContain('Safari uses the paper size chosen in its own print dialog');
    expect(helpContent).toContain('1.9 cm (0.75 in)');
    // Ctrl/Cmd+Enter shortcut
    expect(helpContent).toContain('Ctrl+Enter');
    expect(helpContent).toContain('Cmd+Enter');
  });

  it('produces no <script> or <img> elements from a hostile fixture string (html: false)', () => {
    const md = createHelpMarkdownRenderer();
    const hostileInput = `
# Title
<script>alert("xss")</script>
<img src="x" onerror="alert(1)" />
<iframe src="https://example.com"></iframe>
[Safe link](https://example.com)
    `.trim();

    const rendered = md.render(hostileInput);

    expect(rendered).not.toContain('<script>');
    expect(rendered).not.toContain('<img');
    expect(rendered).not.toContain('<iframe');
    expect(rendered).toContain('&lt;script&gt;');
    expect(rendered).toContain('&lt;img');
    expect(rendered).toContain('target="_blank"');
    expect(rendered).toContain('rel="noopener noreferrer"');
  });
});
