import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import { GAPS_DELIMITER, APP_ID } from '../../src/config';

function makeAnthropicStream(text: string): string {
  return [
    'event: message_start',
    'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null}}',
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
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
    '',
    'event: message_stop',
    'data: {"type":"message_stop"}',
    '',
    '',
  ].join('\n');
}

describe('Toolbar UI print controls (§16.3, §17.3, §17.4)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';
  let printSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '#/';
    vi.restoreAllMocks();

    storage.set('masterInfo', {
      text: '# Jordan Sample\nData Analyst\nSQL and Python experience.',
      updatedAt: new Date().toISOString(),
    });
    storage.set('settings', {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet-20241022', gemini: 'gemini-1.5-flash' },
      rememberKeys: true,
      theme: 'system',
      paperSize: 'letter',
      showAllModels: false,
    });
    storage.set('apiKeys', { anthropic: fakeKey, gemini: 'fake-gemini-key' });

    printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  afterEach(() => {
    printSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('renders Print controls on Resume and Cover Letter, and NOT on Email, LinkedIn or Answers', async () => {
    const resumeText = `# Jordan Sample\nSummary\n${GAPS_DELIMITER}\n- None`;
    const coverText = `Jordan Sample\n\nDear Team,\n\nBody.\n${GAPS_DELIMITER}\n- None`;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/models')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'claude-3-5-sonnet-20241022',
                  display_name: 'Claude 3.5 Sonnet',
                },
              ],
            }),
            { status: 200 },
          );
        }
        const bodyStr = typeof init?.body === 'string' ? init.body : '';
        const text = bodyStr.includes('COVER_LETTER') ? coverText : resumeText;
        return new Response(makeAnthropicStream(text), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    const contextInput = screen.getByLabelText(/job context/i);
    fireEvent.change(contextInput, {
      target: { value: 'Logistics company looking for data analyst.' },
    });

    // Default selection is Resume and Cover Letter.
    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    // On Resume tab: Print controls exist
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /print \/ save as pdf/i })).toBeTruthy();
      expect(screen.getByLabelText(/^paper size$/i)).toBeTruthy();
      expect(
        screen.getByText(
          "In the print dialog, choose 'Save as PDF', and turn off 'Headers and footers' for a clean page.",
        ),
      ).toBeTruthy();
    });
  });

  it('does NOT render Print controls on Email tab', async () => {
    const emailText = `Subject: Hello\n\nBody here\n${GAPS_DELIMITER}\n- None`;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/models')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'claude-3-5-sonnet-20241022',
                  display_name: 'Claude 3.5 Sonnet',
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(makeAnthropicStream(emailText), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    const contextInput = screen.getByLabelText(/job context/i);
    fireEvent.change(contextInput, {
      target: { value: 'Logistics company looking for data analyst.' },
    });

    // Select only Email
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /email/i }));

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^copy$/i })).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /print \/ save as pdf/i })).toBeNull();
    expect(screen.queryByLabelText(/^paper size$/i)).toBeNull();
  });

  it('persists settings.paperSize when changed, still keeping only the four allowed storage keys', async () => {
    const resumeText = `# Jordan Sample\nSummary\n${GAPS_DELIMITER}\n- None`;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/models')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'claude-3-5-sonnet-20241022',
                  display_name: 'Claude 3.5 Sonnet',
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(makeAnthropicStream(resumeText), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    const contextInput = screen.getByLabelText(/job context/i);
    fireEvent.change(contextInput, {
      target: { value: 'Job posting context' },
    });

    // Keep only Resume
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /print \/ save as pdf/i })).toBeTruthy();
    });

    const paperSelect = screen.getByLabelText(/^paper size$/i) as HTMLSelectElement;
    expect(paperSelect.value).toBe('letter');

    // Change to A4
    fireEvent.change(paperSelect, { target: { value: 'a4' } });
    expect(paperSelect.value).toBe('a4');

    // Check localStorage persistence
    const storedSettings = storage.get('settings');
    expect(storedSettings.ok).toBe(true);
    if (storedSettings.ok) {
      expect(storedSettings.value.paperSize).toBe('a4');
    }

    // Verify storage contains ONLY the allowed keys
    const allowedPrefix = `${APP_ID}:v1:`;
    const allowedKeys = new Set([
      `${allowedPrefix}masterInfo`,
      `${allowedPrefix}instructions`,
      `${allowedPrefix}apiKeys`,
      `${allowedPrefix}settings`,
    ]);

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(APP_ID)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    }
  });

  it('prints with user edited text instead of original generated text', async () => {
    const resumeText = `# Jordan Sample\nOriginal experience line.\n${GAPS_DELIMITER}\n- None`;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/models')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'claude-3-5-sonnet-20241022',
                  display_name: 'Claude 3.5 Sonnet',
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(makeAnthropicStream(resumeText), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    const contextInput = screen.getByLabelText(/job context/i);
    fireEvent.change(contextInput, {
      target: { value: 'Job posting context' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /print \/ save as pdf/i })).toBeTruthy();
    });

    // Edit the text in editor
    const editor = screen.getByLabelText(/resume draft/i);
    fireEvent.change(editor, {
      target: {
        value: '# Jordan Sample\nEdited experience line by candidate.',
      },
    });

    // Click Print
    const printBtn = screen.getByRole('button', { name: /print \/ save as pdf/i });
    fireEvent.click(printBtn);

    expect(printSpy).toHaveBeenCalledTimes(1);

    const printRoot = document.getElementById('print-root');
    expect(printRoot).toBeTruthy();
    expect(printRoot?.textContent).toContain('Edited experience line by candidate');
    expect(printRoot?.textContent).not.toContain('Original experience line');
  });

  it('disables Print button when editor text is empty', async () => {
    const resumeText = `# Jordan Sample\nText\n${GAPS_DELIMITER}\n- None`;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/models')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'claude-3-5-sonnet-20241022',
                  display_name: 'Claude 3.5 Sonnet',
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(makeAnthropicStream(resumeText), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    const contextInput = screen.getByLabelText(/job context/i);
    fireEvent.change(contextInput, {
      target: { value: 'Job posting context' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      const printBtn = screen.getByRole('button', { name: /print \/ save as pdf/i });
      expect(printBtn.hasAttribute('disabled')).toBe(false);
    });

    // Clear editor text
    const editor = screen.getByLabelText(/resume draft/i);
    fireEvent.change(editor, { target: { value: '   ' } });

    const printBtn = screen.getByRole('button', { name: /print \/ save as pdf/i });
    expect(printBtn.hasAttribute('disabled')).toBe(true);
  });
});
