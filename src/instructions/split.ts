import type { InstructionSectionName, ResolvedInstructions } from '../types';

export const SECTION_NAMES: readonly InstructionSectionName[] = [
  'GLOBAL',
  'RESUME',
  'COVER_LETTER',
  'LINKEDIN_MESSAGE',
  'EMAIL',
  'ANSWERS',
] as const;

function isRecognisedHeading(name: string): name is InstructionSectionName {
  return (SECTION_NAMES as readonly string[]).includes(name);
}

function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

interface ParseResult {
  rawSections: Partial<Record<InstructionSectionName, string>>;
  fileOrderWarnings: string[];
}

function parseSectionsRaw(text: string): ParseResult {
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const lines = normalized.split('\n');

  const rawSections: Partial<Record<InstructionSectionName, string[]>> = {};
  const fileOrderWarnings: string[] = [];

  let insideFence = false;
  let currentSection: InstructionSectionName | null = null;
  const seenHeadings = new Set<InstructionSectionName>();
  let ignoringDuplicate = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Toggle fenced code block
    if (trimmed.startsWith('```')) {
      insideFence = !insideFence;
      if (currentSection !== null && !ignoringDuplicate) {
        rawSections[currentSection]?.push(line);
      }
      continue;
    }

    if (!insideFence) {
      const lineTrimEnd = line.trimEnd();

      // Check for exact recognized heading (# NAME)
      let matchedName: InstructionSectionName | null = null;
      for (const name of SECTION_NAMES) {
        if (lineTrimEnd === '# ' + name) {
          matchedName = name;
          break;
        }
      }

      if (matchedName !== null) {
        if (seenHeadings.has(matchedName)) {
          fileOrderWarnings.push(
            `Section # ${matchedName} appears twice; using the first one.`,
          );
          ignoringDuplicate = true;
          currentSection = matchedName;
        } else {
          seenHeadings.add(matchedName);
          ignoringDuplicate = false;
          currentSection = matchedName;
          rawSections[currentSection] = [];
        }
        continue;
      }

      // Check for unrecognised "# " line
      if (line.startsWith('# ')) {
        fileOrderWarnings.push(
          `Heading "${lineTrimEnd}" isn't recognised. Headings must be exactly # GLOBAL, # RESUME, # COVER_LETTER, # LINKEDIN_MESSAGE, # EMAIL, # ANSWERS.`,
        );
        // Its content stays in the preceding section
        if (currentSection !== null && !ignoringDuplicate) {
          rawSections[currentSection]?.push(line);
        }
        continue;
      }
    }

    // Normal line or inside fence
    if (currentSection !== null && !ignoringDuplicate) {
      rawSections[currentSection]?.push(line);
    }
  }

  const resultSections: Partial<Record<InstructionSectionName, string>> = {};
  for (const name of SECTION_NAMES) {
    if (rawSections[name] !== undefined) {
      resultSections[name] = rawSections[name]!.join('\n');
    }
  }

  return {
    rawSections: resultSections,
    fileOrderWarnings,
  };
}

/**
 * Splits instruction file text into the six recognized sections with fallbacks and deterministic warnings.
 * Pure, never throws, no regular expressions except the single comment-stripping pattern.
 */
export function splitInstructions(
  text: string,
  defaultText: string,
): ResolvedInstructions {
  // Strip HTML comments FIRST per SPEC NOTES (c)
  const strippedText = stripComments(text ?? '');
  const strippedDefault = stripComments(defaultText ?? '');

  // Parse default sections for fallback
  const defaultParsed = parseSectionsRaw(strippedDefault);

  // Parse candidate sections
  const { rawSections, fileOrderWarnings } = parseSectionsRaw(strippedText);

  const sections: Record<InstructionSectionName, string> = {
    GLOBAL: '',
    RESUME: '',
    COVER_LETTER: '',
    LINKEDIN_MESSAGE: '',
    EMAIL: '',
    ANSWERS: '',
  };

  const fallbacks: InstructionSectionName[] = [];
  const missingWarnings: string[] = [];

  for (const name of SECTION_NAMES) {
    const rawContent = rawSections[name];
    if (rawContent === undefined || rawContent.trim() === '') {
      fallbacks.push(name);
      missingWarnings.push(
        `Section # ${name} was missing or empty, so the default was used. Check the heading spelling.`,
      );
      sections[name] = defaultParsed.rawSections[name]?.trim() ?? '';
    } else {
      sections[name] = rawContent.trim();
    }
  }

  // Warning order: unrecognised and duplicate warnings in file order,
  // then missing/empty warnings in the order GLOBAL, RESUME, COVER_LETTER, LINKEDIN_MESSAGE, EMAIL, ANSWERS.
  const warnings = [...fileOrderWarnings, ...missingWarnings];

  return {
    sections,
    fallbacks,
    warnings,
  };
}

