import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Hosted build output verification (§18.1)', () => {
  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndexHtml = path.join(distDir, 'index.html');

  it('dist contains only index.html, assets directory, and _headers', () => {
    expect(fs.existsSync(distIndexHtml)).toBe(true);
    const files = fs.readdirSync(distDir).sort();
    expect(files).toEqual(['_headers', 'assets', 'index.html']);
  });

  it('dist contains no spike directory or spike files', () => {
    expect(fs.existsSync(path.join(distDir, 'spike'))).toBe(false);
    expect(fs.existsSync(path.join(distDir, 'spike/index.html'))).toBe(false);
    expect(fs.existsSync(path.join(distDir, 'spike/storage-probe.html'))).toBe(false);
  });

  it('dist/assets contains the three expected icon files (§17.1)', () => {
    const assetsDir = path.join(distDir, 'assets');
    const assetFiles = fs.readdirSync(assetsDir);
    expect(assetFiles.some((f) => f.startsWith('logo-mark-') && f.endsWith('.svg'))).toBe(true);
    expect(assetFiles.some((f) => f.startsWith('favicon-32-') && f.endsWith('.png'))).toBe(true);
    expect(assetFiles.some((f) => f.startsWith('apple-touch-icon-') && f.endsWith('.png'))).toBe(true);
  });

  it('source index.html contains the three icon link tags (§17.1)', () => {
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="./src/assets/logo-mark.svg"');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="32x32" href="./src/assets/favicon-32.png"');
    expect(html).toContain('<link rel="apple-touch-icon" href="./src/assets/apple-touch-icon.png"');
  });
});

