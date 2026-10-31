import { LINKEDIN_VARIANT_LABELS } from '../config';
import type { LinkedInVariants } from '../types';

function matchesLabel(line: string, label: string): boolean {
  let trimmed = line.trim();
  if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length >= 4) {
    trimmed = trimmed.slice(2, -2).trim();
  }
  return trimmed.toLowerCase() === label.toLowerCase();
}

/**
 * Splits LinkedIn draft text into connection note and direct message variants per §12.7 (A29).
 * Pure function:
 * - Labels matched case-insensitively, allowing optional surrounding '**'.
 * - connectionNote = lines after label 1 up to label 2, trimmed.
 * - directMessage = lines after label 2 to the end, trimmed.
 * - found = false if either label is missing or label 2 comes before label 1.
 */
export function splitLinkedInVariants(text: string): LinkedInVariants {
  const lines = text.split(/\r?\n/);
  const [label1, label2] = LINKEDIN_VARIANT_LABELS;

  const label1Index = lines.findIndex((l) => matchesLabel(l, label1));
  const label2Index = lines.findIndex((l) => matchesLabel(l, label2));

  if (label1Index === -1 || label2Index === -1 || label2Index <= label1Index) {
    return {
      found: false,
      connectionNote: '',
      directMessage: '',
    };
  }

  const connectionNote = lines.slice(label1Index + 1, label2Index).join('\n').trim();
  const directMessage = lines.slice(label2Index + 1).join('\n').trim();

  return {
    found: true,
    connectionNote,
    directMessage,
  };
}

/**
 * Checks safety-net badge condition for EMAIL per §12.7:
 * "The draft does not start with Subject:"
 */
export function hasEmailSubject(text: string): boolean {
  return text.trimStart().startsWith('Subject:');
}
