import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import defaultInstructionsText from '../../src/data/instructions.default.md?raw';
import sampleMasterInfoText from '../../src/data/master-info.sample.md?raw';
import { resolveInstructions } from '../../src/instructions/split';
import { OUTPUT_LABEL, assemble } from '../../src/prompt/assemble';
import { FIXED_RULES } from '../../src/prompt/fixedRules';
import type { Attachment, JobInputs, OutputKind } from '../../src/types';

describe('Prompt assembly (§12.1, §12.3)', () => {
  const instructions = resolveInstructions(null, defaultInstructionsText);
  const postingDataAnalyst = fs.readFileSync(
    path.resolve(__dirname, '../fixtures/jobs/posting-data-analyst.txt'),
    'utf-8',
  );
  const questionsFixture = fs.readFileSync(
    path.resolve(__dirname, '../fixtures/questions/questions.txt'),
    'utf-8',
  );

  const fakeDate = '2026-10-30';

  const baseInputs: JobInputs = {
    pastedText: postingDataAnalyst,
    attachments: [],
    customInstructions: 'Highlight experience with Tableau and logistics.',
    questions: questionsFixture,
    selectedOutputs: ['RESUME', 'COVER_LETTER', 'LINKEDIN_MESSAGE', 'EMAIL', 'ANSWERS'],
  };

  describe('Snapshots of Part A and Part C for all five output kinds', () => {
    const kinds: OutputKind[] = [
      'RESUME',
      'COVER_LETTER',
      'LINKEDIN_MESSAGE',
      'EMAIL',
      'ANSWERS',
    ];

    for (const kind of kinds) {
      it(`matches Part A and Part C snapshots for ${kind}`, () => {
        const prompt = assemble(
          kind,
          baseInputs,
          sampleMasterInfoText,
          instructions,
          fakeDate,
        );

        expect(prompt.outputKind).toBe(kind);
        expect(prompt.system).toBe(FIXED_RULES);

        const partA = prompt.userParts[0];
        const partC = prompt.userParts[prompt.userParts.length - 1];

        expect(partA.type).toBe('text');
        expect(partC.type).toBe('text');

        if (partA.type === 'text') {
          expect(partA.text).toMatchSnapshot(`Part A - ${kind}`);
        }
        if (partC.type === 'text') {
          expect(partC.text).toMatchSnapshot(`Part C - ${kind}`);
        }
      });
    }
  });

  describe('Block order in Part A and Part C', () => {
    it('orders Part A blocks: instructions, master_info, job_context, (questions for ANSWERS only)', () => {
      const prompt = assemble('RESUME', baseInputs, sampleMasterInfoText, instructions, fakeDate);
      const text = (prompt.userParts[0] as { type: 'text'; text: string }).text;

      const instructionsIdx = text.indexOf('<instructions>');
      const masterInfoIdx = text.indexOf('<master_info>');
      const jobContextIdx = text.indexOf('<job_context>');

      expect(instructionsIdx).toBeGreaterThanOrEqual(0);
      expect(masterInfoIdx).toBeGreaterThan(instructionsIdx);
      expect(jobContextIdx).toBeGreaterThan(masterInfoIdx);
      expect(text).not.toContain('<questions>');
    });

    it('orders Part C blocks: custom_instructions, today, task', () => {
      const prompt = assemble('RESUME', baseInputs, sampleMasterInfoText, instructions, fakeDate);
      const text = (prompt.userParts[1] as { type: 'text'; text: string }).text;

      const customIdx = text.indexOf('<custom_instructions>');
      const todayIdx = text.indexOf('<today>');
      const taskIdx = text.indexOf('<task>');

      expect(customIdx).toBeGreaterThanOrEqual(0);
      expect(todayIdx).toBeGreaterThan(customIdx);
      expect(taskIdx).toBeGreaterThan(todayIdx);
    });
  });

  describe('<questions> block behavior', () => {
    it('appears ONLY for ANSWERS with typed text and never for other kinds', () => {
      const kinds: OutputKind[] = ['RESUME', 'COVER_LETTER', 'LINKEDIN_MESSAGE', 'EMAIL'];
      for (const kind of kinds) {
        const prompt = assemble(kind, baseInputs, sampleMasterInfoText, instructions, fakeDate);
        const text = (prompt.userParts[0] as { type: 'text'; text: string }).text;
        expect(text).not.toContain('<questions>');
      }

      const answersPrompt = assemble('ANSWERS', baseInputs, sampleMasterInfoText, instructions, fakeDate);
      const answersText = (answersPrompt.userParts[0] as { type: 'text'; text: string }).text;
      expect(answersText).toContain('<questions>');
      expect(answersText).toContain('1. Tell me about a time you fixed a data problem');
    });

    it('emits the fallback sentence when questions is empty for ANSWERS', () => {
      const inputsNoQ = { ...baseInputs, questions: '' };
      const answersPrompt = assemble('ANSWERS', inputsNoQ, sampleMasterInfoText, instructions, fakeDate);
      const answersText = (answersPrompt.userParts[0] as { type: 'text'; text: string }).text;
      expect(answersText).toContain(
        '<questions>\n(No typed questions. Answer the questions you find in the attached files in <job_context>.)\n</questions>',
      );
    });
  });

  describe('<custom_instructions> block omission', () => {
    it('omits <custom_instructions> when empty or whitespace', () => {
      const inputsEmptyCustom = { ...baseInputs, customInstructions: '   \n  ' };
      const prompt = assemble('RESUME', inputsEmptyCustom, sampleMasterInfoText, instructions, fakeDate);
      const partC = (prompt.userParts[1] as { type: 'text'; text: string }).text;
      expect(partC).not.toContain('<custom_instructions>');
      expect(partC.startsWith('<today>')).toBe(true);
    });
  });

  describe('Empty job context sentence', () => {
    it('shows empty job context sentence for non-ANSWERS when pasted text and attachments are empty', () => {
      const emptyInputs: JobInputs = {
        pastedText: '   ',
        attachments: [],
        customInstructions: '',
        questions: '',
        selectedOutputs: ['RESUME'],
      };

      const prompt = assemble('RESUME', emptyInputs, sampleMasterInfoText, instructions, fakeDate);
      const partA = (prompt.userParts[0] as { type: 'text'; text: string }).text;
      expect(partA).toContain(
        '<job_context>\n(No job context was provided. Write a general version based on <master_info> and say so in the Gaps note.)\n</job_context>',
      );
    });

    it('for ANSWERS: does NOT show empty job context sentence when questions are present', () => {
      const answersInputsWithQuestionsOnly: JobInputs = {
        pastedText: '',
        attachments: [],
        customInstructions: '',
        questions: '1. Why do you want this role?',
        selectedOutputs: ['ANSWERS'],
      };

      const prompt = assemble(
        'ANSWERS',
        answersInputsWithQuestionsOnly,
        sampleMasterInfoText,
        instructions,
        fakeDate,
      );
      const partA = (prompt.userParts[0] as { type: 'text'; text: string }).text;
      expect(partA).not.toContain('(No job context was provided');
      expect(partA).toContain('<job_context>\n</job_context>');
      expect(partA).toContain('<questions>\n1. Why do you want this role?\n</questions>');
    });

    it('for ANSWERS: shows empty job context sentence ONLY when both job context AND questions are empty', () => {
      const answersInputsEmptyAll: JobInputs = {
        pastedText: '  ',
        attachments: [],
        customInstructions: '',
        questions: '  ',
        selectedOutputs: ['ANSWERS'],
      };

      const prompt = assemble(
        'ANSWERS',
        answersInputsEmptyAll,
        sampleMasterInfoText,
        instructions,
        fakeDate,
      );
      const partA = (prompt.userParts[0] as { type: 'text'; text: string }).text;
      expect(partA).toContain(
        '<job_context>\n(No job context was provided. Write a general version based on <master_info> and say so in the Gaps note.)\n</job_context>',
      );
      expect(partA).toContain(
        '<questions>\n(No typed questions. Answer the questions you find in the attached files in <job_context>.)\n</questions>',
      );
    });
  });

  describe('Attachments handling and binary numbering', () => {
    it('correctly maps docx and text attachments to <document> tags and images/pdfs to numbered <attachment> tags', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          name: 'notes.docx',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          kind: 'docx',
          sizeBytes: 15000,
          text: 'Extracted notes content from docx',
          fingerprint: 'fp1',
          status: 'ready',
        },
        {
          id: '2',
          name: 'diagram.png',
          mime: 'image/png',
          kind: 'image',
          sizeBytes: 8000,
          base64: 'fake-png-base64',
          fingerprint: 'fp2',
          status: 'ready',
        },
        {
          id: '3',
          name: 'specs.txt',
          mime: 'text/plain',
          kind: 'text',
          sizeBytes: 400,
          text: 'Plain text specifications',
          fingerprint: 'fp3',
          status: 'ready',
        },
        {
          id: '4',
          name: 'annual-report.pdf',
          mime: 'application/pdf',
          kind: 'pdf',
          sizeBytes: 50000,
          base64: 'fake-pdf-base64',
          fingerprint: 'fp4',
          status: 'ready',
        },
      ];

      const inputsWithAttachments: JobInputs = {
        ...baseInputs,
        attachments,
      };

      const prompt = assemble(
        'RESUME',
        inputsWithAttachments,
        sampleMasterInfoText,
        instructions,
        fakeDate,
      );

      const partA = (prompt.userParts[0] as { type: 'text'; text: string }).text;

      // Text document blocks
      expect(partA).toContain(
        '<document name="notes.docx" source="docx-extracted-text">\nExtracted notes content from docx\n</document>',
      );
      expect(partA).toContain(
        '<document name="specs.txt" source="text-file">\nPlain text specifications\n</document>',
      );

      // Binary attachment references, numbered from 1 in order
      expect(partA).toContain(
        '<attachment index="1" name="diagram.png" type="image/png">Provided as attached file 1 immediately after this text.</attachment>',
      );
      expect(partA).toContain(
        '<attachment index="2" name="annual-report.pdf" type="application/pdf">Provided as attached file 2 immediately after this text.</attachment>',
      );

      // userParts order: Part A text, image part (index 1), pdf part (index 2), Part C text
      expect(prompt.userParts).toHaveLength(4);
      expect(prompt.userParts[0].type).toBe('text');
      expect(prompt.userParts[1]).toEqual({
        type: 'image',
        mime: 'image/png',
        base64: 'fake-png-base64',
        name: 'diagram.png',
      });
      expect(prompt.userParts[2]).toEqual({
        type: 'pdf',
        base64: 'fake-pdf-base64',
        name: 'annual-report.pdf',
      });
      expect(prompt.userParts[3].type).toBe('text');
    });
  });

  describe('Instructions inclusion and unescaped reference tags', () => {
    it('includes only sections.GLOBAL and sections[kind] in <instructions>', () => {
      const prompt = assemble('EMAIL', baseInputs, sampleMasterInfoText, instructions, fakeDate);
      const partA = (prompt.userParts[0] as { type: 'text'; text: string }).text;

      expect(partA).toContain('<global>');
      expect(partA).toContain(instructions.sections.GLOBAL);
      expect(partA).toContain('<output_specific output="EMAIL">');
      expect(partA).toContain(instructions.sections.EMAIL);

      // Other sections are omitted
      expect(partA).not.toContain('<output_specific output="RESUME">');
      expect(partA).not.toContain('<output_specific output="COVER_LETTER">');
      expect(partA).not.toContain('<output_specific output="LINKEDIN_MESSAGE">');
      expect(partA).not.toContain('<output_specific output="ANSWERS">');
    });

    it('passes through bundled default instructions unchanged without escaping <today> and <questions>', () => {
      const coverPrompt = assemble(
        'COVER_LETTER',
        baseInputs,
        sampleMasterInfoText,
        instructions,
        fakeDate,
      );
      const coverPartA = (coverPrompt.userParts[0] as { type: 'text'; text: string }).text;
      // Default COVER_LETTER instructions contain "{Today's date from <today>, written as Month D, YYYY}"
      expect(coverPartA).toContain('<today>');
      expect(coverPartA).not.toContain('&lt;today>');

      const answersPrompt = assemble(
        'ANSWERS',
        baseInputs,
        sampleMasterInfoText,
        instructions,
        fakeDate,
      );
      const answersPartA = (answersPrompt.userParts[0] as { type: 'text'; text: string }).text;
      // Default ANSWERS instructions contain "Answer every question in <questions>"
      expect(answersPartA).toContain('<questions>');
      expect(answersPartA).not.toContain('&lt;questions>');
    });
  });

  describe('Master Info comments stripping and date injection', () => {
    it('strips HTML comments from Master Info automatically and idempotently', () => {
      const masterInfoWithComments = `<!-- This is a top-level guidance comment -->
# Jane Doe
<!-- Another inline comment -->
Experience: 5 years in Analytics.`;

      const prompt = assemble(
        'RESUME',
        baseInputs,
        masterInfoWithComments,
        instructions,
        fakeDate,
      );
      const partA = (prompt.userParts[0] as { type: 'text'; text: string }).text;

      expect(partA).not.toContain('<!--');
      expect(partA).not.toContain('guidance comment');
      expect(partA).toContain('Experience: 5 years in Analytics.');
    });

    it('injects <today> in Part C with the provided date and correct task label', () => {
      const prompt = assemble('COVER_LETTER', baseInputs, sampleMasterInfoText, instructions, '2026-11-15');
      const partC = (prompt.userParts[1] as { type: 'text'; text: string }).text;

      expect(partC).toContain('<today>2026-11-15</today>');
      expect(partC).toContain(
        `<task>\nWrite the ${OUTPUT_LABEL.COVER_LETTER} now. Follow the HARD RULES and the OUTPUT FORMAT.\n</task>`,
      );
    });

    it('does not trim pasted text', () => {
      const untrimmedPasted = '  \nLeading space and trailing space\n  \n';
      const inputs = { ...baseInputs, pastedText: untrimmedPasted };
      const prompt = assemble('RESUME', inputs, sampleMasterInfoText, instructions, fakeDate);
      const partA = (prompt.userParts[0] as { type: 'text'; text: string }).text;

      expect(partA).toContain(`<pasted_text>\n${untrimmedPasted}\n</pasted_text>`);
    });
  });
});
