import { describe, it, expect } from 'vitest';
import { scanText, scanRepository } from '../../scripts/secret-scan.mjs';

describe('Secret Scan', () => {
  it('does NOT flag ordinary words and phrases', () => {
    const benignWords = [
      'risk-free guarantee',
      'a task-list of items',
      'desk-top computer',
      'Mr. AIzawa was present',
      'sk-test-fake-0000',
      'sk-test-fake-1234567890abcdef',
      'normal-word-with-hyphens',
    ];

    for (const text of benignWords) {
      const findings = scanText(text);
      expect(findings).toEqual([]);
    }
  });

  it('detects key-shaped strings built dynamically at runtime', () => {
    // Construct fake test strings at runtime so no literal key exists in code
    const fakeKeyA = 'sk-' + 'x'.repeat(40);
    const fakeKeyB = 'AIza' + 'y'.repeat(35);
    const fakePem = '-----BEGIN ' + 'PRIVATE KEY-----';

    const findingsA = scanText(`API_KEY = "${fakeKeyA}"`);
    expect(findingsA.length).toBe(1);
    expect(findingsA[0].preview).toBe('sk-xxx…');

    const findingsB = scanText(`GEMINI_KEY=${fakeKeyB}`);
    expect(findingsB.length).toBe(1);
    expect(findingsB[0].preview).toBe('AIzayy…');

    const findingsPem = scanText(`key:\n${fakePem}\nMIIEvgIBADANBg...`);
    expect(findingsPem.length).toBe(1);
    expect(findingsPem[0].preview.startsWith('-----B')).toBe(true);
  });

  it('reports zero findings across the entire repository of tracked files', () => {
    const repoFindings = scanRepository();
    expect(repoFindings).toEqual([]);
  });
});
