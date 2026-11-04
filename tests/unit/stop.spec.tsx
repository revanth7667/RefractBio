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
});
