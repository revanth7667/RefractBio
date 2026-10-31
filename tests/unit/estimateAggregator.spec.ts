import { describe, it, expect } from 'vitest';
import { aggregateEstimates } from '../../src/prompt/estimate';
import { resolveInstructions } from '../../src/instructions/split';
import defaultInstructionsRaw from '../../src/data/instructions.default.md?raw';
import type { Attachment, JobInputs } from '../../src/types';

describe('aggregateEstimates and formatEstimate (§12.6)', () => {
  const instructions = resolveInstructions(null, defaultInstructionsRaw);
  const masterInfo = '# Jane Doe\nData Analyst at Acme Corp.';
  const today = '2026-10-30';

  const baseInputs: JobInputs = {
    pastedText: 'Job posting for Logistics Analyst',
    attachments: [],
    customInstructions: '',
    questions: '',
    selectedOutputs: ['RESUME', 'COVER_LETTER'],
  };

  it('aggregates estimates across multiple selected outputs with true sum and rounded average', () => {
    const res = aggregateEstimates(
      ['RESUME', 'COVER_LETTER'],
      baseInputs,
      masterInfo,
      instructions,
      today,
    );

    expect(res.perOutput.RESUME).toBeDefined();
    expect(res.perOutput.COVER_LETTER).toBeDefined();

    const sum = res.perOutput.RESUME!.total + res.perOutput.COVER_LETTER!.total;
    expect(res.total).toBe(sum);

    const expectedAverage = Math.round(sum / 2);
    expect(res.perOutputAverage).toBe(expectedAverage);

    expect(res.formattedLine).toContain(
      `≈ ${expectedAverage.toLocaleString('en-US')} tokens per output × 2 outputs ≈ ${sum.toLocaleString('en-US')} tokens.`,
    );
  });

  it('includes size-based guess when PDF attachments are present', () => {
    const pdfAttachment: Attachment = {
      id: 'pdf-1',
      name: 'job-spec.pdf',
      mime: 'application/pdf',
      kind: 'pdf',
      sizeBytes: 1024 * 1024, // 1 MB
      fingerprint: 'f1',
      status: 'ready',
    };

    const inputsWithPdf: JobInputs = {
      ...baseInputs,
      attachments: [pdfAttachment],
    };

    const res = aggregateEstimates(
      ['RESUME'],
      inputsWithPdf,
      masterInfo,
      instructions,
      today,
    );

    expect(res.pdfCount).toBe(1);
    expect(res.formattedLine).toContain('Includes a size-based guess for 1 PDF(s).');
  });

  it('returns empty result when no outputs are selected', () => {
    const res = aggregateEstimates(
      [],
      baseInputs,
      masterInfo,
      instructions,
      today,
    );

    expect(res.total).toBe(0);
    expect(res.perOutputAverage).toBe(0);
    expect(res.formattedLine).toBe('');
    expect(Object.keys(res.perOutput)).toHaveLength(0);
  });
});
