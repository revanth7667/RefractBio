import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { sendBlockers, hasJobContext, type SendBlockersParams } from '../../src/prompt/sendBlockers';
import { TEMPLATE_MARKER_TOKEN } from '../../src/config';
import type { Attachment, ModelInfo } from '../../src/types';
import { EmptyDraftsState } from '../../src/ui/outputs/EmptyDraftsState';
import { SettingsProvider } from '../../src/state/SettingsContext';
import { MasterInfoProvider } from '../../src/state/MasterInfoContext';
import { JobProvider, useJob } from '../../src/state/JobContext';

describe('sendBlockers (§14.6, §10.4, §10.5, §15.3)', () => {
  const validMasterInfo = '# Jordan Smith\nData Analyst with experience in SQL and reporting.';
  const sampleWithMarker = `<!-- ${TEMPLATE_MARKER_TOKEN}: delete this line -->\n# Sample Person`;

  const defaultModel: ModelInfo = {
    id: 'claude-3-5-sonnet',
    displayName: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    likelyChat: true,
    supportsImages: 'yes',
    supportsPdf: 'yes',
    capabilitySource: 'api-metadata',
    smallTierGuess: false,
  };

  const createBaseParams = (overrides?: Partial<SendBlockersParams>): SendBlockersParams => ({
    selectedOutputs: ['RESUME', 'COVER_LETTER'],
    effectiveMasterInfo: validMasterInfo,
    pastedText: 'Job posting context text',
    questions: '',
    customInstructions: '',
    attachments: [],
    provider: 'anthropic',
    hasApiKey: true,
    selectedModel: 'claude-3-5-sonnet',
    modelInfo: defaultModel,
    hasUnsavedMasterInfo: false,
    ...overrides,
  });

  describe('Every blocker in order with exact messages (§14.6)', () => {
    it('1. Blocks when no outputs are selected', () => {
      const res = sendBlockers(createBaseParams({ selectedOutputs: [] }));
      expect(res.blocker).toEqual({ message: 'Pick at least one output.' });
    });

    it('2. Blocks when effective Master Info contains sample marker and includes open-master-info action', () => {
      const res = sendBlockers(createBaseParams({ effectiveMasterInfo: sampleWithMarker }));
      expect(res.blocker).toEqual({
        message:
          'Your Master Info still contains the sample marker on its first line. Replace the sample with your own information and delete that first line, then try again.',
        action: 'open-master-info',
      });
    });

    it('3. Blocks when effective Master Info is empty or whitespace', () => {
      const res = sendBlockers(createBaseParams({ effectiveMasterInfo: '   \n\t  ' }));
      expect(res.blocker).toEqual({
        message: 'Your Master Info is empty. Add your details in Settings.',
      });
    });

    it('4. Blocks when Answers is selected, Questions box is empty, and there are no attachments', () => {
      const res = sendBlockers(
        createBaseParams({
          selectedOutputs: ['RESUME', 'ANSWERS'],
          questions: '   ',
          attachments: [],
        }),
      );
      expect(res.blocker).toEqual({
        message:
          'Add the application questions: paste them, or attach a screenshot or file that contains them.',
      });
    });

    it('4b. Allows Answers when Questions box is empty but an attachment is present', () => {
      const syntheticAttachment: Attachment = {
        id: '1',
        name: 'questions.png',
        mime: 'image/png',
        kind: 'image',
        sizeBytes: 1234,
        fingerprint: 'fp1',
        status: 'ready',
      };

      const res = sendBlockers(
        createBaseParams({
          selectedOutputs: ['ANSWERS'],
          questions: '',
          attachments: [syntheticAttachment],
        }),
      );
      expect(res.blocker).toBeNull();
    });

    it('5. Blocks when API key is missing for selected provider (Anthropic)', () => {
      const res = sendBlockers(createBaseParams({ provider: 'anthropic', hasApiKey: false }));
      expect(res.blocker).toEqual({
        message: 'Add your Anthropic API key in Settings.',
      });
    });

    it('5. Blocks when API key is missing for selected provider (Gemini)', () => {
      const res = sendBlockers(createBaseParams({ provider: 'gemini', hasApiKey: false }));
      expect(res.blocker).toEqual({
        message: 'Add your Gemini API key in Settings.',
      });
    });

    it('6. Blocks when no model is selected', () => {
      const res = sendBlockers(createBaseParams({ selectedModel: '' }));
      expect(res.blocker).toEqual({ message: 'Choose a model.' });
    });

    it('7. Blocks when an attachment is reading', () => {
      const readingAttachment: Attachment = {
        id: '1',
        name: 'notes.pdf',
        mime: 'application/pdf',
        kind: 'pdf',
        sizeBytes: 5000,
        fingerprint: 'fp-read',
        status: 'reading',
      };

      const res = sendBlockers(createBaseParams({ attachments: [readingAttachment] }));
      expect(res.blocker).toEqual({ message: 'Still reading files…' });
    });

    it('8. Blocks when an attachment has status error', () => {
      const errorAttachment: Attachment = {
        id: '1',
        name: 'corrupt.pdf',
        mime: 'application/pdf',
        kind: 'pdf',
        sizeBytes: 5000,
        fingerprint: 'fp-err',
        status: 'error',
      };

      const res = sendBlockers(createBaseParams({ attachments: [errorAttachment] }));
      expect(res.blocker).toEqual({ message: 'Remove the file marked with an error.' });
    });

    it('9. Blocks when an image is attached and the selected model has supportsImages === "no"', () => {
      const imageAttachment: Attachment = {
        id: '1',
        name: 'screenshot.png',
        mime: 'image/png',
        kind: 'image',
        sizeBytes: 2000,
        fingerprint: 'fp-img',
        status: 'ready',
      };

      const modelNoImages: ModelInfo = {
        ...defaultModel,
        supportsImages: 'no',
      };

      const res = sendBlockers(
        createBaseParams({
          attachments: [imageAttachment],
          modelInfo: modelNoImages,
        }),
      );
      expect(res.blocker).toEqual({
        message: 'This model may not read images/PDFs; remove the file or pick another model.',
      });
    });

    it('9b. Blocks when a PDF is attached and the selected model has supportsPdf === "no"', () => {
      const pdfAttachment: Attachment = {
        id: '1',
        name: 'document.pdf',
        mime: 'application/pdf',
        kind: 'pdf',
        sizeBytes: 2000,
        fingerprint: 'fp-pdf',
        status: 'ready',
      };

      const modelNoPdf: ModelInfo = {
        ...defaultModel,
        supportsPdf: 'no',
      };

      const res = sendBlockers(
        createBaseParams({
          attachments: [pdfAttachment],
          modelInfo: modelNoPdf,
        }),
      );
      expect(res.blocker).toEqual({
        message: 'This model may not read images/PDFs; remove the file or pick another model.',
      });
    });
  });

  describe('First wins precedence rule', () => {
    it('blocker 1 (no outputs) beats blocker 2 (sample marker)', () => {
      const res = sendBlockers(
        createBaseParams({
          selectedOutputs: [],
          effectiveMasterInfo: sampleWithMarker,
        }),
      );
      expect(res.blocker?.message).toBe('Pick at least one output.');
    });

    it('blocker 2 (sample marker) beats blocker 5 (no key)', () => {
      const res = sendBlockers(
        createBaseParams({
          effectiveMasterInfo: sampleWithMarker,
          hasApiKey: false,
        }),
      );
      expect(res.blocker?.message).toContain('sample marker');
    });

    it('blocker 4 (answers questions) beats blocker 5 (no key)', () => {
      const res = sendBlockers(
        createBaseParams({
          selectedOutputs: ['ANSWERS'],
          questions: '',
          hasApiKey: false,
        }),
      );
      expect(res.blocker?.message).toBe(
        'Add the application questions: paste them, or attach a screenshot or file that contains them.',
      );
    });

    it('blocker 5 (no key) beats blocker 6 (no model)', () => {
      const res = sendBlockers(
        createBaseParams({
          hasApiKey: false,
          selectedModel: '',
        }),
      );
      expect(res.blocker?.message).toBe('Add your Anthropic API key in Settings.');
    });

    it('blocker 7 (reading file) beats blocker 8 (error file)', () => {
      const reading: Attachment = {
        id: '1',
        name: 'read.pdf',
        mime: 'application/pdf',
        kind: 'pdf',
        sizeBytes: 100,
        fingerprint: 'f1',
        status: 'reading',
      };
      const error: Attachment = {
        id: '2',
        name: 'err.pdf',
        mime: 'application/pdf',
        kind: 'pdf',
        sizeBytes: 100,
        fingerprint: 'f2',
        status: 'error',
      };

      const res = sendBlockers(createBaseParams({ attachments: [reading, error] }));
      expect(res.blocker?.message).toBe('Still reading files…');
    });
  });

  describe('Non-blocking Notices', () => {
    it('shows notice when capability is "unknown" with images/PDFs attached', () => {
      const imageAttachment: Attachment = {
        id: '1',
        name: 'pic.png',
        mime: 'image/png',
        kind: 'image',
        sizeBytes: 200,
        fingerprint: 'f-img',
        status: 'ready',
      };
      const unknownModel: ModelInfo = {
        ...defaultModel,
        supportsImages: 'unknown',
      };

      const res = sendBlockers(
        createBaseParams({
          attachments: [imageAttachment],
          modelInfo: unknownModel,
        }),
      );

      expect(res.blocker).toBeNull();
      expect(res.notices).toContain(
        "We can't tell whether this model reads images/PDFs. If it fails, remove the file or pick another model.",
      );
    });

    it('shows notice when pastedText exceeds pastedTextWarnChars (100,000)', () => {
      const longPastedText = 'x'.repeat(100001);
      const res = sendBlockers(createBaseParams({ pastedText: longPastedText }));

      expect(res.notices).toContain(
        "That's a lot of text; it increases cost and may exceed the model's limit.",
      );
    });

    it('shows notice when hasUnsavedMasterInfo is true (§10.5)', () => {
      const res = sendBlockers(createBaseParams({ hasUnsavedMasterInfo: true }));
      expect(res.notices).toContain(
        'You have unsaved Master Info changes. Save them first to use them.',
      );
    });

    it('shows lengthNote notice when Master Info exceeds masterInfoWarnChars (20,000) (§10.4)', () => {
      const longMasterInfo = 'a'.repeat(25000);
      const res = sendBlockers(createBaseParams({ effectiveMasterInfo: longMasterInfo }));

      expect(
        res.notices.some((n) =>
          n.includes('Your Master Info is long (about 25000 characters)'),
        ),
      ).toBe(true);
    });
  });

  describe('hasJobContext predicate (§17.3, §14.6)', () => {
    const makeAttachment = (status: 'ready' | 'reading' | 'error'): Attachment => ({
      id: 'att-1',
      name: 'posting.pdf',
      mime: 'application/pdf',
      kind: 'pdf',
      sizeBytes: 2048,
      fingerprint: 'fp-1',
      status,
    });

    it('returns true for text only with non-whitespace characters', () => {
      expect(hasJobContext({ pastedText: 'Software Engineer posting' })).toBe(true);
    });

    it('returns true for file only when status is ready', () => {
      expect(
        hasJobContext({
          pastedText: '',
          attachments: [makeAttachment('ready')],
        }),
      ).toBe(true);
    });

    it('returns true for file only when status is reading', () => {
      expect(
        hasJobContext({
          pastedText: '',
          attachments: [makeAttachment('reading')],
        }),
      ).toBe(true);
    });

    it('returns false for file only when status is error (no tick)', () => {
      expect(
        hasJobContext({
          pastedText: '',
          attachments: [makeAttachment('error')],
        }),
      ).toBe(false);
    });

    it('returns true when both non-whitespace text and attachments are present', () => {
      expect(
        hasJobContext({
          pastedText: 'Senior developer role',
          attachments: [makeAttachment('ready')],
        }),
      ).toBe(true);
    });

    it('returns false when neither text nor attachments are present', () => {
      expect(
        hasJobContext({
          pastedText: '',
          attachments: [],
        }),
      ).toBe(false);
    });

    it('returns false for whitespace-only text with no valid attachments', () => {
      expect(
        hasJobContext({
          pastedText: '   \n\t  ',
          attachments: [],
        }),
      ).toBe(false);
      expect(
        hasJobContext({
          pastedText: '   \n\t  ',
          attachments: [makeAttachment('error')],
        }),
      ).toBe(false);
    });

    it('component test: empty state shows the tick for a files-only job (§17.3)', async () => {
      function EmptyStateFilesHelper() {
        const { addFiles } = useJob();
        return React.createElement(
          'div',
          null,
          React.createElement(
            'button',
            {
              onClick: () => {
                const file = new File(['Role requirements in attachment'], 'job.txt', {
                  type: 'text/plain',
                });
                addFiles([file]);
              },
            },
            'Add attachment',
          ),
          React.createElement(EmptyDraftsState, null),
        );
      }

      render(
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(
            MasterInfoProvider,
            null,
            React.createElement(
              JobProvider,
              null,
              React.createElement(EmptyStateFilesHelper, null),
            ),
          ),
        ),
      );

      // Step 2 starts unticked
      const step2Container = screen.getByText('2. Add job context.').parentElement!;
      expect(step2Container.textContent).not.toContain('✓');

      // Add a file without typing any pastedText
      const addBtn = screen.getByRole('button', { name: /add attachment/i });
      fireEvent.click(addBtn);

      // Empty state step 2 shows ✓ for files-only job
      await waitFor(() => {
        expect(step2Container.textContent).toContain('✓');
      });
    });
  });
});
