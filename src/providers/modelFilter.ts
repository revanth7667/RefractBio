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
  return patterns.some((p) => Boolean(p) && lower.includes(p.toLowerCase()));
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
    let capabilitySource: 'api-metadata' | 'pattern-guess' | 'none';

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

  // Strip 8-digit dates before matching version to avoid partial date matching
  const textWithoutDate = lower.replace(/\b20\d{6}\b/g, '');

  // First number of the form 5, 5.5 or 5-5 found in the text
  const verMatch = textWithoutDate.match(/(?:^|[\s/_-])v?(\d{1,2})(?:[.-](\d{1,2}))?(?!\d)/);
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

  // 1. Higher major version (descending)
  if (vA.major !== vB.major) return vB.major - vA.major;

  // 2. Higher minor version (descending)
  if (vA.minor !== vB.minor) return vB.minor - vA.minor;

  // 3. Release date (descending)
  if (vA.date !== vB.date) return vB.date - vA.date;

  // 4. Explicit 'latest' tag before one without
  if (vA.hasLatest && !vB.hasLatest) return -1;
  if (!vA.hasLatest && vB.hasLatest) return 1;

  // 5. Fallback: reverse alphanumeric display-name order
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
  // Consider only likelyChat models when building the default list
  const chatModels = models.filter((m) => m.likelyChat);

  const patterns = (hints.defaultPatterns && hints.defaultPatterns[provider]) || [];
  if (patterns.length === 0) {
    return chatModels;
  }

  const defaults: ModelInfo[] = [];
  const seenIds = new Set<string>();

  for (const pat of patterns) {
    if (!pat) continue;
    const patLower = pat.toLowerCase();
    const patWithSpaces = patLower.replace(/-/g, ' ');

    // (a) Exact match on ID, on models/{pattern}, on display name, or on display name with hyphens in the pattern read as spaces
    let candidate = chatModels.find((m) => {
      const idLower = m.id.toLowerCase();
      const nameLower = m.displayName.toLowerCase();
      return (
        idLower === patLower ||
        idLower === `models/${patLower}` ||
        nameLower === patLower ||
        nameLower === patWithSpaces
      );
    });

    // (b) Otherwise the freshest substring match
    if (!candidate) {
      const substringMatches = chatModels.filter((m) => {
        const idLower = m.id.toLowerCase();
        const nameLower = m.displayName.toLowerCase();
        return idLower.includes(patLower) || nameLower.includes(patLower);
      });

      if (substringMatches.length > 0) {
        const sorted = [...substringMatches].sort(compareModelFreshness);
        candidate = sorted[0];
      }
    }

    // (c) Otherwise nothing
    if (candidate && !seenIds.has(candidate.id)) {
      seenIds.add(candidate.id);
      defaults.push(candidate);
    }
  }

  // Fall back to all likelyChat models when the result is empty
  if (defaults.length === 0) {
    return chatModels;
  }

  return defaults;
}
