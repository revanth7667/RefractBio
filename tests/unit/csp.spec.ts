import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { cspPlugin, HOSTED_CSP_POLICY } from '../../scripts/csp';

describe('CSP Plugin', () => {
  it('source index.html contains no Content-Security-Policy meta tag', () => {
    const indexPath = path.resolve(process.cwd(), 'index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).not.toContain('Content-Security-Policy');
  });

  it('plugin has apply: "build"', () => {
    const plugin = cspPlugin();
    expect(plugin.apply).toBe('build');
  });

  it('transformIndexHtml adds exactly one CSP meta tag with the hosted policy containing two connect-src origins', () => {
    const plugin = cspPlugin();
    const sourceHtml = `<!DOCTYPE html><html><head><title>Test</title></head><body></body></html>`;

    // Simulate transformIndexHtml hook call
    const transform = plugin.transformIndexHtml;
    expect(typeof transform).toBe('function');

    const transformed = (transform as (html: string) => string)(sourceHtml);
    expect(transformed).toContain('http-equiv="Content-Security-Policy"');
    expect(transformed).toContain('https://api.anthropic.com');
    expect(transformed).toContain('https://generativelanguage.googleapis.com');
    expect(transformed).toContain(HOSTED_CSP_POLICY);

    // Verify it doesn't duplicate if called again
    const secondTransform = (transform as (html: string) => string)(transformed);
    const count = (secondTransform.match(/Content-Security-Policy/g) || []).length;
    expect(count).toBe(1);
  });

  it('built dist/index.html contains exactly one CSP meta tag', () => {
    const distHtmlPath = path.resolve(process.cwd(), 'dist/index.html');
    if (fs.existsSync(distHtmlPath)) {
      const distHtml = fs.readFileSync(distHtmlPath, 'utf-8');
      const count = (distHtml.match(/http-equiv="Content-Security-Policy"/g) || []).length;
      expect(count).toBe(1);
    }
  });
});
