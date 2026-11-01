import MarkdownIt from 'markdown-it';
import './print.css';
import type { PaperSize, OutputKind } from '../types';

const md = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});

/**
 * Creates or retrieves the dedicated #print-root element.
 */
export function getOrCreatePrintRoot(): HTMLElement {
  let el = document.getElementById('print-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'print-root';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Invokes window.print() through a single exported function so tests can stub it (§16.3).
 */
export function invokePrint(): void {
  window.print();
}

/**
 * Prints the rendered editorText for Resume or Cover Letter per SPEC §16.3:
 * - Renders editorText with markdown-it (html: false, linkify: false, typographer: false).
 * - Replaces content of #print-root (plain DOM assignment, never appends).
 * - Marks kind on #print-root with data-kind attribute.
 * - Sets document.documentElement.dataset.paper to 'letter' or 'a4'.
 * - Sets the text of ONE <style id="page-size"> element (reused) to @page { size: ...; margin: 1.9cm; }.
 * - Listens for afterprint to clear #print-root.
 * - Calls invokePrint() which calls window.print().
 */
export function printDocument(
  editorText: string,
  paperSize: PaperSize,
  kind: OutputKind,
): void {
  const printRoot = getOrCreatePrintRoot();
  const rendered = md.render(editorText);
  printRoot.innerHTML = rendered;
  printRoot.dataset.kind = kind.toLowerCase();

  document.documentElement.dataset.paper = paperSize;

  let styleEl = document.getElementById('page-size') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'page-size';
    document.head.appendChild(styleEl);
  }

  const pageRule = paperSize === 'a4' ? 'A4' : 'letter';
  styleEl.textContent = `@page { size: ${pageRule}; margin: 1.9cm; }`;

  const handleAfterPrint = () => {
    printRoot.innerHTML = '';
    window.removeEventListener('afterprint', handleAfterPrint);
  };
  window.addEventListener('afterprint', handleAfterPrint);

  invokePrint();
}
