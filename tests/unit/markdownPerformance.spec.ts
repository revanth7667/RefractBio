import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHelpMarkdownRenderer } from '../../src/ui/help/HelpPage';
import { printDocument } from '../../src/export/print';

describe('Markdown-it security and performance verification (§22.3)', () => {
  let printSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  afterEach(() => {
    printSpy.mockRestore();
    const existingRoot = document.getElementById('print-root');
    if (existingRoot) existingRoot.remove();
  });

  it('renders link-reference-definition-heavy input in linear time under 2000 ms', () => {
    const repetitions = 20000;
    const heavyInput = '[a]: <b>\n'.repeat(repetitions);

    // 1. Help page renderer
    const helpRenderer = createHelpMarkdownRenderer();
    const startHelp = performance.now();
    const helpOutput = helpRenderer.render(heavyInput);
    const durationHelp = performance.now() - startHelp;

    expect(typeof helpOutput).toBe('string');
    expect(durationHelp).toBeLessThan(2000);

    // 2. Print renderer via printDocument
    const startPrint = performance.now();
    printDocument(heavyInput, 'letter', 'RESUME');
    const durationPrint = performance.now() - startPrint;

    const printRoot = document.getElementById('print-root');
    expect(printRoot).toBeTruthy();
    expect(durationPrint).toBeLessThan(2000);
  });
});
