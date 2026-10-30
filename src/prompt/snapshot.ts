import { stripHtmlComments } from '../masterInfo/masterInfo';
import type {
  Attachment,
  InputSnapshot,
  JobInputs,
  OutputKind,
  ProviderId,
  ResolvedInstructions,
} from '../types';

export interface SnapshotParams {
  kind: OutputKind;
  masterInfo: string;
  instructions: ResolvedInstructions;
  inputs: Pick<JobInputs, 'pastedText' | 'attachments' | 'customInstructions' | 'questions'>;
  provider: ProviderId;
  model: string;
}

export interface CreateSnapshotParams extends SnapshotParams {
  generatedAt: string;
  attachmentNames?: string[];
}

/**
 * Standard 32-bit FNV-1a hash over UTF-8 bytes.
 * Returns an 8-character hex string.
 */
export function fnv1a32(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Builds the canonical JSON string per §14.4 with exact key order.
 */
export function buildCanonicalSnapshotJson(params: SnapshotParams): string {
  const { kind, masterInfo, instructions, inputs, provider, model } = params;

  const strippedMaster = stripHtmlComments(masterInfo ?? '');
  const globalSection = instructions.sections.GLOBAL ?? '';
  const specificSection = instructions.sections[kind] ?? '';
  const instructionsJoined = `${globalSection}\n---\n${specificSection}`;

  const attachmentFingerprints = (inputs.attachments ?? []).map((a: Attachment) => a.fingerprint);
  const questionsValue = kind === 'ANSWERS' ? (inputs.questions ?? '') : '';

  const canonical = {
    kind,
    masterInfo: strippedMaster,
    instructions: instructionsJoined,
    pastedText: inputs.pastedText ?? '',
    attachments: attachmentFingerprints,
    customInstructions: inputs.customInstructions ?? '',
    questions: questionsValue,
    provider,
    model,
  };

  return JSON.stringify(canonical);
}

/**
 * Computes the 32-bit FNV-1a hex hash of the canonical input snapshot per §14.4.
 * Pure function: deterministic, excludes API key and today's date.
 */
export function computeSnapshotHash(params: SnapshotParams): string {
  const json = buildCanonicalSnapshotJson(params);
  return fnv1a32(json);
}

/**
 * Builds an InputSnapshot object with hash, metadata, and attachment names.
 * pure function: caller passes generatedAt (never read from clock here).
 */
export function createInputSnapshot(params: CreateSnapshotParams): InputSnapshot {
  const hash = computeSnapshotHash(params);
  const attachmentNames =
    params.attachmentNames ??
    (params.inputs.attachments ?? []).map((a: Attachment) => a.name);

  return {
    hash,
    provider: params.provider,
    model: params.model,
    generatedAt: params.generatedAt,
    attachmentNames,
  };
}
