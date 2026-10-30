import { GAPS_DELIMITER_TOKEN } from '../config';

/**
 * All tag prefixes neutralized in user-supplied text per §12.4.
 * Includes both opening and closing forms for all tags used in §12.3.
 */
export const ESCAPED_TAGS = [
  '<instructions',
  '</instructions',
  '<global',
  '</global',
  '<output_specific',
  '</output_specific',
  '<master_info',
  '</master_info',
  '<job_context',
  '</job_context',
  '<pasted_text',
  '</pasted_text',
  '<document',
  '</document',
  '<attachment',
  '</attachment',
  '<questions',
  '</questions',
  '<custom_instructions',
  '</custom_instructions',
  '<today',
  '</today',
  '<task',
  '</task',
] as const;

export const TAG_LIST = ESCAPED_TAGS;

export const PROMPT_TAG_NAMES = [
  'instructions',
  'global',
  'output_specific',
  'master_info',
  'job_context',
  'pasted_text',
  'document',
  'attachment',
  'questions',
  'custom_instructions',
  'today',
  'task',
] as const;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sorted by length descending so longer tag prefixes match first
const SORTED_TAG_PREFIXES = [...ESCAPED_TAGS].sort((a, b) => b.length - a.length);
const TAGS_REGEX = new RegExp(
  SORTED_TAG_PREFIXES.map((prefix) => escapeRegex(prefix)).join('|'),
  'gi',
);

const DELIMITER_REGEX = new RegExp(escapeRegex(GAPS_DELIMITER_TOKEN), 'gi');

/**
 * Neutralizes tags and delimiter occurrences in user-supplied text per §12.4.
 * 1. Replaces occurrences of prompt tags with original casing preserved and `<` replaced with `&lt;`.
 * 2. Replaces occurrences of GAPS_DELIMITER_TOKEN with hyphens replaced by spaces.
 */
export function neutralizeTags(s: string): string {
  if (!s) return s;

  // Rule 1: keep original casing of matched text, turn '<' into '&lt;'
  let result = s.replace(TAGS_REGEX, (match) => match.replace('<', '&lt;'));

  // Rule 2: replace GAPS_DELIMITER_TOKEN with hyphens replaced by spaces
  result = result.replace(DELIMITER_REGEX, (match) => match.replace(/-/g, ' '));

  return result;
}

/**
 * File name variant per §12.4 rule 3: neutralizes tags/delimiters and replaces " with '.
 */
export function neutralizeFileName(name: string): string {
  return neutralizeTags(name).replace(/"/g, "'");
}

export const neutralizeFilename = neutralizeFileName;
