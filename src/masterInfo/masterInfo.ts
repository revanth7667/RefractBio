import { TEMPLATE_MARKER_TOKEN } from '../config';
import type { EffectiveMasterInfo, MasterInfoFile } from '../types';
import limits from '../data/limits.json';

export function hasTemplateMarker(text: string): boolean {
  return text.includes(TEMPLATE_MARKER_TOKEN);
}

export function stripHtmlComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function resolveEffective(
  stored: MasterInfoFile | null,
  bundledSample: string,
): EffectiveMasterInfo {
  if (stored === null) {
    return {
      text: bundledSample,
      source: 'bundled-sample',
    };
  }
  return {
    text: stored.text,
    source: 'stored',
  };
}

export function lengthNote(
  text: string,
  warnChars: number = limits.masterInfoWarnChars,
): { chars: number } | null {
  if (text.length > warnChars) {
    return { chars: text.length };
  }
  return null;
}

