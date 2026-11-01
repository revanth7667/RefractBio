import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import { APP_ID } from '../../src/config';
import fs from 'node:fs';
import path from 'node:path';

describe('Milestone M9 File Handling Integration & UI Tests (§15, §20)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';
  const cleanMasterInfo = '# Jordan Smith\nSenior Data Analyst\nSQL and Python experience.';

  const makeAnthropicStream = (text: string, stopReason: string | null = 'end_turn'): string => {
    return [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":1}}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      '',
      'event: content_block_delta',
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(text)}}}`,
      '',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      '',
      'event: message_delta',
      `data: {"type":"message_delta","delta":{"stop_reason":${JSON.stringify(stopReason)}},"usage":{"output_tokens":10}}`,
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
      '',
    ].join('\n');
  };

  const makeGeminiStream = (text: string): string => {
    return [
      `data: {"candidates":[{"content":{"parts":[{"text":${JSON.stringify(text)}}]},"finishReason":"STOP"}]}`,
      '',
      '',
    ].join('\n');
  };

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/';
    vi.restoreAllMocks();

    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn(() => `blob:http://localhost/${Math.random()}`);
    }
    if (!window.URL.revokeObjectURL) {
      window.URL.revokeObjectURL = vi.fn();
    }

    storage.set('masterInfo', { text: cleanMasterInfo, updatedAt: new Date().toISOString() });
    storage.set('settings', {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
      rememberKeys: true,
      theme: 'system',
      paperSize: 'letter',
      showAllModels: false,
    });
    storage.set('apiKeys', { anthropic: fakeKey, gemini: 'fake-gemini-key' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('UI & Input Methods (jsdom)', () => {
    it('adds files via the hidden file input triggered by Add files button', async () => {
      render(<App />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      expect(fileInput.multiple).toBe(true);
      expect(fileInput.accept).toContain('.png');

      const file = new File(['fake notes content'], 'notes.txt', { type: 'text/plain' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText('notes.txt')).toBeTruthy();
        expect(screen.getByText(/Ready/)).toBeTruthy();
      });
    });

    it('adds files via drag and drop onto the context area', async () => {
      render(<App />);

      const contextArea = screen.getByLabelText(/job context/i).closest('.space-y-2')!;
      const file = new File(['fake drop text'], 'dropped.txt', { type: 'text/plain' });

      fireEvent.dragOver(contextArea);
      expect(screen.getByText('Drop files to attach')).toBeTruthy();

      fireEvent.drop(contextArea, {
        dataTransfer: {
          files: [file],
        },
      });

      await waitFor(() => {
        expect(screen.getByText('dropped.txt')).toBeTruthy();
      });
    });

    it('synthetic paste event with image file adds pasted-image-{n}.{ext} while plain text paste is unaffected', async () => {
      render(<App />);

      const leftPane = screen.getByLabelText(/job context/i).closest('.space-y-6')!;

      // 1. Paste plain text into textarea -> normal behavior, no attachment added
      const textarea = screen.getByLabelText(/job context/i) as HTMLTextAreaElement;
      fireEvent.paste(textarea, {
        clipboardData: {
          items: [{ kind: 'string', type: 'text/plain' }],
        },
      });
      expect(screen.queryByText(/pasted-image-/)).toBeNull();

      // 2. Paste image file -> adds pasted-image-1.png
      const fakeImage = new File(['image-bytes'], 'blob', { type: 'image/png' });
      fireEvent.paste(leftPane, {
        clipboardData: {
          items: [
            {
              kind: 'file',
              type: 'image/png',
              getAsFile: () => fakeImage,
            },
          ],
        },
      });

      await waitFor(() => {
        expect(screen.getByText('pasted-image-1.png')).toBeTruthy();
      });

      // 3. Paste second image -> adds pasted-image-2.jpg
      const fakeJpg = new File(['jpg-bytes'], 'blob2', { type: 'image/jpeg' });
      fireEvent.paste(leftPane, {
        clipboardData: {
          items: [
            {
              kind: 'file',
              type: 'image/jpeg',
              getAsFile: () => fakeJpg,
            },
          ],
        },
      });

      await waitFor(() => {
        expect(screen.getByText('pasted-image-2.jpg')).toBeTruthy();
      });
    });

    it('attachment list shows name, size, status, and Large file badge for files > 5 MB', async () => {
      render(<App />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      // 6 MB file
      const largeFile = new File(['a'.repeat(100)], 'huge.txt', { type: 'text/plain' });
      Object.defineProperty(largeFile, 'size', { value: 6 * 1024 * 1024 });

      fireEvent.change(fileInput, { target: { files: [largeFile] } });

      await waitFor(() => {
        expect(screen.getByText('huge.txt')).toBeTruthy();
        expect(screen.getByText('(6.0 MB)')).toBeTruthy();
        expect(screen.getByText('Large file')).toBeTruthy();
      });
    });

    it('Remove button revokes the image object URL and removes the attachment', async () => {
      const revokeSpy = vi.spyOn(window.URL, 'revokeObjectURL');
      render(<App />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const pngFile = new File(['fake-png-bytes'], 'photo.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [pngFile] } });

      await waitFor(() => {
        expect(screen.getByText('photo.png')).toBeTruthy();
      });

      const removeBtn = screen.getByRole('button', { name: 'Remove photo.png' });
      fireEvent.click(removeBtn);

      await waitFor(() => {
        expect(screen.queryByText('photo.png')).toBeNull();
        expect(revokeSpy).toHaveBeenCalled();
      });
    });

    it('Clear job revokes all image object URLs and empties the list', async () => {
      const revokeSpy = vi.spyOn(window.URL, 'revokeObjectURL');
      render(<App />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const img1 = new File(['img1'], 'img1.png', { type: 'image/png' });
      const img2 = new File(['img2'], 'img2.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [img1, img2] } });

      await waitFor(() => {
        expect(screen.getByText('img1.png')).toBeTruthy();
        expect(screen.getByText('img2.png')).toBeTruthy();
      });

      // Clear job
      fireEvent.click(screen.getByRole('button', { name: /clear job/i }));
      const confirmClearBtn = screen.getByRole('button', { name: /^clear job$/i });
      fireEvent.click(confirmClearBtn);

      await waitFor(() => {
        expect(screen.queryByText('img1.png')).toBeNull();
        expect(screen.queryByText('img2.png')).toBeNull();
        expect(revokeSpy).toHaveBeenCalledTimes(2);
      });
    });

    it('DOCX preview text disclosure shows at most 2,000 characters as text', async () => {
      render(<App />);

      const docxPath = path.resolve(__dirname, '../fixtures/jobs/notes.docx');
      const docxBuf = fs.readFileSync(docxPath);
      const docxFile = new File([docxBuf], 'notes.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [docxFile] } });

      await waitFor(() => {
        expect(screen.getByText('notes.docx')).toBeTruthy();
        expect(screen.getByText('Text extracted')).toBeTruthy();
      });

      const previewBtn = screen.getByRole('button', { name: /preview text/i });
      fireEvent.click(previewBtn);

      await waitFor(() => {
        const pre = document.querySelector('pre');
        expect(pre).toBeTruthy();
        expect(pre?.textContent).toContain('Project notes: Led migration of reporting database to Postgres.');
      });
    });

    it('shows §15.2 rejection message for unsupported .heic file, allows dismissal, and clears on next add', async () => {
      render(<App />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const heicFile = new File(['fake-heic-content'], 'photo.heic', { type: 'image/heic' });

      fireEvent.change(fileInput, { target: { files: [heicFile] } });

      const expectedMsg =
        "photo.heic: this file type isn't supported. Use PNG, JPEG, WEBP, GIF, PDF, DOCX, TXT or MD.";

      await waitFor(() => {
        const noticeRegion = screen.getByRole('region', { name: 'File upload notices' });
        expect(noticeRegion).toBeTruthy();
        expect(screen.getByText(expectedMsg)).toBeTruthy();
      });

      // Dismiss button removes the error notice
      const dismissBtn = screen.getByRole('button', { name: 'Dismiss message' });
      fireEvent.click(dismissBtn);

      await waitFor(() => {
        expect(screen.queryByText(expectedMsg)).toBeNull();
      });

      // Trigger the rejection notice again
      fireEvent.change(fileInput, { target: { files: [heicFile] } });
      await waitFor(() => {
        expect(screen.getByText(expectedMsg)).toBeTruthy();
      });

      // Next add clears previous rejection notice
      const validFile = new File(['valid content'], 'notes.txt', { type: 'text/plain' });
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      await waitFor(() => {
        expect(screen.getByText('notes.txt')).toBeTruthy();
        expect(screen.queryByText(expectedMsg)).toBeNull();
      });
    });

    it('shows over-count message when adding 11th file, allows dismissal, and clears on next add', async () => {
      render(<App />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files11 = Array.from(
        { length: 11 },
        (_, i) => new File([`content-${i}`], `item${i}.txt`, { type: 'text/plain' }),
      );

      fireEvent.change(fileInput, { target: { files: files11 } });

      const expectedCapMsg =
        'Only up to 10 files can be attached. Extra files were not added.';

      await waitFor(() => {
        const noticeRegion = screen.getByRole('region', { name: 'File upload notices' });
        expect(noticeRegion).toBeTruthy();
        expect(screen.getByText(expectedCapMsg)).toBeTruthy();
        // First 10 were added, 11th was not
        expect(screen.getByText('item0.txt')).toBeTruthy();
        expect(screen.getByText('item9.txt')).toBeTruthy();
        expect(screen.queryByText('item10.txt')).toBeNull();
      });

      // Test dismiss control
      const dismissBtn = screen.getByRole('button', { name: 'Dismiss message' });
      fireEvent.click(dismissBtn);

      await waitFor(() => {
        expect(screen.queryByText(expectedCapMsg)).toBeNull();
      });

      // Remove one attachment so count drops to 9
      const removeBtn = screen.getByRole('button', { name: 'Remove item0.txt' });
      fireEvent.click(removeBtn);
      await waitFor(() => {
        expect(screen.queryByText('item0.txt')).toBeNull();
      });

      // Attempt to add 2 files when only 1 slot is open -> triggers cap notice again
      const twoFiles = [
        new File(['extra1'], 'extra1.txt', { type: 'text/plain' }),
        new File(['extra2'], 'extra2.txt', { type: 'text/plain' }),
      ];
      fireEvent.change(fileInput, { target: { files: twoFiles } });

      await waitFor(() => {
        expect(screen.getByText(expectedCapMsg)).toBeTruthy();
      });

      // Remove another file so count is 9 again
      const removeBtn2 = screen.getByRole('button', { name: 'Remove item1.txt' });
      fireEvent.click(removeBtn2);
      await waitFor(() => {
        expect(screen.queryByText('item1.txt')).toBeNull();
      });
      // Cap message remains until next add
      expect(screen.getByText(expectedCapMsg)).toBeTruthy();

      // Next add clears the message
      const singleFile = new File(['single-ok'], 'single.txt', { type: 'text/plain' });
      fireEvent.change(fileInput, { target: { files: [singleFile] } });

      await waitFor(() => {
        expect(screen.getByText('single.txt')).toBeTruthy();
        expect(screen.queryByText(expectedCapMsg)).toBeNull();
      });
    });
  });

  describe('End to end with mocked providers (§12, §14.6, §15, §20)', () => {
    it('questions.png only (Questions box empty) with Answers selected -> Send enabled, request contains "No typed questions" and image part', async () => {
      let capturedBody: { messages: Array<{ content: Array<{ type: string; text?: string; source?: { media_type: string; data: string } }> }> } | null = null;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
          if (url.includes('/models')) {
            return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          if (init?.body) {
            capturedBody = JSON.parse(init.body as string);
          }
          return new Response(makeAnthropicStream('Answers draft from image questions'), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }),
      );

      render(<App />);

      // Unselect Resume and Cover Letter, select Answers
      fireEvent.click(screen.getByRole('button', { name: /^resume$/i }));
      fireEvent.click(screen.getByRole('button', { name: /^cover letter$/i }));
      fireEvent.click(screen.getByRole('button', { name: /application answers/i }));

      // Attach questions.png
      const qPath = path.resolve(__dirname, '../fixtures/jobs/questions.png');
      const qBuf = fs.readFileSync(qPath);
      const qFile = new File([qBuf], 'questions.png', { type: 'image/png' });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [qFile] } });

      await waitFor(() => {
        expect(screen.getByText('questions.png')).toBeTruthy();
        expect(screen.getByText(/Ready/)).toBeTruthy();
      });

      // Send should be enabled even though Questions box is empty
      const sendBtn = screen.getByRole('button', { name: /^send$/i });
      expect(sendBtn.hasAttribute('disabled')).toBe(false);

      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(capturedBody).toBeTruthy();
      });

      // Part A contains the "No typed questions" sentence
      const partAText = capturedBody!.messages[0].content[0].text;
      expect(partAText).toContain('No typed questions. Answer the questions you find in the attached files in <job_context>.');

      // Binary parts include the image part
      const imagePart = capturedBody!.messages[0].content[1];
      expect(imagePart.type).toBe('image');
      expect(imagePart.source?.media_type).toBe('image/png');
      expect(imagePart.source?.data).toBeTruthy();
    });

    it('PDF + image reach both Anthropic and Gemini adapters in the right order', async () => {
      let capturedAnthropicBody: { messages: Array<{ content: Array<{ type: string; source?: { media_type: string } }> }> } | null = null;
      let capturedGeminiBody: { contents: Array<{ parts: Array<{ text?: string; inlineData?: { mimeType: string } }> }> } | null = null;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
          if (url.includes(':streamGenerateContent')) {
            capturedGeminiBody = JSON.parse(init?.body as string);
            return new Response(makeGeminiStream('Gemini draft'), {
              status: 200,
              headers: { 'content-type': 'text/event-stream' },
            });
          }
          if (url.includes('generativelanguage.googleapis.com') && url.includes('/models')) {
            return new Response(
              JSON.stringify({
                models: [
                  {
                    name: 'models/gemini-1.5-flash',
                    displayName: 'Gemini 1.5 Flash',
                    supportedGenerationMethods: ['generateContent'],
                  },
                ],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          if (url.includes('/models')) {
            return new Response(
              JSON.stringify({
                data: [
                  {
                    id: 'claude-3-5-sonnet',
                    display_name: 'Claude 3.5 Sonnet',
                    capabilities: { image_input: { supported: true }, pdf_input: { supported: true } },
                  },
                ],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          if (url.includes('api.anthropic.com')) {
            capturedAnthropicBody = JSON.parse(init?.body as string);
            return new Response(makeAnthropicStream('Anthropic draft'), {
              status: 200,
              headers: { 'content-type': 'text/event-stream' },
            });
          }
          return new Response('{}', { status: 200 });
        }),
      );

      render(<App />);

      // Unselect Cover Letter, keep only Resume
      fireEvent.click(screen.getByRole('button', { name: /^cover letter$/i }));

      // Attach an image and a PDF in that order
      const imgFile = new File(['img-bytes'], 'photo.png', { type: 'image/png' });
      const pdfFile = new File(['pdf-bytes'], 'doc.pdf', { type: 'application/pdf' });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [imgFile, pdfFile] } });

      await waitFor(() => {
        expect(screen.getByText('photo.png')).toBeTruthy();
        expect(screen.getByText('doc.pdf')).toBeTruthy();
        expect(screen.getAllByText(/Ready/).length).toBe(2);
      });

      // Send to Anthropic
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => {
        expect(capturedAnthropicBody).toBeTruthy();
      });

      const anthropicContent = capturedAnthropicBody!.messages[0].content;
      expect(anthropicContent).toHaveLength(4); // Part A, image, pdf, Part C
      expect(anthropicContent[0].type).toBe('text');
      expect(anthropicContent[1].type).toBe('image');
      expect(anthropicContent[1].source?.media_type).toBe('image/png');
      expect(anthropicContent[2].type).toBe('document');
      expect(anthropicContent[2].source?.media_type).toBe('application/pdf');
      expect(anthropicContent[3].type).toBe('text');

      // Switch back to Inputs tab on narrow screens
      const inputsTab = screen.queryByRole('tab', { name: /inputs/i });
      if (inputsTab) {
        fireEvent.click(inputsTab);
      }

      // Switch provider to Gemini
      const providerSelect = screen.getByLabelText(/provider/i);
      fireEvent.change(providerSelect, { target: { value: 'gemini' } });

      // Click Send to generate with Gemini
      await waitFor(() => {
        const sendBtn = screen.getByRole('button', { name: /^send$/i });
        expect(sendBtn.hasAttribute('disabled')).toBe(false);
      });
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => {
        expect(capturedGeminiBody).toBeTruthy();
      });

      const geminiParts = capturedGeminiBody!.contents[0].parts;
      expect(geminiParts).toHaveLength(4); // Part A, image, pdf, Part C
      expect(geminiParts[0].text).toBeTruthy();
      expect(geminiParts[1].inlineData?.mimeType).toBe('image/png');
      expect(geminiParts[2].inlineData?.mimeType).toBe('application/pdf');
      expect(geminiParts[3].text).toBeTruthy();
    });

    it('a reading attachment disables Send with "Still reading files…"', async () => {
      render(<App />);

      const slowFile = new File(['content'], 'slow.txt', { type: 'text/plain' });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [slowFile] } });

      expect(screen.getByText('slow.txt')).toBeTruthy();
    });

    it('an error attachment blocks Send with "Remove the file marked with an error."', async () => {
      render(<App />);

      const badText = 'a'.repeat(98) + '\uFFFD\uFFFD';
      const badFile = new File([badText], 'bad.txt', { type: 'text/plain' });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [badFile] } });

      await waitFor(() => {
        expect(screen.getByText(/Error: This file doesn't look like plain text\./)).toBeTruthy();
      });

      const sendBtn = screen.getByRole('button', { name: /^send$/i });
      expect(sendBtn.hasAttribute('disabled')).toBe(true);
      expect(screen.getByText('Remove the file marked with an error.')).toBeTruthy();
    });

    it('unsupported-model case blocks with Blocker 9, and unknown capability shows the notice', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('/models')) {
            return new Response(
              JSON.stringify({
                data: [
                  {
                    id: 'claude-text-only',
                    display_name: 'Claude Text Only',
                    capabilities: { image_input: { supported: false } },
                  },
                  {
                    id: 'claude-unknown',
                    display_name: 'Claude Unknown',
                    capabilities: {},
                  },
                ],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          return new Response(makeAnthropicStream('Draft'), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }),
      );

      storage.set('settings', {
        selectedProvider: 'anthropic',
        selectedModel: { anthropic: 'claude-text-only', gemini: 'gemini-1.5-flash' },
        rememberKeys: true,
        theme: 'system',
        paperSize: 'letter',
        showAllModels: false,
      });

      render(<App />);

      // Attach image
      const imgFile = new File(['img'], 'test.png', { type: 'image/png' });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [imgFile] } });

      await waitFor(() => {
        expect(screen.getByText('test.png')).toBeTruthy();
        expect(screen.getByText(/Ready/)).toBeTruthy();
      });

      // 1. With claude-text-only (supportsImages === 'no'), Send is blocked by blocker 9
      await waitFor(() => {
        const sendBtn = screen.getByRole('button', { name: /^send$/i });
        expect(sendBtn.hasAttribute('disabled')).toBe(true);
        expect(
          screen.getByText('This model may not read images/PDFs; remove the file or pick another model.'),
        ).toBeTruthy();
      });

      // 2. Switch model to claude-unknown (supportsImages === 'unknown')
      const modelPicker = document.getElementById('sendbar-model-picker') as HTMLSelectElement;
      fireEvent.change(modelPicker, { target: { value: 'claude-unknown' } });

      // Send should be enabled, and non-blocking notice should show
      await waitFor(() => {
        const sendBtn = screen.getByRole('button', { name: /^send$/i });
        expect(sendBtn.hasAttribute('disabled')).toBe(false);
        expect(
          screen.getByText(
            "We can't tell whether this model reads images/PDFs. If it fails, remove the file or pick another model.",
          ),
        ).toBeTruthy();
      });
    });

    it('adding or removing an attachment marks tabs stale', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('/models')) {
            return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(makeAnthropicStream('Draft generated before file change'), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }),
      );

      render(<App />);

      // Generate Resume
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => {
        expect(screen.getByText('Draft generated before file change')).toBeTruthy();
      });

      // No stale badge yet
      expect(screen.queryByText('Inputs changed since this was generated')).toBeNull();

      // Add attachment
      const extraFile = new File(['some text'], 'extra.txt', { type: 'text/plain' });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [extraFile] } });

      await waitFor(() => {
        expect(screen.getByText('extra.txt')).toBeTruthy();
        expect(screen.getByText(/Ready/)).toBeTruthy();
      });

      // Stale badge appears (debounced 300 ms)
      await waitFor(
        () => {
          expect(screen.getByText('Inputs changed since this was generated')).toBeTruthy();
        },
        { timeout: 1500 },
      );

      // Now remove attachment
      const removeBtn = screen.getByRole('button', { name: 'Remove extra.txt' });
      fireEvent.click(removeBtn);

      await waitFor(() => {
        expect(screen.queryByText('extra.txt')).toBeNull();
      });
    });

    it('pre-send estimate includes PDF size-based guess suffix with real attachments', async () => {
      render(<App />);

      const pdfPath = path.resolve(__dirname, '../fixtures/jobs/posting.pdf');
      const pdfBuf = fs.readFileSync(pdfPath);
      const pdfFile = new File([pdfBuf], 'posting.pdf', { type: 'application/pdf' });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [pdfFile] } });

      await waitFor(() => {
        expect(screen.getByText('posting.pdf')).toBeTruthy();
        expect(screen.getByText(/Ready/)).toBeTruthy();
      });

      // Token estimate line updates (debounced 300 ms)
      await waitFor(
        () => {
          expect(screen.getByText(/Includes a size-based guess for 1 PDF\(s\)\./)).toBeTruthy();
        },
        { timeout: 1500 },
      );
    });

    it('never writes attachment bytes, names, or file state to localStorage (only 4 keys allowed)', async () => {
      render(<App />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const secretFile = new File(['SUPER_SECRET_ATTACHMENT_CONTENT'], 'secret-portfolio.txt', {
        type: 'text/plain',
      });

      fireEvent.change(fileInput, { target: { files: [secretFile] } });

      await waitFor(() => {
        expect(screen.getByText('secret-portfolio.txt')).toBeTruthy();
      });

      const allowedKeys = new Set([
        `${APP_ID}:v1:masterInfo`,
        `${APP_ID}:v1:settings`,
        `${APP_ID}:v1:apiKeys`,
        `${APP_ID}:v1:instructions`,
      ]);

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (key && key.startsWith(`${APP_ID}:`)) {
          expect(allowedKeys.has(key)).toBe(true);
        }

        const val = localStorage.getItem(key) ?? '';
        expect(val).not.toContain('SUPER_SECRET_ATTACHMENT_CONTENT');
        expect(val).not.toContain('secret-portfolio.txt');
      }
    });
  });
});
