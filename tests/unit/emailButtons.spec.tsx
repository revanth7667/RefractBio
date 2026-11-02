import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import { GAPS_DELIMITER } from '../../src/config';

function makeAnthropicStream(text: string) {
  const enc = new TextEncoder();
  const chunk1 = `event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null}}\n\n`;
  const chunk2 = `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`;
  const chunk3 = `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(
    text,
  )}}}\n\n`;
  const chunk4 = `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n`;
  const chunk5 = `event: message_stop\ndata: {"type":"message_stop"}\n\n`;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(chunk1 + chunk2 + chunk3 + chunk4 + chunk5));
      controller.close();
    },
  });
  return stream;
}

describe('Email Copy subject and Copy body buttons (§16.2)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';
  let clipboardWriteMock: ReturnType<typeof vi.fn>;

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

    clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardWriteMock,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Copy subject and Copy body when Subject line exists, copies without label, and announces "Copied to clipboard"', async () => {
    const emailDraft = `Subject: Data Analyst Application - Jordan Sample\n\nDear Logistics Team,\n\nI am excited to submit my background.\n\nSincerely,\nJordan\n${GAPS_DELIMITER}\n- None`;

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
        return new Response(makeAnthropicStream(emailDraft), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    // Provide job context
    const contextInput = screen.getByLabelText(/job context/i);
    fireEvent.change(contextInput, {
      target: { value: 'Logistics company looking for data analyst.' },
    });

    // Unselect Resume and Cover Letter, select Email
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /email/i }));

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy subject/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /copy body/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /^copy$/i })).toBeTruthy();
    });

    // Copy subject: copies WITHOUT the "Subject:" label
    const copySubjectBtn = screen.getByRole('button', { name: /copy subject/i });
    fireEvent.click(copySubjectBtn);
    expect(clipboardWriteMock).toHaveBeenCalledWith('Data Analyst Application - Jordan Sample');
    expect(clipboardWriteMock.mock.calls[0][0]).not.toContain('Subject:');

    // Announce copied
    await waitFor(() => {
      expect(screen.getByText('Copied to clipboard')).toBeTruthy();
      expect(screen.getByRole('button', { name: /^copied$/i })).toBeTruthy();
    });

    // Copy body: copies the body after first blank line
    const copyBodyBtn = screen.getByRole('button', { name: /copy body/i });
    fireEvent.click(copyBodyBtn);
    expect(clipboardWriteMock).toHaveBeenCalledWith(
      'Dear Logistics Team,\n\nI am excited to submit my background.\n\nSincerely,\nJordan',
    );

    // Generic Copy stays and copies full editor text
    const copyGenericBtn = screen.getByRole('button', { name: /^copy$/i });
    fireEvent.click(copyGenericBtn);
    expect(clipboardWriteMock).toHaveBeenCalledWith(
      'Subject: Data Analyst Application - Jordan Sample\n\nDear Logistics Team,\n\nI am excited to submit my background.\n\nSincerely,\nJordan',
    );
  });

  it('hides Copy subject and Copy body when Subject line is missing, keeping only generic Copy', async () => {
    const emailDraft = `Dear Logistics Team,\n\nI am writing to apply without a subject line.\n\nSincerely,\nJordan\n${GAPS_DELIMITER}\n- None`;

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
        return new Response(makeAnthropicStream(emailDraft), {
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

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /email/i }));

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^copy$/i })).toBeTruthy();
    });

    // Copy subject and Copy body should NOT be rendered
    expect(screen.queryByRole('button', { name: /copy subject/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /copy body/i })).toBeNull();

    // "No Subject line" badge stays
    expect(screen.getByText('No Subject line')).toBeTruthy();

    // Now edit the textarea to add a Subject: line and verify recomputation on edit
    const editor = screen.getByLabelText(/email draft/i);
    fireEvent.change(editor, {
      target: {
        value: 'Subject: Added Subject Line\n\nDear Logistics Team,\n\nNow with subject.',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy subject/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /copy body/i })).toBeTruthy();
    });
  });

  it('updates buttons and badge when Subject line is removed and restored via editor', async () => {
    const emailDraft = `Subject: Initial Subject\n\nInitial Body\n${GAPS_DELIMITER}\n- None`;

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
        return new Response(makeAnthropicStream(emailDraft), {
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

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /email/i }));

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy subject/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /copy body/i })).toBeTruthy();
    });

    const editor = screen.getByLabelText(/email draft/i);

    // Edit editor text so Subject line is removed
    fireEvent.change(editor, {
      target: {
        value: 'Initial Body without subject line',
      },
    });

    // Copy subject and Copy body disappear, and "No Subject line" badge appears
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /copy subject/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /copy body/i })).toBeNull();
      expect(screen.getByText('No Subject line')).toBeTruthy();
    });

    // Type a Subject line back
    fireEvent.change(editor, {
      target: {
        value: 'Subject: Brand New Subject\n\nBrand New Body Content',
      },
    });

    // Buttons return and badge is gone
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy subject/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /copy body/i })).toBeTruthy();
      expect(screen.queryByText('No Subject line')).toBeNull();
    });

    // Verify they copy the NEW subject and NEW body
    const copySubjectBtn = screen.getByRole('button', { name: /copy subject/i });
    fireEvent.click(copySubjectBtn);
    expect(clipboardWriteMock).toHaveBeenCalledWith('Brand New Subject');

    const copyBodyBtn = screen.getByRole('button', { name: /copy body/i });
    fireEvent.click(copyBodyBtn);
    expect(clipboardWriteMock).toHaveBeenCalledWith('Brand New Body Content');
  });
});
