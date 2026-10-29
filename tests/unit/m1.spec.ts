import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Milestone 1 — Provider Connectivity Spike Verification', () => {
  it('docs/provider-findings.md exists and contains all 22 verification items (V1 to V22)', () => {
    const findingsPath = path.resolve(process.cwd(), 'docs/provider-findings.md');
    expect(fs.existsSync(findingsPath)).toBe(true);

    const content = fs.readFileSync(findingsPath, 'utf-8');
    for (let i = 1; i <= 22; i++) {
      const itemPattern = new RegExp(`\\*\\*V${i}\\*\\*`);
      expect(content).toMatch(itemPattern);
    }
  });

  it('job fixtures exist and are non-empty', () => {
    const pngPath = path.resolve(process.cwd(), 'tests/fixtures/jobs/posting.png');
    const pdfPath = path.resolve(process.cwd(), 'tests/fixtures/jobs/posting.pdf');

    expect(fs.existsSync(pngPath)).toBe(true);
    expect(fs.existsSync(pdfPath)).toBe(true);

    expect(fs.statSync(pngPath).size).toBeGreaterThan(0);
    expect(fs.statSync(pdfPath).size).toBeGreaterThan(0);
  });

  it('spike files exist', () => {
    const spikeHtml = path.resolve(process.cwd(), 'spike/index.html');
    const spikeTs = path.resolve(process.cwd(), 'spike/spike.ts');
    const storageProbeHtml = path.resolve(process.cwd(), 'spike/storage-probe.html');

    expect(fs.existsSync(spikeHtml)).toBe(true);
    expect(fs.existsSync(spikeTs)).toBe(true);
    expect(fs.existsSync(storageProbeHtml)).toBe(true);
  });
});
