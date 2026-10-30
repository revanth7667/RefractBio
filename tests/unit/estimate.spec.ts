import { describe, expect, it } from 'vitest';
import estimates from '../../src/data/estimates.json';
import { computeEstimate, formatEstimate } from '../../src/prompt/estimate';
import type { Attachment } from '../../src/types';

describe('Pre-send token estimate (§12.6)', () => {
  it('computes textTokens from chars/4 rounded up', () => {
    const system = '1234'; // 4 chars
    const partA = '12345'; // 5 chars
    const partC = '12'; // 2 chars
    // total = 11 chars -> 11 / 4 = 2.75 -> ceil = 3
    const est = computeEstimate(system, partA, partC, []);
    expect(est.textTokens).toBe(3);
    expect(est.imageTokens).toBe(0);
    expect(est.pdfTokens).toBe(0);
    expect(est.total).toBe(3);
  });

  it('computes imageTokens as imageCount * estimates.imageTokens', () => {
    const attachments: Attachment[] = [
      {
        id: '1',
        name: 'sample1.png',
        mime: 'image/png',
        kind: 'image',
        sizeBytes: 1000,
        fingerprint: 'f1',
        status: 'ready',
      },
      {
        id: '2',
        name: 'sample2.jpg',
        mime: 'image/jpeg',
        kind: 'image',
        sizeBytes: 2000,
        fingerprint: 'f2',
        status: 'ready',
      },
    ];

    const est = computeEstimate('sys', 'a', 'c', attachments);
    expect(est.imageTokens).toBe(2 * estimates.imageTokens);
  });

  it('computes pdfTokens from sizeBytes with minimum floor', () => {
    // 0 byte PDF -> floor is pdfMinTokens (500)
    const smallPdf: Attachment = {
      id: 'p1',
      name: 'empty.pdf',
      mime: 'application/pdf',
      kind: 'pdf',
      sizeBytes: 100, // 100 bytes -> ceil(sizeMB * 1500) = 1 -> max(500, 1) = 500
      fingerprint: 'f-p1',
      status: 'ready',
    };

    // 2 MB PDF -> 2 * 1024 * 1024 bytes -> sizeMB = 2 -> ceil(2 * 1500) = 3000 -> max(500, 3000) = 3000
    const largePdf: Attachment = {
      id: 'p2',
      name: 'large.pdf',
      mime: 'application/pdf',
      kind: 'pdf',
      sizeBytes: 2 * 1024 * 1024,
      fingerprint: 'f-p2',
      status: 'ready',
    };

    const est = computeEstimate('sys', 'a', 'c', [smallPdf, largePdf]);
    expect(est.pdfTokens).toBe(500 + 3000);
    expect(est.total).toBe(est.textTokens + est.imageTokens + est.pdfTokens);
  });

  describe('formatEstimate UI string', () => {
    it('formats estimate string without PDFs', () => {
      const formatted = formatEstimate(9800, 3, 0);
      expect(formatted).toBe(
        '≈ 9,800 tokens per output × 3 outputs ≈ 29,400 tokens. Rough estimate; actual usage and cost depend on the provider and model.',
      );
    });

    it('formats estimate string for 1 output', () => {
      const formatted = formatEstimate(5000, 1, 0);
      expect(formatted).toBe(
        '≈ 5,000 tokens per output × 1 output ≈ 5,000 tokens. Rough estimate; actual usage and cost depend on the provider and model.',
      );
    });

    it('appends size-based guess when pdfCount > 0', () => {
      const formatted = formatEstimate(12500, 2, 1);
      expect(formatted).toBe(
        '≈ 12,500 tokens per output × 2 outputs ≈ 25,000 tokens. Rough estimate; actual usage and cost depend on the provider and model. Includes a size-based guess for 1 PDF(s).',
      );
    });

    it('formats thousands separators for large numbers and multiple PDFs', () => {
      const formatted = formatEstimate(100000, 10, 1500);
      expect(formatted).toContain('≈ 100,000 tokens per output × 10 outputs ≈ 1,000,000 tokens.');
      expect(formatted).toContain('Includes a size-based guess for 1,500 PDF(s).');
    });
  });
});
