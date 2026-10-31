import limits from '../data/limits.json';
import type { Attachment, ProviderId } from '../types';

export const LARGE_FILE_WARNING =
  'Large files may be slow or rejected by the provider.';

/**
 * Checks whether a single file exceeds perFileMaxBytes (20 MB) per §15.3.
 */
export function checkPerFileMax(file: { name: string; size: number }): {
  ok: boolean;
  error?: string;
} {
  if (file.size > limits.perFileMaxBytes) {
    const limitMb = Math.round(limits.perFileMaxBytes / (1024 * 1024));
    return {
      ok: false,
      error: `${file.name} is over ${limitMb} MB and can't be attached.`,
    };
  }
  return { ok: true };
}

/**
 * Checks whether a file qualifies as a "Large file" (> perFileWarnBytes, 5 MB) per §15.3.
 */
export function isLargeFile(sizeBytes: number): boolean {
  return sizeBytes > limits.perFileWarnBytes;
}

/**
 * Calculates total base64 size of attachments.
 * If base64 is available, uses base64 string length; otherwise estimates with 4/3 multiplier.
 */
export function calculateTotalBase64Bytes(attachments: readonly Attachment[]): number {
  return attachments.reduce((sum, att) => {
    if (att.base64) {
      return sum + att.base64.length;
    }
    // Base64 inflates binary size by about 4/3
    return sum + Math.ceil((att.sizeBytes * 4) / 3);
  }, 0);
}

/**
 * Checks whether sum of base64 sizes exceeds totalWarnBytes (15 MB) per §15.3.
 * Returns notice text or null.
 */
export function checkTotalAttachmentWarning(
  attachments: readonly Attachment[],
): string | null {
  const totalBase64 = calculateTotalBase64Bytes(attachments);
  if (totalBase64 > limits.totalWarnBytes) {
    const mb = (totalBase64 / (1024 * 1024)).toFixed(1).replace(/\.0$/, '');
    return `Attachments total ${mb} MB. Some providers reject large requests.`;
  }
  return null;
}

/**
 * Checks whether adding incoming files exceeds maxAttachments (10) per §15.3.
 */
export function checkMaxAttachments(
  currentCount: number,
  incomingCount: number,
): { allowedCount: number; message?: string } {
  const max = limits.maxAttachments;
  const available = Math.max(0, max - currentCount);
  const allowedCount = Math.min(available, incomingCount);

  if (incomingCount > allowedCount) {
    return {
      allowedCount,
      message: `Only up to ${max} files can be attached. Extra files were not added.`,
    };
  }

  return { allowedCount };
}

/**
 * Pure function checking estimated request bytes against providerMaxRequestBytes (§15.3).
 * When limitBytes is null (current default), returns null.
 */
export function checkProviderRequestSize(
  provider: ProviderId,
  estimatedRequestBytes: number,
  limitBytes: number | null,
): { message: string } | null {
  if (limitBytes === null) {
    return null;
  }

  if (estimatedRequestBytes > limitBytes) {
    const providerName = provider === 'anthropic' ? 'Anthropic' : 'Gemini';
    const mb = Math.round(limitBytes / (1024 * 1024));
    return {
      message: `Too large for ${providerName} (limit about ${mb} MB). Remove some files.`,
    };
  }

  return null;
}
