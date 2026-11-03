import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import { GAPS_DELIMITER } from '../../src/config';

describe('Variant-label and Email subject timing rule (SPEC §12.7)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';
  const cleanMasterInfo = '# Jordan Smith\nSenior Data Analyst\nSQL and Python experience.';

  const makeAnthropicStream = (text: string): string => {
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
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
      '',
    ].join('\n');
  };

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/';
    vi.restoreAllMocks();

    storage.set('masterInfo', { text: cleanMasterInfo, updatedAt: new Date().toISOString() });
    storage.set('settings', {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
      rememberKeys: true,
      paperSize: 'letter',
      theme: 'system',
      showAllModels: false,
    });
    storage.set('apiKeys', { anthropic: fakeKey, gemini: '' });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('does not show LinkedIn badge or notice while generating, even if partial text has no labels', async () => {
    let resolveStream: () => void = () => {};
    const streamPromise = new Promise<void>((resolve) => {
      resolveStream = resolve;
    });

    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Generating partial text..."}}\n\n',
          ),
        );
        await streamPromise;
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return new Response(customStream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /linkedin message/i }));

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    // While generating, status is generating
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sending/i })).toBeTruthy();
    });

    // Neither the toolbar notice nor the safety-net badge should be present while generating
    expect(
      screen.queryByText(
        "Couldn't find the two variant labels, so per-variant copy is off. Check the labels in the draft or in your instructions file.",
      ),
    ).toBeNull();
    expect(
      screen.queryByText(
        'LinkedIn variant labels missing. Per-variant copy is off; check the two label lines in the draft.',
      ),
    ).toBeNull();

    // Finish stream
    resolveStream();
  });

  it('shows LinkedIn badge and notice when finished non-empty draft lacks labels, and disappears after user edits in the labels', async () => {
    const rawNoLabels = `Hi Alex, here is an outreach message without variant labels.\n${GAPS_DELIMITER}\n- None`;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return new Response(makeAnthropicStream(rawNoLabels), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /linkedin message/i }));

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Couldn't find the two variant labels, so per-variant copy is off. Check the labels in the draft or in your instructions file.",
        ),
      ).toBeTruthy();
    });

    expect(
      screen.getByText(
        'LinkedIn variant labels missing. Per-variant copy is off; check the two label lines in the draft.',
      ),
    ).toBeTruthy();

    // Editor is non-empty
    const editor = screen.getByRole('textbox', { name: /linkedin message draft/i });
    expect((editor as HTMLTextAreaElement).value).toContain('without variant labels');

    // User edits the draft to add the two labels
    const fixedText = `Variant 1: Connection request note\nHi Alex, let's connect.\nVariant 2: Direct message\nHi Alex, would love to chat.\n${GAPS_DELIMITER}\n- None`;
    fireEvent.change(editor, { target: { value: fixedText } });

    // Both badge and notice disappear
    await waitFor(() => {
      expect(
        screen.queryByText(
          "Couldn't find the two variant labels, so per-variant copy is off. Check the labels in the draft or in your instructions file.",
        ),
      ).toBeNull();
    });
    expect(
      screen.queryByText(
        'LinkedIn variant labels missing. Per-variant copy is off; check the two label lines in the draft.',
      ),
    ).toBeNull();

    // If user clears the draft completely, neither badge nor notice is shown on an empty draft
    fireEvent.change(editor, { target: { value: '' } });
    expect(
      screen.queryByText(
        "Couldn't find the two variant labels, so per-variant copy is off. Check the labels in the draft or in your instructions file.",
      ),
    ).toBeNull();
    expect(
      screen.queryByText(
        'LinkedIn variant labels missing. Per-variant copy is off; check the two label lines in the draft.',
      ),
    ).toBeNull();
  });

  it('shows Email No Subject line badge only when finished and non-empty, and disappears after editing Subject in', async () => {
    const emailWithoutSubject = `Dear Hiring Manager,\nI am reaching out regarding the position.\n${GAPS_DELIMITER}\n- None`;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return new Response(makeAnthropicStream(emailWithoutSubject), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /email/i }));

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.getByText('No Subject line')).toBeTruthy();
    });

    const editor = screen.getByRole('textbox', { name: /email draft/i });

    // User edits the draft to include Subject:
    const fixedEmail = `Subject: Application for Data Analyst\n\nDear Hiring Manager,\nI am reaching out.\n${GAPS_DELIMITER}\n- None`;
    fireEvent.change(editor, { target: { value: fixedEmail } });

    await waitFor(() => {
      expect(screen.queryByText('No Subject line')).toBeNull();
    });

    // Clear draft: empty draft must NOT show the badge
    fireEvent.change(editor, { target: { value: '' } });
    expect(screen.queryByText('No Subject line')).toBeNull();
  });
});
