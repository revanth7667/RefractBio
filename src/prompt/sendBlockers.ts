import limits from '../data/limits.json';
import { hasTemplateMarker, lengthNote } from '../masterInfo/masterInfo';
import {
  calculateTotalBase64Bytes,
  checkProviderRequestSize,
  checkTotalAttachmentWarning,
} from '../files/sizeChecks';
import type {
  Attachment,
  EffectiveMasterInfo,
  ModelInfo,
  OutputKind,
  ProviderId,
} from '../types';

export interface Blocker {
  message: string;
  action?: 'open-master-info';
}

export interface SendBlockersParams {
  selectedOutputs: readonly OutputKind[];
  effectiveMasterInfo: EffectiveMasterInfo | string;
  pastedText: string;
  questions?: string;
  customInstructions?: string;
  attachments?: readonly Attachment[];
  provider: ProviderId;
  hasApiKey: boolean;
  selectedModel?: string | null;
  modelInfo?: ModelInfo | null;
  hasUnsavedMasterInfo?: boolean;
}

export interface SendBlockersResult {
  blocker: Blocker | null;
  notices: string[];
}

/**
 * Shared predicate determining if the job has any context per SPEC §17.3, §14.6:
 * Pasted text with at least one non-whitespace character,
 * OR at least one attachment whose status is not 'error' (a file that is 'reading' counts).
 */
export function hasJobContext(job: {
  pastedText?: string;
  attachments?: readonly Attachment[];
}): boolean {
  if (job.pastedText && job.pastedText.trim().length > 0) {
    return true;
  }
  if (job.attachments && job.attachments.some((a) => a.status !== 'error')) {
    return true;
  }
  return false;
}

/**
 * Evaluates send blockers and non-blocking notices per SPEC §14.6, §10.4, §10.5, and §15.3.
 * Blocker is the FIRST that applies in exact order; returns { blocker, notices }.
 */
export function sendBlockers(params: SendBlockersParams): SendBlockersResult {
  const {
    selectedOutputs,
    effectiveMasterInfo,
    pastedText,
    questions = '',
    attachments = [],
    provider,
    hasApiKey,
    selectedModel,
    modelInfo,
    hasUnsavedMasterInfo = false,
  } = params;

  const masterInfoText =
    typeof effectiveMasterInfo === 'string'
      ? effectiveMasterInfo
      : effectiveMasterInfo.text;

  let blocker: Blocker | null = null;

  const hasImages = attachments.some((a) => a.kind === 'image');
  const hasPdfs = attachments.some((a) => a.kind === 'pdf');

  // 1. No outputs selected
  if (selectedOutputs.length === 0) {
    blocker = { message: 'Pick at least one output.' };
  }
  // 2. Effective Master Info contains sample marker
  else if (hasTemplateMarker(masterInfoText)) {
    blocker = {
      message:
        'Your Master Info still contains the sample marker on its first line. Replace the sample with your own information and delete that first line, then try again.',
      action: 'open-master-info',
    };
  }
  // 3. Effective Master Info is empty or whitespace
  else if (masterInfoText.trim().length === 0) {
    blocker = { message: 'Your Master Info is empty. Add your details in Settings.' };
  }
  // 4. Answers is selected, Questions box is empty, and there are no attachments
  else if (
    selectedOutputs.includes('ANSWERS') &&
    questions.trim().length === 0 &&
    attachments.length === 0
  ) {
    blocker = {
      message:
        'Add the application questions: paste them, or attach a screenshot or file that contains them.',
    };
  }
  // 5. No API key for selected provider
  else if (!hasApiKey) {
    const providerDisplayName = provider === 'anthropic' ? 'Anthropic' : 'Gemini';
    blocker = { message: `Add your ${providerDisplayName} API key in Settings.` };
  }
  // 6. No model selected
  else if (!selectedModel || selectedModel.trim().length === 0) {
    blocker = { message: 'Choose a model.' };
  }
  // 7. An attachment is reading
  else if (attachments.some((a) => a.status === 'reading')) {
    blocker = { message: 'Still reading files…' };
  }
  // 8. An attachment has error (hard size limits are enforced when files are added in M9)
  else if (attachments.some((a) => a.status === 'error')) {
    blocker = { message: 'Remove the file marked with an error.' };
  }
  // 9. Image/PDF attached and selected model has supportsImages/supportsPdf === 'no'
  else if (
    (hasImages && modelInfo?.supportsImages === 'no') ||
    (hasPdfs && modelInfo?.supportsPdf === 'no')
  ) {
    blocker = {
      message:
        'This model may not read images/PDFs; remove the file or pick another model.',
    };
  }
  // Request size blocker (when providerMaxRequestBytes is non-null)
  else {
    const providerLimit = (limits.providerMaxRequestBytes as Record<string, number | null>)[provider] ?? null;
    if (providerLimit !== null) {
      const totalBase64 = calculateTotalBase64Bytes(attachments);
      const estimatedBytes = pastedText.length + totalBase64 + masterInfoText.length;
      const sizeBlocker = checkProviderRequestSize(provider, estimatedBytes, providerLimit);
      if (sizeBlocker) {
        blocker = sizeBlocker;
      }
    }
  }

  // Notices (non-blocking)
  const notices: string[] = [];

  // Total attachment size warning notice (§15.3)
  const totalWarning = checkTotalAttachmentWarning(attachments);
  if (totalWarning) {
    notices.push(totalWarning);
  }

  // Unknown capability notice
  const isBlockedByCapability = blocker !== null && blocker.message.includes('images/PDFs');
  if (
    !isBlockedByCapability &&
    ((hasImages && modelInfo?.supportsImages === 'unknown') ||
      (hasPdfs && modelInfo?.supportsPdf === 'unknown'))
  ) {
    notices.push(
      "We can't tell whether this model reads images/PDFs. If it fails, remove the file or pick another model.",
    );
  }

  // Pasted text warning notice (§15.3)
  if (pastedText.length > limits.pastedTextWarnChars) {
    notices.push("That's a lot of text; it increases cost and may exceed the model's limit.");
  }

  // Unsaved Master Info notice (§10.5)
  if (hasUnsavedMasterInfo) {
    notices.push('You have unsaved Master Info changes. Save them first to use them.');
  }

  // Master Info length note (§10.4)
  const note = lengthNote(masterInfoText, limits.masterInfoWarnChars);
  if (note !== null) {
    notices.push(
      `Your Master Info is long (about ${note.chars} characters). It is sent with every request, which raises cost and can reduce quality. Consider trimming it.`,
    );
  }

  return { blocker, notices };
}
