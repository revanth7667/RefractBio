/**
 * Model filtering and capability inference.
 * Spec §13.4.
 */

import type { ModelInfo, ProviderId, CapabilityGuess } from '../types';
import defaultModelHints from '../data/model-hints.json';

export interface ModelHints {
  nonChatIdPatterns: string[];
  smallTierIdPatterns: string[];
  imageCapableIdPatterns: string[];
  noImageIdPatterns: string[];
  pdfCapableIdPatterns: string[];
  recommended: Record<string, string[]>;
  defaultPatterns?: Record<string, string[]>;
}

export interface RawModelInput {
  id: string;
  displayName?: string;
  provider: ProviderId;
  supportedGenerationMethods?: string[];
  capabilities?: {
    image_input?: { supported?: boolean };
    pdf_input?: { supported?: boolean };
    [key: string]: unknown;
  };
}

function matchesAnyPattern(id: string, patterns: string[]): boolean {
  const lower = id.toLowerCase();
  return patterns.some((p) => {
    if (!p) return false;
    const patLower = p.toLowerCase();
    if (patLower === 'mini') {
      // Avoid matching 'mini' inside the provider name 'gemini'
      const withoutGemini = lower.replace(/gemini/g, '');
      return withoutGemini.includes('mini');
    }
    return lower.includes(patLower);
  });
}

