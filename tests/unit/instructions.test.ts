import { describe, it, expect } from 'vitest';
import defaultInstructionsRaw from '../../src/data/instructions.default.md?raw';
import validFixtureRaw from '../fixtures/instructions/valid.md?raw';
import missingSectionFixtureRaw from '../fixtures/instructions/missing-section.md?raw';
import misspelledHeadingFixtureRaw from '../fixtures/instructions/misspelled-heading.md?raw';
import emptyFixtureRaw from '../fixtures/instructions/empty.md?raw';
import {
  splitInstructions,
  resolveInstructions,
  resetSection,
  SECTION_NAMES,
} from '../../src/instructions/split';
import { LINKEDIN_VARIANT_LABELS } from '../../src/config';

describe('Instructions Splitter & Helpers (§11.1, §11.2, §19.3)', () => {
  it('asserts valid.md fixture is byte-identical to bundled default instructions', () => {
    expect(validFixtureRaw).toBe(defaultInstructionsRaw);
  });

  it('bundled default produces zero warnings and zero fallbacks', () => {
    const res = splitInstructions(defaultInstructionsRaw, defaultInstructionsRaw);
    expect(res.warnings).toEqual([]);
    expect(res.fallbacks).toEqual([]);
    for (const name of SECTION_NAMES) {
      expect(res.sections[name].length).toBeGreaterThan(0);
    }
  });

  it('leading comment and html comments are ignored and stripped from section outputs', () => {
    const input = `<!-- Top file guidance comment -->
# GLOBAL
- First global line <!-- inline comment -->
<!-- multiline
comment -->
- Second global line

# RESUME
Resume body

# COVER_LETTER
Letter body

# LINKEDIN_MESSAGE
LinkedIn body

# EMAIL
Email body

# ANSWERS
Answers body
`;
    const res = splitInstructions(input, defaultInstructionsRaw);
    expect(res.warnings).toEqual([]);
    expect(res.fallbacks).toEqual([]);
    expect(res.sections.GLOBAL).toContain('- First global line');
    expect(res.sections.GLOBAL).toContain('- Second global line');
    expect(res.sections.GLOBAL).not.toContain('inline comment');
    expect(res.sections.GLOBAL).not.toContain('Top file guidance comment');
  });

  it('exact-heading split for all six sections', () => {
    const input = `# GLOBAL
Global content
# RESUME
Resume content
# COVER_LETTER
Cover letter content
# LINKEDIN_MESSAGE
LinkedIn content
# EMAIL
Email content
# ANSWERS
Answers content
`;
    const res = splitInstructions(input, defaultInstructionsRaw);
    expect(res.warnings).toEqual([]);
    expect(res.fallbacks).toEqual([]);
    expect(res.sections.GLOBAL).toBe('Global content');
    expect(res.sections.RESUME).toBe('Resume content');
    expect(res.sections.COVER_LETTER).toBe('Cover letter content');
    expect(res.sections.LINKEDIN_MESSAGE).toBe('LinkedIn content');
    expect(res.sections.EMAIL).toBe('Email content');
    expect(res.sections.ANSWERS).toBe('Answers content');
  });

  it('fenced "# " lines are ignored (including "# {Full name}" inside default RESUME)', () => {
    const input = `# GLOBAL
Global content
# RESUME
\`\`\`
# {Full name}
# NOT_A_HEADING
\`\`\`
# COVER_LETTER
Cover letter
# LINKEDIN_MESSAGE
LinkedIn
# EMAIL
Email
# ANSWERS
Answers
`;
    const res = splitInstructions(input, defaultInstructionsRaw);
    expect(res.warnings).toEqual([]);
    expect(res.fallbacks).toEqual([]);
    expect(res.sections.RESUME).toContain('# {Full name}');
    expect(res.sections.RESUME).toContain('# NOT_A_HEADING');
  });

  it('first duplicate wins with the exact warning text from §11.2 rule 3', () => {
    const input = `# GLOBAL
Global first
# GLOBAL
Global second duplicate
# RESUME
Resume content
# COVER_LETTER
Cover letter content
# LINKEDIN_MESSAGE
LinkedIn content
# EMAIL
Email content
# ANSWERS
Answers content
`;
    const res = splitInstructions(input, defaultInstructionsRaw);
    expect(res.sections.GLOBAL).toBe('Global first');
    expect(res.fallbacks).toEqual([]);
    expect(res.warnings).toContain(
      'Section # GLOBAL appears twice; using the first one.',
    );
  });

  it('missing section falls back with exact warning text from §11.2 rule 4', () => {
    const res = splitInstructions(missingSectionFixtureRaw, defaultInstructionsRaw);
    expect(res.fallbacks).toEqual(['EMAIL']);
    expect(res.warnings).toEqual([
      'Section # EMAIL was missing or empty, so the default was used. Check the heading spelling.',
    ]);
    const defRes = splitInstructions(defaultInstructionsRaw, defaultInstructionsRaw);
    expect(res.sections.EMAIL).toBe(defRes.sections.EMAIL);
  });

  it('empty section falls back to default with exact warning text', () => {
    const input = `# GLOBAL
Global content
# RESUME

# COVER_LETTER
Cover letter
# LINKEDIN_MESSAGE
LinkedIn
# EMAIL
Email
# ANSWERS
Answers
`;
    const res = splitInstructions(input, defaultInstructionsRaw);
    expect(res.fallbacks).toContain('RESUME');
    expect(res.warnings).toContain(
      'Section # RESUME was missing or empty, so the default was used. Check the heading spelling.',
    );
    const defRes = splitInstructions(defaultInstructionsRaw, defaultInstructionsRaw);
    expect(res.sections.RESUME).toBe(defRes.sections.RESUME);
  });

  it('misspelled heading warns with exact text and stays in preceding section; section falls back', () => {
    const res = splitInstructions(misspelledHeadingFixtureRaw, defaultInstructionsRaw);
    expect(res.fallbacks).toEqual(['COVER_LETTER']);
    expect(res.warnings).toEqual([
      'Heading "# COVER LETTER" isn\'t recognised. Headings must be exactly # GLOBAL, # RESUME, # COVER_LETTER, # LINKEDIN_MESSAGE, # EMAIL, # ANSWERS.',
      'Section # COVER_LETTER was missing or empty, so the default was used. Check the heading spelling.',
    ]);
    // The content stays in preceding section (RESUME)
    expect(res.sections.RESUME).toContain('# COVER LETTER');
    const defRes = splitInstructions(defaultInstructionsRaw, defaultInstructionsRaw);
    expect(res.sections.COVER_LETTER).toBe(defRes.sections.COVER_LETTER);
  });

  it('empty file falls back all six sections', () => {
    const res = splitInstructions(emptyFixtureRaw, defaultInstructionsRaw);
    expect(res.fallbacks).toEqual([
      'GLOBAL',
      'RESUME',
      'COVER_LETTER',
      'LINKEDIN_MESSAGE',
      'EMAIL',
      'ANSWERS',
    ]);
    expect(res.warnings.length).toBe(6);
    for (const name of SECTION_NAMES) {
      expect(res.warnings).toContain(
        `Section # ${name} was missing or empty, so the default was used. Check the heading spelling.`,
      );
    }
  });

  it('warning order is deterministic: unrecognised and duplicates in file order, then missing/empty in section order', () => {
    const input = `# UNKNOWN_ONE
Some content
# GLOBAL
Global 1
# GLOBAL
Global duplicate
# UNKNOWN_TWO
Content
# RESUME
Resume
`;
    const res = splitInstructions(input, defaultInstructionsRaw);
    expect(res.warnings[0]).toBe(
      'Heading "# UNKNOWN_ONE" isn\'t recognised. Headings must be exactly # GLOBAL, # RESUME, # COVER_LETTER, # LINKEDIN_MESSAGE, # EMAIL, # ANSWERS.',
    );
    expect(res.warnings[1]).toBe(
      'Section # GLOBAL appears twice; using the first one.',
    );
    expect(res.warnings[2]).toBe(
      'Heading "# UNKNOWN_TWO" isn\'t recognised. Headings must be exactly # GLOBAL, # RESUME, # COVER_LETTER, # LINKEDIN_MESSAGE, # EMAIL, # ANSWERS.',
    );
    // Missing sections in order: COVER_LETTER, LINKEDIN_MESSAGE, EMAIL, ANSWERS
    expect(res.warnings.slice(3)).toEqual([
      'Section # COVER_LETTER was missing or empty, so the default was used. Check the heading spelling.',
      'Section # LINKEDIN_MESSAGE was missing or empty, so the default was used. Check the heading spelling.',
      'Section # EMAIL was missing or empty, so the default was used. Check the heading spelling.',
      'Section # ANSWERS was missing or empty, so the default was used. Check the heading spelling.',
    ]);
  });

  it('resolveInstructions: when nothing is stored, uses bundled default with no warnings and no fallbacks (§11.2 rule 8)', () => {
    const res = resolveInstructions(null, defaultInstructionsRaw);
    expect(res.warnings).toEqual([]);
    expect(res.fallbacks).toEqual([]);
    for (const name of SECTION_NAMES) {
      expect(res.sections[name].length).toBeGreaterThan(0);
    }
  });

  it('resetSection replaces existing section, keeping heading line and leaving others untouched', () => {
    const input = `# GLOBAL
Custom global
# RESUME
Custom resume
# COVER_LETTER
Custom cover
# LINKEDIN_MESSAGE
Custom linkedin
# EMAIL
Custom email
# ANSWERS
Custom answers
`;
    const updated = resetSection(input, 'COVER_LETTER', defaultInstructionsRaw);
    const res = splitInstructions(updated, defaultInstructionsRaw);
    const defRes = splitInstructions(defaultInstructionsRaw, defaultInstructionsRaw);

    expect(res.sections.GLOBAL).toBe('Custom global');
    expect(res.sections.RESUME).toBe('Custom resume');
    expect(res.sections.COVER_LETTER).toBe(defRes.sections.COVER_LETTER);
    expect(res.sections.LINKEDIN_MESSAGE).toBe('Custom linkedin');
    expect(res.sections.EMAIL).toBe('Custom email');
    expect(res.sections.ANSWERS).toBe('Custom answers');
  });

  it('resetSection appends "# NAME" plus default content at end when missing', () => {
    const input = `# GLOBAL
Custom global
# RESUME
Custom resume
`;
    const updated = resetSection(input, 'EMAIL', defaultInstructionsRaw);
    expect(updated).toContain('# EMAIL');
    const res = splitInstructions(updated, defaultInstructionsRaw);
    const defRes = splitInstructions(defaultInstructionsRaw, defaultInstructionsRaw);
    expect(res.sections.EMAIL).toBe(defRes.sections.EMAIL);
    expect(res.sections.GLOBAL).toBe('Custom global');
    expect(res.sections.RESUME).toBe('Custom resume');
  });

  it('the two LinkedIn label lines in default file equal LINKEDIN_VARIANT_LABELS from src/config.ts', () => {
    expect(LINKEDIN_VARIANT_LABELS.length).toBe(2);
    for (const label of LINKEDIN_VARIANT_LABELS) {
      expect(defaultInstructionsRaw).toContain(label);
    }
  });

  it('no line in the bundled default consists only of four or more backticks', () => {
    const lines = defaultInstructionsRaw.split('\n').map((l) => l.trim());
    const fourOrMoreBackticks = lines.filter((l) => /^`{4,}$/.test(l));
    expect(fourOrMoreBackticks).toEqual([]);
  });

  it('the number of lines starting with three backticks in the bundled default is even', () => {
    const lines = defaultInstructionsRaw.split('\n').map((l) => l.trim());
    const tripleBacktickLines = lines.filter((l) => l.startsWith('```'));
    expect(tripleBacktickLines.length % 2).toBe(0);
  });

  it('splitInstructions, resolveInstructions, and resetSection never throw on 200 random strings', () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \n\r\t#`-<>';
    for (let i = 0; i < 200; i++) {
      let rand = '';
      const len = Math.floor(Math.random() * 200);
      for (let j = 0; j < len; j++) {
        rand += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      expect(() => splitInstructions(rand, defaultInstructionsRaw)).not.toThrow();
      expect(() => resolveInstructions({ text: rand }, defaultInstructionsRaw)).not.toThrow();
      expect(() => resetSection(rand, 'RESUME', defaultInstructionsRaw)).not.toThrow();
    }
  });
});

