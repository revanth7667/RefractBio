import { GAPS_DELIMITER } from '../config';

export interface GapsSplitResult {
  document: string;
  gaps: string;
  gapsMissing: boolean;
}

/**
 * Splits raw generated output into the main document and gaps note per §12.7.
 * Pure function:
 * - Finds the last line whose trimmed content equals GAPS_DELIMITER.
 * - document = text before it, trimmed; gaps = text after it, trimmed.
 * - If not found: document = full text trimmed, gaps = '', gapsMissing = true.
 */
export function splitGaps(rawText: string): GapsSplitResult {
  const lines = rawText.split(/\r?\n/);
  let delimiterIndex = -1;

  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === GAPS_DELIMITER) {
      delimiterIndex = i;
      break;
    }
  }

  if (delimiterIndex === -1) {
    return {
      document: rawText.trim(),
      gaps: '',
      gapsMissing: true,
    };
  }

  const document = lines.slice(0, delimiterIndex).join('\n').trim();
  const gaps = lines.slice(delimiterIndex + 1).join('\n').trim();

  return {
    document,
    gaps,
    gapsMissing: false,
  };
}

/**
 * Returns user-facing text for the Gaps note per §12.7.
 */
export function formatGapsNotice(gaps: string, gapsMissing: boolean): string {
  if (gapsMissing) {
    return "The model didn't return a Gaps note. Check the draft against your Master Info.";
  }
  if (gaps.trim().toLowerCase() === '- none') {
    return 'No gaps reported.';
  }
  return gaps;
}
