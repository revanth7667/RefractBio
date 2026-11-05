import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import { APP_ID, GAPS_DELIMITER } from '../../src/config';

describe('Milestone M7b Generation and Right Pane UI', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';
  const cleanMasterInfo = '# Jordan Smith\nSenior Data Analyst\nSQL and Python experience.';

  const readFixture = (name: string): string => {
    return fs.readFileSync(path.resolve(__dirname, `../fixtures/sse/${name}`), 'utf-8');
  };

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



  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/';
    vi.restoreAllMocks();

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

  it('Send makes exactly one request per selected output with the right provider headers and body', async () => {
    interface AnthropicCapturedBody {
      model?: string;
      stream?: boolean;
      system?: string;
      messages: { role: string; content: { type: string; text: string }[] }[];
    }
    const capturedRequests: { url: string; headers: HeadersInit; body: AnthropicCapturedBody }[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes('/messages')) {
          capturedRequests.push({
            url: urlStr,
            headers: init?.headers || {},
            body: init?.body ? JSON.parse(String(init.body)) : null,
          });
          return new Response(makeAnthropicStream(`Generated text for call ${capturedRequests.length}`), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${urlStr}`));
      }),
    );

    render(<App />);

    // Defaults are Resume and Cover Letter (2 selected outputs)
    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    expect(sendBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(sendBtn);

    // Wait until generation finishes and both tabs are visible
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /resume/i })).toBeTruthy();
      expect(screen.getByRole('tab', { name: /cover letter/i })).toBeTruthy();
    });

    // Exactly 2 requests: one for RESUME, one for COVER_LETTER
    expect(capturedRequests).toHaveLength(2);

    for (const req of capturedRequests) {
      expect(req.url).toBe('https://api.anthropic.com/v1/messages');
      const headers = req.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe(fakeKey);
      expect(headers['anthropic-version']).toBe('2026-10-21');
      expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
      expect(headers['content-type']).toBe('application/json');

      expect(req.body.model).toBe('claude-3-5-sonnet');
      expect(req.body.stream).toBe(true);
      expect(req.body.system).toContain('You are an assistant that drafts job-application documents');
    }

    // Answers is not selected, so neither request contains <questions> in user messages
    for (const req of capturedRequests) {
      const userMessageText = req.body.messages[0].content[0].text;
      expect(userMessageText).not.toContain('<questions>');
    }
  });

  it('Answers request contains <questions> and other outputs do not', async () => {
    interface AnthropicCapturedBody {
      messages: { role: string; content: { type: string; text: string }[] }[];
    }
    const capturedRequests: { body: AnthropicCapturedBody }[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes('/messages')) {
          capturedRequests.push({
            body: init?.body ? JSON.parse(String(init.body)) : null,
          });
          return new Response(makeAnthropicStream('Draft response'), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        if (urlStr.includes('/models')) {
          return new Response(
            JSON.stringify({
              data: [
                { id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' },
              ],
            }),
            { status: 200 },
          );
        }
        return Promise.reject(new Error(`Unhandled URL: ${urlStr}`));
      }),
    );

    render(<App />);

    // Toggle Answers ON and type questions
    const answersToggle = screen.getByRole('button', { name: /application answers/i });
    fireEvent.click(answersToggle);

    const questionsInput = screen.getByLabelText(/application questions/i);
    fireEvent.change(questionsInput, {
      target: { value: 'Why do you want to join RefractBio?' },
    });

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    // 3 outputs selected: Resume, Cover Letter, Answers
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /answers/i })).toBeTruthy();
    });

    expect(capturedRequests).toHaveLength(3);

    // Call 1 (Resume): no <questions> in user message
    const resumeText = capturedRequests[0].body.messages[0].content[0].text;
    expect(resumeText).not.toContain('<questions>');

    // Call 2 (Cover Letter): no <questions> in user message
    const coverLetterText = capturedRequests[1].body.messages[0].content[0].text;
    expect(coverLetterText).not.toContain('<questions>');

    // Call 3 (Answers): contains <questions> with the typed question in user message
    const answersText = capturedRequests[2].body.messages[0].content[0].text;
    expect(answersText).toContain('<questions>');
    expect(answersText).toContain('Why do you want to join RefractBio?');
    expect(answersText).toContain('</questions>');
  });

  it('streaming updates the visible text and shows Gaps split separately', async () => {
    const resumeFullText = `Jordan Smith\nSenior Data Analyst\n${GAPS_DELIMITER}\n- Missing 5 years of Azure experience.`;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return new Response(makeAnthropicStream(resumeFullText), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    // Unselect Cover Letter to run only Resume
    const coverLetterToggle = screen.getByRole('button', { name: /cover letter/i });
    fireEvent.click(coverLetterToggle);

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toBe('Jordan Smith\nSenior Data Analyst');
    });

    // Editor excludes the gaps note
    const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
    expect(editor.value).not.toContain(GAPS_DELIMITER);
    expect(editor.value).not.toContain('Missing 5 years of Azure experience.');

    // Gaps note appears in the dedicated callout
    expect(
      screen.getByText('Gaps: things the job or your questions ask for that aren\'t in your Master Info'),
    ).toBeTruthy();
    expect(screen.getByText('- Missing 5 years of Azure experience.')).toBeTruthy();
  });

  it('LinkedIn variants split with separate copy and copied text excludes label lines', async () => {
    const linkedInResponse = [
      'Variant 1: Connection request note',
      'Hi Alex, noticed your engineering work at RefractBio. Would love to connect!',
      '',
      'Variant 2: Direct message',
      'Dear Alex, I am a senior data analyst with SQL and Python expertise. I saw your open role and wanted to reach out.',
      '',
      GAPS_DELIMITER,
      '- None',
    ].join('\n');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return new Response(makeAnthropicStream(linkedInResponse), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: clipboardWriteMock },
    });

    render(<App />);

    // Select only LinkedIn Message
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /linkedin message/i }));

    const btn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy connection note/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /copy direct message/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /copy all/i })).toBeTruthy();
    });

    // Live character count next to Copy connection note button
    const noteText = 'Hi Alex, noticed your engineering work at RefractBio. Would love to connect!';
    expect(screen.getByText(`${noteText.length} characters`)).toBeTruthy();

    // Copy connection note: copies text without the label line
    const copyNoteBtn = screen.getByRole('button', { name: /copy connection note/i });
    fireEvent.click(copyNoteBtn);
    expect(clipboardWriteMock).toHaveBeenCalledWith(noteText);
    expect(clipboardWriteMock.mock.calls[0][0]).not.toContain('Variant 1: Connection request note');

    // Copy direct message: copies text without the label line
    const dmText = 'Dear Alex, I am a senior data analyst with SQL and Python expertise. I saw your open role and wanted to reach out.';
    const copyDmBtn = screen.getByRole('button', { name: /copy direct message/i });
    fireEvent.click(copyDmBtn);
    expect(clipboardWriteMock).toHaveBeenCalledWith(dmText);
    expect(clipboardWriteMock.mock.calls[1][0]).not.toContain('Variant 2: Direct message');

    // Button updates label to 'Copied'
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copied/i })).toBeTruthy();
    });
  });

  it('shows LinkedIn variant labels missing badge and notice when labels are omitted', async () => {
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

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      // Per-variant buttons are absent; only Copy all is shown
      expect(screen.queryByRole('button', { name: /copy connection note/i })).toBeNull();
      expect(screen.getByRole('button', { name: /copy all/i })).toBeTruthy();
    });

    // Notice explaining why per-variant copy is off (§16.2)
    expect(
      screen.getByText(
        "Couldn't find the two variant labels, so per-variant copy is off. Check the labels in the draft or in your instructions file.",
      ),
    ).toBeTruthy();

    // Safety-net badge in the Gaps-note area (§12.7)
    expect(
      screen.getByText(
        'LinkedIn variant labels missing. Per-variant copy is off; check the two label lines in the draft.',
      ),
    ).toBeTruthy();
  });

  it('shows No Subject line badge when Email draft does not start with Subject:', async () => {
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
  });

  it('shows truncation notice when Anthropic reports max_tokens stop_reason', async () => {
    const truncatedAnthropicSse = readFixture('anthropic-truncated.txt');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return new Response(truncatedAnthropicSse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'This draft was cut off before the model finished. Press Regenerate, or choose a model or setting that allows longer output.',
        ),
      ).toBeTruthy();
    });
  });

  it('shows truncation notice when Gemini reports MAX_TOKENS finishReason', async () => {
    storage.set('settings', {
      selectedProvider: 'gemini',
      selectedModel: { gemini: 'gemini-1.5-flash' },
      rememberKeys: true,
      theme: 'system',
      paperSize: 'letter',
      showAllModels: false,
    });

    const truncatedGeminiSse = readFixture('gemini-truncated.txt');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return new Response(truncatedGeminiSse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'This draft was cut off before the model finished. Press Regenerate, or choose a model or setting that allows longer output.',
        ),
      ).toBeTruthy();
    });
  });

  it('shows error category message on failure and Retry re-runs only that output', async () => {
    let generateCallCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes('/models')) {
          return new Response(
            JSON.stringify({
              data: [
                { id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' },
              ],
            }),
            { status: 200 },
          );
        }

        if (urlStr.includes('/messages')) {
          generateCallCount++;
          if (generateCallCount === 1) {
            // 401 unauthorized
            return new Response(
              JSON.stringify({ error: { message: 'Invalid API key' } }),
              { status: 401, headers: { 'content-type': 'application/json' } },
            );
          }
          // Second call (Retry) succeeds
          return new Response(makeAnthropicStream('Retry succeeded!'), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${urlStr}`));
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    // Shows mapped 401 auth error (§13.5)
    await waitFor(() => {
      expect(
        screen.getByText('The provider rejected your API key. Check that you pasted the whole key for Anthropic.'),
      ).toBeTruthy();
      expect(screen.getAllByRole('button', { name: /^retry$/i }).length).toBeGreaterThan(0);
    });

    // Pressing Retry re-runs only this output
    fireEvent.click(screen.getAllByRole('button', { name: /^retry$/i })[0]);

    await waitFor(() => {
      const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toBe('Retry succeeded!');
    });

    expect(generateCallCount).toBe(2);
  });

  it('produces a mapped AppError in the tab (not a raw message) when Anthropic stream drops mid-stream with TypeError', async () => {
    const encoder = new TextEncoder();
    let sentChunk = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sentChunk) {
          sentChunk = true;
          controller.enqueue(
            encoder.encode(
              'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Partial Anthropic text"}}\n\n'
            )
          );
        } else {
          controller.error(new TypeError('Connection reset mid-stream'));
        }
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes('/messages')) {
          return new Response(stream, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${urlStr}`));
      })
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      const mainMsg = screen.getByText(/was blocked before it reached the provider/i);
      expect(mainMsg.textContent).toContain('was blocked before it reached the provider');
      expect(mainMsg.textContent).not.toBe('Connection reset mid-stream');
    });
  });

  it('produces a mapped AppError in the tab (not a raw message) when Gemini stream drops mid-stream with TypeError', async () => {
    storage.set('settings', {
      selectedProvider: 'gemini',
      selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
      rememberKeys: true,
      theme: 'system',
      paperSize: 'letter',
      showAllModels: false,
    });

    const encoder = new TextEncoder();
    let sentChunk = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sentChunk) {
          sentChunk = true;
          controller.enqueue(
            encoder.encode(
              'data: {"candidates":[{"content":{"parts":[{"text":"Partial Gemini text"}]}}]}\n\n'
            )
          );
        } else {
          controller.error(new TypeError('Socket abruptly closed'));
        }
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes('streamGenerateContent')) {
          return new Response(stream, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${urlStr}`));
      })
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      const mainMsg = screen.getByText(/was blocked before it reached the provider/i);
      expect(mainMsg.textContent).toContain('was blocked before it reached the provider');
      expect(mainMsg.textContent).not.toBe('Socket abruptly closed');
    });
  });

  it('yields the abort path and not an error when abort occurs during stream read', async () => {
    const encoder = new TextEncoder();
    let streamController!: ReadableStreamDefaultController;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal;
        const stream = new ReadableStream({
          start(controller) {
            streamController = controller;
            signal?.addEventListener('abort', () => {
              try {
                controller.error(new DOMException('The operation was aborted.', 'AbortError'));
              } catch {
                // Ignore if already closed
              }
            });
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    // Wait for stream to start and Stop button to appear
    await waitFor(() => {
      expect(streamController).toBeDefined();
      expect(screen.getByRole('button', { name: 'Stop Resume' })).toBeTruthy();
    });

    // Push partial delta so editor has streaming text
    const sseChunk = [
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Partial text"}}',
      '',
      '',
    ].join('\n');

    act(() => {
      streamController.enqueue(encoder.encode(sseChunk));
    });

    await waitFor(() => {
      const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toContain('Partial text');
    });

    // Click Stop Resume during read
    fireEvent.click(screen.getByRole('button', { name: 'Stop Resume' }));

    // Abort path taken: status is done (or idle), partial text kept with stopped notice, NOT error callout
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^retry$/i })).toBeNull();
      expect(screen.queryByText(/was blocked before it reached/i)).toBeNull();
      expect(screen.queryByText(/something went wrong/i)).toBeNull();
      expect(screen.getByText(/Stopped early\. This draft is incomplete\./i)).toBeTruthy();
    });
  });

  it('dispatches FAIL and preserves previous draft when stream ends with zero text or without terminal event', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes('/models')) {
          return new Response(
            JSON.stringify({
              data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }],
            }),
            { status: 200 },
          );
        }

        callCount++;
        if (callCount === 1) {
          return new Response(makeAnthropicStream('Initial good draft content'), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        // Second call (Regenerate) returns empty stream (zero text)
        const emptyStream = [
          'event: message_start',
          'data: {"type":"message_start","message":{"id":"msg_01fake","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet"}}',
          '',
          'event: message_stop',
          'data: {"type":"message_stop"}',
          '',
        ].join('\n');
        return new Response(emptyStream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    // Unselect other tabs so only Resume is sent
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toBe('Initial good draft content');
    });

    // Now click Regenerate
    fireEvent.click(screen.getByRole('button', { name: /^regenerate$/i }));

    // Should fail and show error alert, keeping the initial good draft content
    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
      const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toBe('Initial good draft content');
    });
  });

  it('displays "Sending… (n of m)" label and disables Send button while generating', async () => {
    let resolveCall1: (res: Response) => void;
    const promise1 = new Promise<Response>((resolve) => {
      resolveCall1 = resolve;
    });

    let callIndex = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        callIndex++;
        if (callIndex === 1) {
          return promise1;
        }
        return new Response(makeAnthropicStream('Draft 2'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    // Running 1st of 2 outputs: button disabled and labeled "Sending… (1 of 2)"
    await waitFor(() => {
      expect(screen.getByText('Sending… (1 of 2)')).toBeTruthy();
      expect(screen.getByRole('button', { name: /sending… \(1 of 2\)/i }).hasAttribute('disabled')).toBe(true);
    });

    // Resolve first call
    resolveCall1!(
      new Response(makeAnthropicStream('Draft 1'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );

    // Generation completes and button resets to Send
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^send$/i })).toBeTruthy();
    });
  });

  it('switches to Outputs tab on narrow screens on Send with generating dot indicator (§17.1)', async () => {
    let resolveStream: (res: Response) => void;
    const streamPromise = new Promise<Response>((resolve) => {
      resolveStream = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return streamPromise;
      }),
    );

    render(<App />);

    // Initially on narrow screen Inputs tab
    const inputsTabBtn = screen.getByRole('tab', { name: /^inputs$/i });
    const outputsTabBtn = screen.getByRole('tab', { name: /^outputs$/i });
    expect(inputsTabBtn.getAttribute('aria-selected')).toBe('true');
    expect(outputsTabBtn.getAttribute('aria-selected')).toBe('false');

    // Click Send
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    // Auto-switches to Outputs tab
    await waitFor(() => {
      expect(outputsTabBtn.getAttribute('aria-selected')).toBe('true');
    });

    // Outputs tab shows the generating dot while active
    const generatingDot = within(outputsTabBtn).getByLabelText('Generating');
    expect(generatingDot).toBeTruthy();

    resolveStream!(
      new Response(makeAnthropicStream('Done'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );

    // Await stream completion so generation settles cleanly within the test
    await waitFor(() => {
      expect(within(outputsTabBtn).queryByLabelText('Generating')).toBeNull();
    });
  });

  it('Clear job resets tabs, clears outputs, and returns empty state (§14.5)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return new Response(makeAnthropicStream('Resume content'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    // Tabs appear
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /resume/i })).toBeTruthy();
    });

    // Click Clear job
    fireEvent.click(screen.getByRole('button', { name: /^clear job$/i }));

    // Confirm dialog appears
    const confirmClearBtn = screen.getByRole('button', { name: /^clear job$/i });
    fireEvent.click(confirmClearBtn);

    // Empty state returns
    await waitFor(() => {
      expect(screen.getByText('Your drafts will appear here')).toBeTruthy();
      expect(screen.queryByRole('tab', { name: /resume/i })).toBeNull();
    });
  });

  it('never writes job text or generated outputs to localStorage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return new Response(makeAnthropicStream('Super secret drafted resume text'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.getByText('Super secret drafted resume text')).toBeTruthy();
    });

    const allowedKeys = [
      `${APP_ID}:v1:masterInfo`,
      `${APP_ID}:v1:instructions`,
      `${APP_ID}:v1:apiKeys`,
      `${APP_ID}:v1:settings`,
    ];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${APP_ID}:`)) {
        expect(allowedKeys).toContain(key);
      }
    }

    // Explicitly verify output draft never entered localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      const val = localStorage.getItem(key) || '';
      expect(val).not.toContain('Super secret drafted resume text');
    }
  });

  describe('Error categories mapping during generation (§13.5)', () => {
    const errorCases = [
      {
        category: 'cors_or_network (offline)',
        setup: () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false),
        mockHandler: () => Promise.reject(new TypeError('Failed to fetch')),
        expectedMessage: 'You appear to be offline. Check your connection and try again.',
      },
      {
        category: 'cors_or_network (extensions/VPN/firewall)',
        setup: () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true),
        mockHandler: () => Promise.reject(new TypeError('Failed to fetch')),
        expectedMessage:
          'The request to api.anthropic.com was blocked before it reached the provider. This is usually caused by a browser extension (ad or privacy blocker), a VPN, a firewall or a work network. Try turning extensions off for this page, switching networks, or using the other provider. If it keeps happening, the provider may no longer allow requests from web pages; see Help.',
      },
      {
        category: 'auth (403)',
        setup: () => {},
        mockHandler: () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: { message: 'Forbidden key' } }), {
              status: 403,
              headers: { 'content-type': 'application/json' },
            }),
          ),
        expectedMessage:
          'The provider rejected your API key. Check that you pasted the whole key for Anthropic.',
      },
      {
        category: 'model_not_found (404)',
        setup: () => {},
        mockHandler: () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: { message: 'Model not found' } }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            }),
          ),
        expectedMessage:
          'The model "claude-3-5-sonnet" wasn\'t found or isn\'t available to your key. Pick another model or check the ID.',
      },
      {
        category: 'too_large (413)',
        setup: () => {},
        mockHandler: () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: { message: 'Payload Too Large' } }), {
              status: 413,
              headers: { 'content-type': 'application/json' },
            }),
          ),
        expectedMessage:
          'The request is too large for this provider. Remove or shrink attachments, or shorten your Master Info.',
      },
      {
        category: 'unsupported_input (400 image/pdf)',
        setup: () => {},
        mockHandler: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({ error: { message: 'Image and PDF input not supported by model' } }),
              {
                status: 400,
                headers: { 'content-type': 'application/json' },
              },
            ),
          ),
        expectedMessage:
          'This model may not read images or PDFs. Remove the file or pick another model.',
      },
      {
        category: 'bad_request (400 other)',
        setup: () => {},
        mockHandler: () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: { message: 'Invalid prompt parameters' } }), {
              status: 400,
              headers: { 'content-type': 'application/json' },
            }),
          ),
        expectedMessage: 'The provider rejected the request: Invalid prompt parameters',
      },
      {
        category: 'rate_limit (429 with Retry-After)',
        setup: () => {},
        mockHandler: () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
              status: 429,
              headers: { 'content-type': 'application/json', 'retry-after': '30' },
            }),
          ),
        expectedMessage: 'Rate limit reached for Anthropic. Try again in 30 seconds.',
      },
      {
        category: 'rate_limit (429 without Retry-After)',
        setup: () => {},
        mockHandler: () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
              status: 429,
              headers: { 'content-type': 'application/json' },
            }),
          ),
        expectedMessage: 'Rate limit reached for Anthropic. Wait a moment and press Retry.',
      },
      {
        category: 'server (500)',
        setup: () => {},
        mockHandler: () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: { message: 'Internal server error' } }), {
              status: 500,
              headers: { 'content-type': 'application/json' },
            }),
          ),
        expectedMessage: 'Anthropic had a server problem. Press Retry in a moment.',
      },
      {
        category: 'safety_blocked',
        setup: () => {
          storage.set('settings', {
            selectedProvider: 'gemini',
            selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
            rememberKeys: true,
            theme: 'system',
            paperSize: 'letter',
            showAllModels: false,
          });
        },
        mockHandler: () =>
          Promise.resolve(
            new Response('data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n', {
              status: 200,
              headers: { 'content-type': 'text/event-stream' },
            }),
          ),
        expectedMessage:
          'The provider blocked this response. Try rephrasing your custom instructions or check the job context.',
      },
      {
        category: 'safety_blocked (Gemini stream finishReason)',
        setup: () => {
          storage.set('settings', {
            selectedProvider: 'gemini',
            selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
            rememberKeys: true,
            theme: 'system',
            paperSize: 'letter',
            showAllModels: false,
          });
        },
        mockHandler: () =>
          Promise.resolve(
            new Response('data: {"candidates":[{"finishReason":"SAFETY"}]}\n\n', {
              status: 200,
              headers: { 'content-type': 'text/event-stream' },
            }),
          ),
        expectedMessage:
          'The provider blocked this response. Try rephrasing your custom instructions or check the job context.',
      },
      {
        category: 'unknown (418)',
        setup: () => {},
        mockHandler: () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: { message: "I'm a teapot" } }), {
              status: 418,
              headers: { 'content-type': 'application/json' },
            }),
          ),
        expectedMessage: "Something went wrong: I'm a teapot",
      },
      {
        category: 'csp_blocked',
        setup: () =>
          window.dispatchEvent(
            Object.assign(new Event('securitypolicyviolation'), {
              blockedURI: 'https://api.anthropic.com/v1/messages',
            }),
          ),
        mockHandler: () => Promise.reject(new TypeError('Failed to fetch')),
        expectedMessage:
          "This app's security policy blocked the request to api.anthropic.com. The hosted app only allows the Anthropic and Gemini addresses.",
      },
    ];

    it.each(errorCases)(
      'shows expected error message and Retry button for $category',
      async ({ setup, mockHandler, expectedMessage }) => {
        setup();

        vi.stubGlobal(
          'fetch',
          vi.fn().mockImplementation(async (url: string | URL | Request) => {
            const urlStr = String(url);
            if (urlStr.includes(':streamGenerateContent') || urlStr.includes('/messages')) {
              return mockHandler();
            }
            if (urlStr.includes('/models')) {
              return new Response(
                JSON.stringify({
                  data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }],
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
            return Promise.reject(new Error(`Unhandled URL: ${urlStr}`));
          }),
        );

        render(<App />);

        // Only generate Resume
        fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

        await waitFor(() => {
          expect(screen.getByText(expectedMessage)).toBeTruthy();
          expect(screen.getAllByRole('button', { name: /^retry$/i }).length).toBeGreaterThan(0);
        });
      },
    );
  });

  it('aborts active fetch request on Clear job, resets tabs to empty state, ignores post-abort stream text, and allows Send again (§14.5)', async () => {
    let capturedSignal: AbortSignal | null = null;
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    let messagesCallCount = 0;

    const encoder = new TextEncoder();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes('/models')) {
          return new Response(
            JSON.stringify({
              data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        if (urlStr.includes('/messages')) {
          messagesCallCount++;
          if (messagesCallCount === 1) {
            capturedSignal = (init?.signal as AbortSignal) || null;

            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
                const chunk1 = [
                  'event: message_start',
                  'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":1}}}',
                  '',
                  'event: content_block_start',
                  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
                  '',
                  'event: content_block_delta',
                  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Initial draft text before clear."}}',
                  '',
                  '',
                ].join('\n');
                controller.enqueue(encoder.encode(chunk1));
              },
            });

            return new Response(stream, {
              status: 200,
              headers: { 'content-type': 'text/event-stream' },
            });
          }

          // Second run (after clear)
          return new Response(makeAnthropicStream('Second run after clear succeeded!'), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }

        return Promise.reject(new Error(`Unhandled URL: ${urlStr}`));
      }),
    );

    render(<App />);

    // Unselect Cover Letter to run only Resume
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    // Initial streaming text arrives
    await waitFor(() => {
      const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toContain('Initial draft text before clear.');
    });

    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal!.aborted).toBe(false);

    // Click Clear job
    const clearJobBtn = screen.getByRole('button', { name: /^clear job$/i });
    fireEvent.click(clearJobBtn);

    // Confirmation dialog appears
    const confirmClearBtn = screen.getByRole('button', { name: /^clear job$/i });
    fireEvent.click(confirmClearBtn);

    // Assert AbortSignal was aborted
    expect(capturedSignal!.aborted).toBe(true);

    // Tabs reset to empty state
    await waitFor(() => {
      expect(screen.getByText('Your drafts will appear here')).toBeTruthy();
      expect(screen.queryByRole('tab', { name: /resume/i })).toBeNull();
    });

    // Attempt to emit text from the aborted stream
    if (streamController) {
      try {
        const postAbortChunk = [
          'event: content_block_delta',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" Should never be seen!"}}',
          '',
          '',
        ].join('\n');
        await act(async () => {
          try {
            (streamController as ReadableStreamDefaultController<Uint8Array>).enqueue(
              encoder.encode(postAbortChunk),
            );
            (streamController as ReadableStreamDefaultController<Uint8Array>).close();
          } catch {
            // Stream controller may be closed or in error state
          }
          await new Promise((r) => setTimeout(r, 100));
        });
      } catch {
        // Stream controller may be closed or in error state
      }
    }

    // Wait a brief moment and verify text emitted after abort never appears
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/should never be seen/i)).toBeNull();
    expect(screen.getByText('Your drafts will appear here')).toBeTruthy();

    // Now assert Send works again afterwards
    // Clear job resets selected outputs to defaults (Resume and Cover Letter on)
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));

    const sendAgainBtn = screen.getByRole('button', { name: /^send$/i });
    expect(sendAgainBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(sendAgainBtn);

    await waitFor(() => {
      const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toBe('Second run after clear succeeded!');
    });

    await screen.findByText(/Generated with Anthropic/i);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^send$/i }).hasAttribute('disabled')).toBe(false);
    });

    // Wait for 300 ms timers (SendBar estimate & stale checks) to settle cleanly inside act
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    expect(messagesCallCount).toBe(2);
  });

  it('completes request and displays text when mounted inside React.StrictMode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes('/models')) {
          return new Response(
            JSON.stringify({
              data: [
                { id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (urlStr.includes('/messages')) {
          return new Response(makeAnthropicStream('StrictMode generated content!'), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${urlStr}`));
      }),
    );

    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    // Unselect Cover Letter to run only Resume
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toBe('StrictMode generated content!');
    });
  });
});
