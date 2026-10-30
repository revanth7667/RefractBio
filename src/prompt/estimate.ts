import estimates from '../data/estimates.json';
import type { Attachment, PromptPart, TokenEstimate } from '../types';

export interface ComputeEstimateParams {
  system: string;
  partA: string;
  partC: string;
  attachments?: readonly Attachment[];
}

/**
 * Computes a pre-send token estimate based on §12.6.
 * - textTokens = ceil((len(SYSTEM) + len(PART_A) + len(PART_C)) / charsPerToken)
 * - imageTokens = imageCount * estimates.imageTokens
 * - pdfTokens = sum over PDFs of max(pdfMinTokens, ceil(sizeMB * pdfTokensPerMB))
 */
export function computeEstimate(
  systemOrParams: string | ComputeEstimateParams,
  partA?: string | readonly PromptPart[],
  partC?: string,
  attachments?: readonly Attachment[],
): TokenEstimate {
  let system = '';
  let textPartA = '';
  let textPartC = '';
  let attList: readonly Attachment[] = [];

  if (typeof systemOrParams === 'object' && systemOrParams !== null) {
    system = systemOrParams.system;
    textPartA = systemOrParams.partA;
    textPartC = systemOrParams.partC;
    attList = systemOrParams.attachments ?? [];
  } else {
    system = systemOrParams;
    if (typeof partA === 'string') {
      textPartA = partA;
      textPartC = partC ?? '';
      attList = attachments ?? [];
    } else if (Array.isArray(partA)) {
      // userParts array passed
      const parts = partA as readonly PromptPart[];
      const firstPart = parts[0];
      const lastPart = parts[parts.length - 1];
      textPartA = firstPart && firstPart.type === 'text' ? firstPart.text : '';
      textPartC = lastPart && lastPart.type === 'text' ? lastPart.text : '';
      attList = attachments ?? [];
    }
  }

  const charsPerToken = estimates.charsPerToken;
  const textTokens = Math.ceil((system.length + textPartA.length + textPartC.length) / charsPerToken);

  const imageCount = attList.filter((a) => a.kind === 'image').length;
  const imageTokens = imageCount * estimates.imageTokens;

  const pdfs = attList.filter((a) => a.kind === 'pdf');
  const pdfTokens = pdfs.reduce((acc, pdf) => {
    const sizeBytes = pdf.sizeBytes ?? 0;
    const sizeMB = sizeBytes / (1024 * 1024);
    const cost = Math.max(
      estimates.pdfMinTokens,
      Math.ceil(sizeMB * estimates.pdfTokensPerMB),
    );
    return acc + cost;
  }, 0);

  const total = textTokens + imageTokens + pdfTokens;

  return {
    textTokens,
    imageTokens,
    pdfTokens,
    total,
  };
}

export const estimateTokens = computeEstimate;

/**
 * Returns formatted estimate UI string per §12.6.
 * Formats numbers with thousands separators.
 * Includes the PDF sentence only when pdfCount > 0.
 */
export function formatEstimate(
  perOutputTotal: number,
  outputCount: number,
  pdfCount: number,
): string {
  const perOutputStr = perOutputTotal.toLocaleString('en-US');
  const grandTotal = perOutputTotal * outputCount;
  const grandTotalStr = grandTotal.toLocaleString('en-US');
  const outputsWord = outputCount === 1 ? 'output' : 'outputs';

  let result = `≈ ${perOutputStr} tokens per output × ${outputCount} ${outputsWord} ≈ ${grandTotalStr} tokens. Rough estimate; actual usage and cost depend on the provider and model.`;

  if (pdfCount > 0) {
    result += ` Includes a size-based guess for ${pdfCount.toLocaleString('en-US')} PDF(s).`;
  }

  return result;
}
