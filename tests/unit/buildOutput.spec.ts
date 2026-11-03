import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('Hosted build output verification (§18.1)', () => {
  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndexHtml = path.join(distDir, 'index.html');

  beforeAll(() => {
    if (!fs.existsSync(distIndexHtml)) {
      execSync('npm run build', { stdio: 'pipe' });
    }
  });

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
});

