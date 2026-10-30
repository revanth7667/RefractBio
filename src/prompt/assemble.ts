import { stripHtmlComments } from '../masterInfo/masterInfo';
import type {
  AssembledPrompt,
  JobInputs,
  OutputKind,
  PromptPart,
  ResolvedInstructions,
} from '../types';
import { neutralizeFileName, neutralizeTags } from './escape';
import { computeEstimate } from './estimate';
import { FIXED_RULES } from './fixedRules';

export const OUTPUT_LABEL: Record<OutputKind, string> = {
  RESUME: 'resume',
  COVER_LETTER: 'cover letter',
  LINKEDIN_MESSAGE: 'LinkedIn message',
  EMAIL: 'email',
  ANSWERS: 'answers to the questions in <questions>',
};

/**
 * Builds a provider-neutral AssembledPrompt for a given output kind per §12.1 and §12.3.
 * Pure function: deterministic, never reads the clock, never imports React/storage/providers.
 *
 * @param kind The output kind (RESUME, COVER_LETTER, LINKEDIN_MESSAGE, EMAIL, ANSWERS)
 * @param inputs The job inputs in memory (pasted text, attachments, custom instructions, questions)
 * @param masterInfo The effective Master Info text (comments stripped automatically if not already stripped)
 * @param instructions ResolvedInstructions containing sections.GLOBAL and sections[kind]
 * @param today Local date string in YYYY-MM-DD format, injected by the caller
 */
export function assemble(
  kind: OutputKind,
  inputs: JobInputs,
  masterInfo: string,
  instructions: ResolvedInstructions,
  today: string,
): AssembledPrompt {
  // assemble applies stripHtmlComments itself (idempotent), so callers cannot forget.
  const strippedMasterInfo = stripHtmlComments(masterInfo ?? '');
  const escapedMasterInfo = neutralizeTags(strippedMasterInfo);

  // 1. Instructions block: include only GLOBAL and sections[kind] (never escaped per §12.4 and Scope Note b)
  const globalSection = instructions.sections.GLOBAL ?? '';
  const specificSection = instructions.sections[kind] ?? '';

  const instructionsBlock = `<instructions>\n<global>\n${globalSection}\n</global>\n<output_specific output="${kind}">\n${specificSection}\n</output_specific>\n</instructions>`;

  // 2. Master Info block
  const masterInfoBlock = `<master_info>\n${escapedMasterInfo}\n</master_info>`;

  // 3. Job Context block & Binary parts
  const jobContextItems: string[] = [];
  const binaryParts: PromptPart[] = [];

  const rawPasted = inputs.pastedText ?? '';
  const hasPasted = rawPasted.trim() !== '';
  if (hasPasted) {
    // Pasted text is not trimmed (only checked for emptiness after trimming)
    jobContextItems.push(`<pasted_text>\n${neutralizeTags(rawPasted)}\n</pasted_text>`);
  }

  let binaryAttachmentIndex = 1;
  const attachments = inputs.attachments ?? [];

  for (const att of attachments) {
    if (att.kind === 'docx') {
      const escapedName = neutralizeFileName(att.name);
      const textContent = neutralizeTags(att.text ?? '');
      jobContextItems.push(
        `<document name="${escapedName}" source="docx-extracted-text">\n${textContent}\n</document>`,
      );
    } else if (att.kind === 'text') {
      const escapedName = neutralizeFileName(att.name);
      const textContent = neutralizeTags(att.text ?? '');
      jobContextItems.push(
        `<document name="${escapedName}" source="text-file">\n${textContent}\n</document>`,
      );
    } else if (att.kind === 'image') {
      const idx = binaryAttachmentIndex++;
      const escapedName = neutralizeFileName(att.name);
      jobContextItems.push(
        `<attachment index="${idx}" name="${escapedName}" type="${att.mime}">Provided as attached file ${idx} immediately after this text.</attachment>`,
      );
      binaryParts.push({
        type: 'image',
        mime: att.mime,
        base64: att.base64 ?? '',
        name: att.name,
      });
    } else if (att.kind === 'pdf') {
      const idx = binaryAttachmentIndex++;
      const escapedName = neutralizeFileName(att.name);
      jobContextItems.push(
        `<attachment index="${idx}" name="${escapedName}" type="${att.mime}">Provided as attached file ${idx} immediately after this text.</attachment>`,
      );
      binaryParts.push({
        type: 'pdf',
        base64: att.base64 ?? '',
        name: att.name,
      });
    }
    // Unknown attachment kinds are safely skipped
  }

  const hasAttachments = jobContextItems.length > (hasPasted ? 1 : 0);
  const isJobContextEmpty = !hasPasted && !hasAttachments;
  const rawQuestions = inputs.questions ?? '';
  const hasQuestions = rawQuestions.trim() !== '';

  let showEmptyJobContextSentence = false;
  if (kind === 'ANSWERS') {
    // For ANSWERS, empty sentence applies only when both job context and questions are empty
    showEmptyJobContextSentence = isJobContextEmpty && !hasQuestions;
  } else {
    showEmptyJobContextSentence = isJobContextEmpty;
  }

  let jobContextContent = '';
  if (showEmptyJobContextSentence) {
    jobContextContent =
      '(No job context was provided. Write a general version based on <master_info> and say so in the Gaps note.)';
  } else if (jobContextItems.length > 0) {
    jobContextContent = jobContextItems.join('\n');
  }

  const jobContextBlock =
    jobContextContent.length > 0
      ? `<job_context>\n${jobContextContent}\n</job_context>`
      : `<job_context>\n</job_context>`;

  // Part A assembly
  const partAPieces = [instructionsBlock, masterInfoBlock, jobContextBlock];

  // <questions> appears ONLY for ANSWERS
  if (kind === 'ANSWERS') {
    if (hasQuestions) {
      partAPieces.push(`<questions>\n${neutralizeTags(rawQuestions)}\n</questions>`);
    } else {
      partAPieces.push(
        '<questions>\n(No typed questions. Answer the questions you find in the attached files in <job_context>.)\n</questions>',
      );
    }
  }

  const partA = partAPieces.join('\n\n');

  // Part C assembly
  const partCPieces: string[] = [];

  const rawCustom = inputs.customInstructions ?? '';
  if (rawCustom.trim() !== '') {
    partCPieces.push(`<custom_instructions>\n${neutralizeTags(rawCustom)}\n</custom_instructions>`);
  }

  partCPieces.push(`<today>${today}</today>`);

  const taskLabel = OUTPUT_LABEL[kind];
  partCPieces.push(
    `<task>\nWrite the ${taskLabel} now. Follow the HARD RULES and the OUTPUT FORMAT.\n</task>`,
  );

  const partC = partCPieces.join('\n\n');

  // User parts: Part A text, binary parts in order, Part C text
  const userParts: PromptPart[] = [
    { type: 'text', text: partA },
    ...binaryParts,
    { type: 'text', text: partC },
  ];

  const system = FIXED_RULES;
  const estimate = computeEstimate(system, partA, partC, inputs.attachments);

  return {
    outputKind: kind,
    system,
    userParts,
    estimate,
  };
}
