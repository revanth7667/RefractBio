import { describe, it, expect } from 'vitest';
import { splitGaps, formatGapsNotice } from '../../src/generation/gaps';
import { GAPS_DELIMITER } from '../../src/config';

describe('Gaps splitting (src/generation/gaps.ts, §12.7)', () => {
  it('splits document and gaps on the exact delimiter line', () => {
    const raw = `Here is the resume content.\n\n${GAPS_DELIMITER}\n- Missing 5 years of experience with Kubernetes.`;
    const result = splitGaps(raw);

    expect(result.gapsMissing).toBe(false);
    expect(result.document).toBe('Here is the resume content.');
    expect(result.gaps).toBe('- Missing 5 years of experience with Kubernetes.');
  });

  it('finds the last line matching delimiter when multiple delimiters appear', () => {
    const raw = `Draft part 1\n${GAPS_DELIMITER}\nDraft part 2\n${GAPS_DELIMITER}\n- Final gap note`;
    const result = splitGaps(raw);

    expect(result.gapsMissing).toBe(false);
    expect(result.document).toBe(`Draft part 1\n${GAPS_DELIMITER}\nDraft part 2`);
    expect(result.gaps).toBe('- Final gap note');
  });

  it('handles missing delimiter gracefully (gapsMissing: true, empty gaps)', () => {
    const raw = 'Just draft content without any delimiter.';
    const result = splitGaps(raw);

    expect(result.gapsMissing).toBe(true);
    expect(result.document).toBe('Just draft content without any delimiter.');
    expect(result.gaps).toBe('');
  });

  it('trims document and gaps whitespace', () => {
    const raw = `   \n  Padded draft \n\n  ${GAPS_DELIMITER}  \n\n  Padded gaps  \n  `;
    const result = splitGaps(raw);

    expect(result.document).toBe('Padded draft');
    expect(result.gaps).toBe('Padded gaps');
  });

  it('formatGapsNotice formats missing, none, and regular gaps correctly', () => {
    expect(formatGapsNotice('', true)).toBe(
      "The model didn't return a Gaps note. Check the draft against your Master Info.",
    );
    expect(formatGapsNotice('- None', false)).toBe('No gaps reported.');
    expect(formatGapsNotice('- none', false)).toBe('No gaps reported.');
    expect(formatGapsNotice('- NONE', false)).toBe('No gaps reported.');
    expect(formatGapsNotice('- Missing AWS certification', false)).toBe(
      '- Missing AWS certification',
    );
  });
});