export function filterAndEnrichModels(
  rawList: RawModelInput[],
  provider: ProviderId,
  hints: ModelHints = defaultModelHints as ModelHints
): ModelInfo[] {
  const nonChatPatterns = hints.nonChatIdPatterns || [];
  const smallTierPatterns = hints.smallTierIdPatterns || [];
  const imageCapablePatterns = hints.imageCapableIdPatterns || [];
  const noImagePatterns = hints.noImageIdPatterns || [];
  const pdfCapablePatterns = hints.pdfCapableIdPatterns || [];
  const recommendedList = (hints.recommended && hints.recommended[provider]) || [];

  const enriched: ModelInfo[] = rawList.map((raw) => {
    const id = raw.id;
    const displayName = raw.displayName || id;

    // 1. Determine likelyChat
    let likelyChat = true;
    if (matchesAnyPattern(id, nonChatPatterns)) {
      likelyChat = false;
    } else if (provider === 'gemini') {
      // Gemini models must support "generateContent" to be considered likelyChat
      const methods = raw.supportedGenerationMethods || [];
      if (!methods.some((m) => m.toLowerCase() === 'generatecontent')) {
        likelyChat = false;
      }
    }

    // 2. Determine capabilities & capabilitySource
    let supportsImages: CapabilityGuess = 'unknown';
    let supportsPdf: CapabilityGuess = 'unknown';
    let capabilitySource: 'api-metadata' | 'pattern-guess' | 'none' = 'none';

    if (raw.capabilities) {
      capabilitySource = 'api-metadata';

      // Check image capability: strictly read nested capabilities.image_input.supported
      const img = raw.capabilities.image_input;
      if (img && typeof img === 'object' && typeof img.supported === 'boolean') {
        supportsImages = img.supported ? 'yes' : 'no';
      } else {
        supportsImages = 'unknown';
      }

      // Check pdf capability: strictly read nested capabilities.pdf_input.supported
      const pdf = raw.capabilities.pdf_input;
      if (pdf && typeof pdf === 'object' && typeof pdf.supported === 'boolean') {
        supportsPdf = pdf.supported ? 'yes' : 'no';
      } else {
        supportsPdf = 'unknown';
      }
    } else {
      // Pattern fallback
      let patternUsed = false;
      if (matchesAnyPattern(id, imageCapablePatterns)) {
        supportsImages = 'yes';
        patternUsed = true;
      } else if (matchesAnyPattern(id, noImagePatterns)) {
        supportsImages = 'no';
        patternUsed = true;
      }

      if (matchesAnyPattern(id, pdfCapablePatterns)) {
        supportsPdf = 'yes';
        patternUsed = true;
      }

      capabilitySource = patternUsed ? 'pattern-guess' : 'none';
    }

    // 3. Determine smallTierGuess
    const smallTierGuess = matchesAnyPattern(id, smallTierPatterns);

    return {
      id,
      displayName,
      provider,
      likelyChat,
      supportsImages,
      supportsPdf,
      capabilitySource,
      smallTierGuess,
    };
  });

  // Sort: recommended first (in recommended order), then alphabetically by displayName
  return enriched.sort((a, b) => {
    const idxA = recommendedList.indexOf(a.id);
    const idxB = recommendedList.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function extractModelVersion(text: string): {
  major: number;
  minor: number;
  date: number;
  hasLatest: boolean;
} {
  const lower = text.toLowerCase();
  const hasLatest = lower.includes('latest');

  // Match 8-digit date e.g. 20241022 or 20250929
  const dateMatch = lower.match(/\b(20\d{6})\b/);
  const date = dateMatch ? parseInt(dateMatch[1], 10) : 0;

  // Generic pattern: word boundary or separator followed by version: e.g. "5.5", "5-5", "v5.5", "4.8", "3.5"
  // Negative lookahead (?!\d) prevents 8-digit dates (e.g. 20241022) from matching as a 2-digit version
  const verMatch = lower.match(/(?:^|[\s/_-])v?(\d{1,2})(?:[.-](\d{1,2}))?(?!\d)/);
  if (verMatch) {
    const major = parseInt(verMatch[1], 10);
    const minor = verMatch[2] ? parseInt(verMatch[2], 10) : 0;
    return { major, minor, date, hasLatest };
  }

  return { major: 0, minor: 0, date, hasLatest };
}

export function compareModelFreshness(a: ModelInfo, b: ModelInfo): number {
  const vA = extractModelVersion(`${a.displayName} ${a.id}`);
  const vB = extractModelVersion(`${b.displayName} ${b.id}`);

  // 1. Explicit 'latest' tag
  if (vA.hasLatest && !vB.hasLatest) return -1;
  if (!vA.hasLatest && vB.hasLatest) return 1;

  // 2. Major version (descending)
  if (vA.major !== vB.major) return vB.major - vA.major;

  // 3. Minor version (descending)
  if (vA.minor !== vB.minor) return vB.minor - vA.minor;

  // 4. Release date (descending)
  if (vA.date !== vB.date) return vB.date - vA.date;

  // 5. Fallback: localeCompare descending so higher alphanumeric sorts first
  return b.displayName.localeCompare(a.displayName, undefined, { numeric: true });
}

/**
 * Filters models to default choices when "Show all models" is unchecked:
 * Reads `defaultPatterns` per provider purely as data from `model-hints.json`.
 * If patterns are empty or nothing matches, falls back to all chat models.
 */
export function getDefaultModels(
  models: ModelInfo[],
  provider: ProviderId,
  hints: ModelHints = defaultModelHints as ModelHints
): ModelInfo[] {
  const patterns = (hints.defaultPatterns && hints.defaultPatterns[provider]) || [];
  if (patterns.length === 0) {
    return models.filter((m) => m.likelyChat);
  }

  const defaults: ModelInfo[] = [];

  for (const pat of patterns) {
    const patLower = pat.toLowerCase();

    // 1. Exact match by ID or displayName (e.g. 'gemini-flash-latest', 'Gemini Flash Latest', 'models/gemini-flash-latest')
    const exactMatch = models.find(
      (m) =>
        m.id.toLowerCase() === patLower ||
        m.id.toLowerCase() === `models/${patLower}` ||
        m.displayName.toLowerCase() === patLower ||
        m.displayName.toLowerCase() === patLower.replace(/-/g, ' ')
    );

    if (exactMatch) {
      defaults.push(exactMatch);
      continue;
    }

    // 2. Family / pattern filter (e.g. 'sonnet', 'haiku', 'opus', 'gemini-flash-latest')
    const matching = models.filter((m) => {
      const text = (m.displayName + ' ' + m.id).toLowerCase();
      if (text.includes(patLower)) return true;

      const tokens = patLower.split('-').filter((t) => t !== 'gemini');
      const requiresLite = tokens.includes('lite') || tokens.includes('8b');
      const hasLite = text.includes('lite') || text.includes('8b');

      if (requiresLite && !hasLite) return false;
      if (!requiresLite && tokens.includes('flash') && hasLite) return false;

      return (
        tokens.length > 0 &&
        tokens.every((t) => {
          if (t === 'lite' || t === '8b') return true;
          return text.includes(t);
        })
      );
    });

    if (matching.length > 0) {
      const sorted = [...matching].sort(compareModelFreshness);
      defaults.push(sorted[0]);
    }
  }

  // If nothing matched, show all chat models
  if (defaults.length === 0) {
    return models.filter((m) => m.likelyChat);
  }

  return defaults;
}
