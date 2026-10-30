/**
 * Key redaction helper.
 * Spec §13.1: replaces every occurrence of the key (plain, trimmed, and URL-encoded)
 * with '[redacted]'.
 */

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redact(text: string, key?: string): string {
  if (!text || !key) {
    return text;
  }

  const plain = key;
  const trimmed = key.trim();
  const urlEncodedPlain = encodeURIComponent(plain);
  const urlEncodedTrimmed = encodeURIComponent(trimmed);

  // Collect unique non-empty patterns to redact
  const patterns = Array.from(
    new Set([plain, trimmed, urlEncodedPlain, urlEncodedTrimmed].filter((k) => k.length > 0))
  );

  // Sort descending by length so longer matches are replaced first
  patterns.sort((a, b) => b.length - a.length);

  let result = text;
  for (const pattern of patterns) {
    const regex = new RegExp(escapeRegExp(pattern), 'g');
    result = result.replace(regex, '[redacted]');
  }

  return result;
}

