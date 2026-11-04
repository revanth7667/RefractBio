import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { SINGLE_FILE_CSP_POLICY } from '../../scripts/csp';

describe('Single-file build verification (§18.1, A24, V16)', () => {
  const distSingleDir = path.resolve(process.cwd(), 'dist-single');
  const distSingleHtml = path.join(distSingleDir, 'index.html');

  beforeAll(() => {
    if (!fs.existsSync(distSingleHtml)) {
      execSync('npm run build:single', { stdio: 'pipe' });
    }
  });

  it('output directory contains exactly one file (index.html)', () => {
    expect(fs.existsSync(distSingleHtml)).toBe(true);
    const files = fs.readdirSync(distSingleDir);
    expect(files).toEqual(['index.html']);
  });

  it('contains no src= or href= pointing to a local file path', () => {
    const html = fs.readFileSync(distSingleHtml, 'utf-8');
    // Strip inline script and style tags to inspect HTML attributes
    const noScriptsOrStyles = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

    const srcMatches = Array.from(noScriptsOrStyles.matchAll(/\bsrc=["']([^"']+)["']/gi)).map((m) => m[1]);
    const hrefMatches = Array.from(noScriptsOrStyles.matchAll(/\bhref=["']([^"']+)["']/gi)).map((m) => m[1]);

    // Local paths (e.g. ./, ../, /path, file.js, file.css) must not be referenced
    for (const src of srcMatches) {
      expect(src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('https://')).toBe(true);
    }

    for (const href of hrefMatches) {
      expect(
        href.startsWith('#') ||
          href.startsWith('https://') ||
          href.startsWith('mailto:') ||
          href.startsWith('data:')
      ).toBe(true);
    }
  });

  it('contains the single-file CSP meta tag with unsafe-inline script-src and two connect-src origins', () => {
    const html = fs.readFileSync(distSingleHtml, 'utf-8');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain(SINGLE_FILE_CSP_POLICY);
    expect(html).toContain("script-src 'unsafe-inline'");
    expect(html).toContain('connect-src https://api.anthropic.com https://generativelanguage.googleapis.com');
  });

  it('contains mammoth bundle code inlined (stable string search)', () => {
    const html = fs.readFileSync(distSingleHtml, 'utf-8');
    // Stable mammoth strings from mammoth browser bundle
    expect(html).toContain('extractRawText');
    expect(html).toContain('readStyleMap');
  });

  it('contains no spike pages or references in the single-file bundle', () => {
    const html = fs.readFileSync(distSingleHtml, 'utf-8');
    expect(html).not.toContain('spike/index.html');
    expect(html).not.toContain('spike/storage-probe.html');
  });

  it('single-file index.html inlines the three icons as data: URIs and contains no external icon files (§17.1)', () => {
    const html = fs.readFileSync(distSingleHtml, 'utf-8');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,');
    expect(html).toContain('<link rel="apple-touch-icon" href="data:image/png;base64,');
    const files = fs.readdirSync(distSingleDir);
    expect(files).toEqual(['index.html']);
  });
});

