import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import limits from '../../src/data/limits.json';

describe('Stop generation UI & integration (SPEC §14.8, §17.3, §17.7)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';
  const cleanMasterInfo = '# Jordan Smith\nSenior Data Analyst\nSQL and Python experience.';

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
      showAllModels: {},
    });
    storage.set('apiKeys', { anthropic: fakeKey, gemini: 'fake-gemini-key' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('per-tab Stop button replaces Regenerate/Retry while generating, and shows Stop all in send bar', async () => {
    let streamResolve!: () => void;
    const streamPromise = new Promise<void>((r) => {
      streamResolve = r;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal;
        const stream = new ReadableStream({
          start(controller) {
            signal?.addEventListener('abort', () => {
              try {
                controller.error(new DOMException('Aborted', 'AbortError'));
              } catch {
                // Ignore if stream already closed
              }
            });
            streamPromise.finally(() => {
              try {
                controller.close();
              } catch {
                // Ignore if stream already closed
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

    // Unselect all except Resume to keep single generation
    const resumeToggle = screen.getByRole('button', { name: /^Resume$/i });
    const coverLetterToggle = screen.getByRole('button', { name: /^Cover Letter$/i });
    if (coverLetterToggle.getAttribute('aria-pressed') === 'true') {
      fireEvent.click(coverLetterToggle);
    }
    expect(resumeToggle.getAttribute('aria-pressed')).toBe('true');

    // Job context
    const contextInput = screen.getByLabelText(/Job context/i);
    fireEvent.change(contextInput, { target: { value: 'Data Analyst at Acme Corp' } });

    // Send
    const sendButton = screen.getByRole('button', { name: /^Send$/i });
    expect(sendButton.hasAttribute('disabled')).toBe(false);
    fireEvent.click(sendButton);

    // Now generating: Stop button appears in place of Regenerate on Resume tab
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop Resume' })).toBeTruthy();
    });

    // "Stop all" appears in SendBar beside Clear job
    expect(screen.getByRole('button', { name: 'Stop all outputs' })).toBeTruthy();

    // Clicking Stop Resume stops generation
    const stopResumeBtn = screen.getByRole('button', { name: 'Stop Resume' });
    fireEvent.click(stopResumeBtn);

    // Job should transition out of generating; Send button enabled again
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Stop Resume' })).toBeNull();
      expect(screen.getByRole('button', { name: /^Send$/i }).hasAttribute('disabled')).toBe(false);
    });

    // Error callout with category 'stopped'
    expect(
      screen.getByText(/Stopped before anything came back\. Press Retry, or choose another provider or model\./i),
    ).toBeTruthy();

    // Retry button is available in place of Stop (in toolbar and error callout)
    expect(screen.getAllByRole('button', { name: /Retry/i }).length).toBeGreaterThanOrEqual(1);

    // Context is untouched
    expect((screen.getByLabelText(/Job context/i) as HTMLTextAreaElement).value).toBe(
      'Data Analyst at Acme Corp',
    );

    streamResolve();
  });

  it('Stop preserves partial text, sets stopped notice, and allows restore after regeneration', async () => {
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
                controller.error(new DOMException('Aborted', 'AbortError'));
              } catch {
                // Ignore if stream already closed
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

    // Unselect Cover Letter
    const coverLetterToggle = screen.getByRole('button', { name: /^Cover Letter$/i });
    fireEvent.click(coverLetterToggle);

    // Job context
    const contextInput = screen.getByLabelText(/Job context/i);
    fireEvent.change(contextInput, { target: { value: 'Data Analyst at Acme Corp' } });

    // Send
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(() => {
      expect(streamController).toBeDefined();
    });

    // Push partial delta
    const sseChunk = [
      'event: content_block_delta',
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Partial draft content before stop"}}`,
      '',
      '',
    ].join('\n');

    act(() => {
      streamController.enqueue(encoder.encode(sseChunk));
    });

    await waitFor(() => {
      const editor = screen.getByLabelText(/Resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toContain('Partial draft content before stop');
    });

    // Click Stop
    const stopButton = screen.getByRole('button', { name: 'Stop Resume' });
    fireEvent.click(stopButton);

    // Status done, partial text kept, stopped notice shown
    await waitFor(() => {
      expect(screen.getByText(/Stopped early\. This draft is incomplete\. Press Regenerate to run it again\./i)).toBeTruthy();
    });

    const editor = screen.getByLabelText(/Resume draft/i) as HTMLTextAreaElement;
    expect(editor.value).toBe('Partial draft content before stop');
    expect(screen.getByRole('button', { name: /Regenerate/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Send$/i }).hasAttribute('disabled')).toBe(false);
  });

  it('Stop all cancels all queued and running drafts and enables Send', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal;
        const stream = new ReadableStream({
          start(controller) {
            signal?.addEventListener('abort', () => {
              controller.error(new DOMException('Aborted', 'AbortError'));
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

    // Job context
    const contextInput = screen.getByLabelText(/Job context/i);
    fireEvent.change(contextInput, { target: { value: 'Data Analyst at Acme Corp' } });

    // Send (Resume & Cover Letter selected by default)
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop all outputs' })).toBeTruthy();
    });

    // Click Stop all
    fireEvent.click(screen.getByRole('button', { name: 'Stop all outputs' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Stop all outputs' })).toBeNull();
      expect(screen.getByRole('button', { name: /^Send$/i }).hasAttribute('disabled')).toBe(false);
    });
  });

  it('waiting hint appears after 20 s with fake timers and disappears when text arrives', async () => {
    vi.useFakeTimers();

    const encoder = new TextEncoder();
    let streamController!: ReadableStreamDefaultController;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        const stream = new ReadableStream({
          start(controller) {
            streamController = controller;
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );

    const { container } = render(<App />);

    // Unselect Cover Letter
    fireEvent.click(screen.getByRole('button', { name: /^Cover Letter$/i }));

    // Job context
    fireEvent.change(screen.getByLabelText(/Job context/i), {
      target: { value: 'Data Analyst' },
    });

    // Send
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await vi.waitFor(() => {
      expect(streamController).toBeDefined();
    });

    // Initially, no waiting hint
    expect(container.querySelectorAll('.bg-muted\\/40')).toHaveLength(0);

    // Advance 19 seconds (< waitingHintSeconds)
    act(() => {
      vi.advanceTimersByTime((limits.waitingHintSeconds - 1) * 1000);
    });
    expect(container.querySelectorAll('.bg-muted\\/40')).toHaveLength(0);

    // Advance to 20 seconds
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(container.querySelectorAll('.bg-muted\\/40')).toHaveLength(1);
    expect(
      screen.getAllByText(/Still waiting for the provider\. You can press Stop and try another provider or model\./i).length,
    ).toBeGreaterThanOrEqual(1);

    // Now deltas arrive -> waiting hint disappears
    const sseChunk = [
      'event: content_block_delta',
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Arrived text"}}`,
      '',
      '',
    ].join('\n');

    await act(async () => {
      streamController.enqueue(encoder.encode(sseChunk));
      const endChunk = [
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
        '',
      ].join('\n');
      streamController.enqueue(encoder.encode(endChunk));
      try {
        streamController.close();
      } catch {
        // ignore
      }
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.querySelectorAll('.bg-muted\\/40')).toHaveLength(0);
      expect(screen.getByRole('button', { name: /^Send$/i }).hasAttribute('disabled')).toBe(false);
    });

    vi.useRealTimers();
  });

  it('no new live regions are created by stop UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const { container } = render(<App />);
    const liveRegions = container.querySelectorAll('[aria-live="polite"].sr-only');
    expect(liveRegions).toHaveLength(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Send$/i })).toBeTruthy();
    });
  });

  it('queued job stopped by Stop all does not leak stopped state into subsequent Send (B1 repro)', async () => {
    let sendRunIndex = 0;

    const makeStream = (text: string) => {
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

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal;
        const bodyStr = typeof init?.body === 'string' ? init.body : '';

        let kind = 'resume';
        if (bodyStr.includes('COVER_LETTER')) {
          kind = 'cover-letter';
        } else if (bodyStr.includes('LINKEDIN_MESSAGE')) {
          kind = 'linkedin';
        }

        if (sendRunIndex === 1) {
          // First run: active jobs stay open until aborted
          const stream = new ReadableStream({
            start(controller) {
              signal?.addEventListener('abort', () => {
                try {
                  controller.error(new DOMException('Aborted', 'AbortError'));
                } catch {
                  // ignore
                }
              });
            },
          });
          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }

        // Second run: return text immediately
        return new Response(makeStream(`Generated text for ${kind} on run 2`), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    // Select 3 outputs: Resume, Cover Letter, LinkedIn Message
    const linkedinToggle = screen.getByRole('button', { name: /^LinkedIn message$/i });
    fireEvent.click(linkedinToggle);
    expect(linkedinToggle.getAttribute('aria-pressed')).toBe('true');

    // Add Job context
    const contextInput = screen.getByLabelText(/Job context/i);
    fireEvent.change(contextInput, { target: { value: 'Senior Computational Biologist' } });

    // First Send
    sendRunIndex = 1;
    const sendButton = screen.getByRole('button', { name: /^Send$/i });
    fireEvent.click(sendButton);

    // Stop all button appears
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop all outputs' })).toBeTruthy();
    });

    // Concurrency is 2: Resume and Cover Letter are running, LinkedIn Message is queued
    fireEvent.click(screen.getByRole('button', { name: 'Stop all outputs' }));

    // Wait for Send button to be re-enabled
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Stop all outputs' })).toBeNull();
      expect(screen.getByRole('button', { name: /^Send$/i }).hasAttribute('disabled')).toBe(false);
    });

    // Second Send: run again with all 3 outputs
    sendRunIndex = 2;
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    // Wait for all 3 generations to complete
    await waitFor(
      () => {
        expect(screen.queryByRole('button', { name: 'Stop all outputs' })).toBeNull();
        expect(screen.getByRole('button', { name: /^Send$/i }).hasAttribute('disabled')).toBe(false);
      },
      { timeout: 5000 },
    );

    // Assert every selected tab ends with its generated text and none is stuck on generating
    const resumeTabBtn = screen.getByRole('tab', { name: /Resume/i });
    fireEvent.keyDown(resumeTabBtn, { key: 'Enter', code: 'Enter' });
    fireEvent.click(resumeTabBtn);
    expect((screen.getByLabelText(/Resume draft/i) as HTMLTextAreaElement).value).toContain(
      'Generated text for resume on run 2',
    );
    expect(screen.queryByText(/Generating…/i)).toBeNull();

    const clTabBtn = screen.getByRole('tab', { name: /Cover Letter/i });
    fireEvent.keyDown(clTabBtn, { key: 'Enter', code: 'Enter' });
    fireEvent.click(clTabBtn);
    await waitFor(() => {
      expect((screen.getByLabelText(/Cover letter draft/i) as HTMLTextAreaElement).value).toContain(
        'Generated text for cover-letter on run 2',
      );
    });
    expect(screen.queryByText(/Generating…/i)).toBeNull();

    const liTabBtn = screen.getByRole('tab', { name: /LinkedIn/i });
    fireEvent.keyDown(liTabBtn, { key: 'Enter', code: 'Enter' });
    fireEvent.click(liTabBtn);
    await waitFor(() => {
      expect((screen.getByLabelText(/LinkedIn message draft/i) as HTMLTextAreaElement).value).toContain(
        'Generated text for linkedin on run 2',
      );
    });
    expect(screen.queryByText(/Generating…/i)).toBeNull();
  });

  it('queued job stopped by per-tab Stop does not leak stopped state into subsequent regenerate (B1 repro)', async () => {
    let mode: 'initial' | 'second-run-active' | 'regenerate-linkedin' = 'initial';

    const makeStream = (text: string) => {
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

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal;
        const bodyStr = typeof init?.body === 'string' ? init.body : '';

        let kind = 'resume';
        if (bodyStr.includes('COVER_LETTER')) {
          kind = 'cover-letter';
        } else if (bodyStr.includes('LINKEDIN_MESSAGE')) {
          kind = 'linkedin';
        }

        if (mode === 'initial') {
          return new Response(makeStream(`Initial text for ${kind}`), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }

        if (mode === 'second-run-active') {
          const stream = new ReadableStream({
            start(controller) {
              signal?.addEventListener('abort', () => {
                try {
                  controller.error(new DOMException('Aborted', 'AbortError'));
                } catch {
                  // ignore
                }
              });
            },
          });
          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }

        // regenerate-linkedin
        return new Response(makeStream('Regenerated fresh text for linkedin'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    // Select Resume, Cover Letter, LinkedIn Message
    const linkedinToggle = screen.getByRole('button', { name: /^LinkedIn message$/i });
    fireEvent.click(linkedinToggle);

    // Context
    fireEvent.change(screen.getByLabelText(/Job context/i), {
      target: { value: 'Senior Computational Biologist' },
    });

    // Run initial generation to populate all 3 tabs
    mode = 'initial';
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /^Send$/i }).hasAttribute('disabled')).toBe(false);
      },
      { timeout: 5000 },
    );

    // Now all 3 tabs exist. Start second run where LinkedIn will be queued.
    mode = 'second-run-active';
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    // Switch to LinkedIn Message tab while it is queued
    const liTab = screen.getByRole('tab', { name: /LinkedIn/i });
    fireEvent.keyDown(liTab, { key: 'Enter', code: 'Enter' });
    fireEvent.click(liTab);

    // In toolbar, the Stop button is present for LinkedIn
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop LinkedIn' })).toBeTruthy();
    });

    // Click per-tab Stop on the queued LinkedIn message tab
    fireEvent.click(screen.getByRole('button', { name: 'Stop LinkedIn' }));

    // Stop all remaining active jobs so Send/Regenerate becomes available
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop all outputs' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stop all outputs' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Send$/i }).hasAttribute('disabled')).toBe(false);
    });

    // Now click Regenerate on LinkedIn message tab
    mode = 'regenerate-linkedin';
    const regenBtn = screen.getByRole('button', { name: /Regenerate/i });
    fireEvent.click(regenBtn);

    // Assert text arrives and tab is not stuck generating
    await waitFor(
      () => {
        const editor = screen.getByLabelText(/LinkedIn message draft/i) as HTMLTextAreaElement;
        expect(editor.value).toContain('Regenerated fresh text for linkedin');
      },
      { timeout: 5000 },
    );
    expect(screen.queryByText(/Generating…/i)).toBeNull();
  });

  it('stopped draft is marked stale when job inputs change during streaming (stopTab and stopAll)', async () => {
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
                controller.error(new DOMException('Aborted', 'AbortError'));
              } catch {
                // ignore
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

    // Select Resume only
    const coverLetterToggle = screen.getByRole('button', { name: /^Cover Letter$/i });
    fireEvent.click(coverLetterToggle);

    const contextInput = screen.getByLabelText(/Job context/i);
    fireEvent.change(contextInput, { target: { value: 'Initial context for stopTab test' } });

    // Send
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(() => {
      expect(streamController).toBeDefined();
    });

    // Stream partial delta
    const sseChunk = [
      'event: content_block_delta',
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Partial resume text before stopTab"}}`,
      '',
      '',
    ].join('\n');

    act(() => {
      streamController.enqueue(encoder.encode(sseChunk));
    });

    await waitFor(() => {
      const editor = screen.getByLabelText(/Resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toContain('Partial resume text before stopTab');
    });

    // While streaming, change Job context
    fireEvent.change(contextInput, { target: { value: 'Modified context after stream started' } });

    // Click per-tab Stop
    fireEvent.click(screen.getByRole('button', { name: 'Stop Resume' }));

    // Wait for debounced stale badge calculation
    await waitFor(
      () => {
        expect(screen.getByText(/Inputs changed since this was generated/i)).toBeTruthy();
      },
      { timeout: 1500 },
    );

    // Part 2: Test stopAll with input change during streaming
    // Reset context to another value
    fireEvent.change(contextInput, { target: { value: 'Initial context for stopAll test' } });

    // Click Regenerate
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop all outputs' })).toBeTruthy();
    });

    // Stream partial delta
    const sseChunk2 = [
      'event: content_block_delta',
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Partial resume text before stopAll"}}`,
      '',
      '',
    ].join('\n');

    act(() => {
      streamController.enqueue(encoder.encode(sseChunk2));
    });

    await waitFor(() => {
      const editor = screen.getByLabelText(/Resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toContain('Partial resume text before stopAll');
    });

    // While streaming, modify Job context again
    fireEvent.change(contextInput, { target: { value: 'Modified context during stopAll stream' } });

    // Click Stop all outputs
    fireEvent.click(screen.getByRole('button', { name: 'Stop all outputs' }));

    // Wait for debounced stale badge calculation
    await waitFor(
      () => {
        expect(screen.getByText(/Inputs changed since this was generated/i)).toBeTruthy();
      },
      { timeout: 1500 },
    );
  });

  it('after stopAll the generating state is released only when no job is pending or settling', async () => {
    let job1Settle!: () => void;
    let job2Settle!: () => void;
    const job1SettlingPromise = new Promise<void>((r) => {
      job1Settle = r;
    });
    const job2SettlingPromise = new Promise<void>((r) => {
      job2Settle = r;
    });

    let fetchCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal;
        fetchCount++;
        const currentFetch = fetchCount;
        const stream = new ReadableStream({
          start(controller) {
            signal?.addEventListener('abort', async () => {
              if (currentFetch === 1) {
                await job1SettlingPromise;
              } else {
                await job2SettlingPromise;
              }
              try {
                controller.error(new DOMException('Aborted', 'AbortError'));
              } catch {
                // ignore
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

    // Add job context
    fireEvent.change(screen.getByLabelText(/Job context/i), {
      target: { value: 'Senior Analyst' },
    });

    // Send (Resume and Cover Letter run concurrently)
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop all outputs' })).toBeTruthy();
    });

    // Click Stop all outputs
    fireEvent.click(screen.getByRole('button', { name: 'Stop all outputs' }));

    // While jobs are settling, Send MUST NOT be enabled yet (generating state is not released)
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;
    expect(sendButton.hasAttribute('disabled')).toBe(true);
    expect(sendButton.textContent).toContain('Sending…');

    // Let job 1 finish settling
    act(() => {
      job1Settle();
    });

    // While job 2 is still settling, Send must still NOT be enabled
    expect(sendButton.hasAttribute('disabled')).toBe(true);
    expect(sendButton.textContent).toContain('Sending…');

    // Now let job 2 finish settling
    act(() => {
      job2Settle();
    });

    // Now both jobs have settled: Send is enabled and generating state is released
    await waitFor(() => {
      expect(sendButton.hasAttribute('disabled')).toBe(false);
      expect(sendButton.textContent).toBe('Send');
      expect(screen.queryByRole('button', { name: 'Stop all outputs' })).toBeNull();
    });
  });
});