/**
 * When nothing is stored, use the bundled default with no warnings and no fallbacks (§11.2 rule 8).
 */
export function resolveInstructions(
  stored: { text: string } | null,
  defaultText: string,
): ResolvedInstructions {
  if (stored === null) {
    const strippedDefault = stripComments(defaultText ?? '');
    const { rawSections } = parseSectionsRaw(strippedDefault);
    const sections: Record<InstructionSectionName, string> = {
      GLOBAL: rawSections.GLOBAL?.trim() ?? '',
      RESUME: rawSections.RESUME?.trim() ?? '',
      COVER_LETTER: rawSections.COVER_LETTER?.trim() ?? '',
      LINKEDIN_MESSAGE: rawSections.LINKEDIN_MESSAGE?.trim() ?? '',
      EMAIL: rawSections.EMAIL?.trim() ?? '',
      ANSWERS: rawSections.ANSWERS?.trim() ?? '',
    };
    return {
      sections,
      fallbacks: [],
      warnings: [],
    };
  }

  return splitInstructions(stored.text, defaultText);
}

/**
 * Replaces specified section's content with the default section's content (first occurrence if duplicated;
 * heading line kept); if the section is missing, appends "# NAME\n" plus the default content at the end.
 * All other text is preserved; line endings normalized to \n.
 */
export function resetSection(
  text: string,
  name: InstructionSectionName,
  defaultText: string,
): string {
  const normText = (text ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const normDefault = (defaultText ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');

  // Extract the default content lines for `name` from defaultText
  const defLines = normDefault.split('\n');
  let defInsideFence = false;
  let defFound = false;
  const defContentLines: string[] = [];

  for (const line of defLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      defInsideFence = !defInsideFence;
    } else if (!defInsideFence && line.trimEnd() === `# ${name}`) {
      defFound = true;
      continue;
    } else if (
      !defInsideFence &&
      defFound &&
      line.trimEnd().startsWith('# ') &&
      isRecognisedHeading(line.trimEnd().slice(2).trim())
    ) {
      break;
    }

    if (defFound) {
      defContentLines.push(line);
    }
  }

  // Scan target text
  const lines = normText.split('\n');
  let insideFence = false;
  let inTargetSection = false;
  let targetSectionFound = false;
  const outputLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      insideFence = !insideFence;
    } else if (!insideFence && line.trimEnd().startsWith('# ')) {
      const heading = line.trimEnd().slice(2).trim();
      if (isRecognisedHeading(heading)) {
        if (heading === name && !targetSectionFound) {
          targetSectionFound = true;
          inTargetSection = true;
          outputLines.push(line); // Keep heading line
          // Push default lines
          for (const dLine of defContentLines) {
            outputLines.push(dLine);
          }
          continue;
        } else if (inTargetSection) {
          inTargetSection = false;
        }
      }
    }

    if (!inTargetSection) {
      outputLines.push(line);
    }
  }

  if (!targetSectionFound) {
    // Missing: append "# NAME\n" plus default content at the end
    const trimmedEnd = normText.trimEnd();
    const prefix = trimmedEnd.length > 0 ? `${trimmedEnd}\n\n` : '';
    const defBody = defContentLines.join('\n');
    return `${prefix}# ${name}\n${defBody}`.trimEnd() + '\n';
  }

  return outputLines.join('\n');
}
