import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Subpath & Relative Base Verification (V20)', () => {
  it('built dist/index.html uses relative paths for all assets to support subpaths', () => {
    const distIndex = path.resolve(process.cwd(), 'dist/index.html');
    expect(fs.existsSync(distIndex)).toBe(true);

    const html = fs.readFileSync(distIndex, 'utf-8');

    // Matches relative scripts and CSS starting with ./
    const scriptMatches = [...html.matchAll(/src="(\.[^"]+)"/g)].map((m) => m[1]);
    const linkMatches = [...html.matchAll(/href="(\.[^"]+)"/g)].map((m) => m[1]);

    expect(scriptMatches.length).toBeGreaterThan(0);
    expect(linkMatches.length).toBeGreaterThan(0);

    // Verify all relative links start with './' and resolve to existing files on disk
    for (const rel of [...scriptMatches, ...linkMatches]) {
      expect(rel.startsWith('./')).toBe(true);
      const resolved = path.resolve(process.cwd(), 'dist', rel.replace(/^\.\//, ''));
      expect(fs.existsSync(resolved)).toBe(true);
    }
  });

  it('contains no absolute root paths for scripts or styles (e.g. /assets/)', () => {
    const distIndex = path.resolve(process.cwd(), 'dist/index.html');
    const html = fs.readFileSync(distIndex, 'utf-8');

    expect(html).not.toMatch(/src="\/assets\//);
    expect(html).not.toMatch(/href="\/assets\//);
  });
});
