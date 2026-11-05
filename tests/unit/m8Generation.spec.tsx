import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import { APP_ID } from '../../src/config';

describe('Milestone M8 Multi-output Queue, Versions, Stale Badge, and Clear', () => {
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

  it('generates all five; unselect four; edit custom instructions; Send only regenerates Resume and others show stale badge', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        callCount++;
        return new Response(makeAnthropicStream(`Draft output call ${callCount}`), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    // Toggle on LinkedIn Message, Email, and Answers (Resume and Cover Letter are selected by default)
    const linkedinToggle = screen.getByRole('button', { name: /linkedin message/i });
    const emailToggle = screen.getByRole('button', { name: /email/i });
    const answersToggle = screen.getByRole('button', { name: /application answers/i });

    fireEvent.click(linkedinToggle);
    fireEvent.click(emailToggle);
    fireEvent.click(answersToggle);

    // Provide questions for Answers
    const questionsArea = screen.getByLabelText(/application questions/i);
    fireEvent.change(questionsArea, { target: { value: '1. What is your experience with SQL?' } });

    // Click Send -> all 5 generate
    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    // Wait for all 5 to complete
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^send$/i })).toBeTruthy();
      expect(callCount).toBe(5);
    });

    // Unselect 4: Cover Letter, LinkedIn Message, Email, Answers
    const coverLetterToggle = screen.getByRole('button', { name: /cover letter/i });
    fireEvent.click(coverLetterToggle);
    fireEvent.click(linkedinToggle);
    fireEvent.click(emailToggle);
    fireEvent.click(answersToggle);

    // Edit Custom Instructions
    const customDetails = screen.getByText(/custom instructions \(this job only\)/i);
    fireEvent.click(customDetails);
    const customTextarea = screen.getByPlaceholderText(/e.g. Emphasise reporting automation/i);
    fireEvent.change(customTextarea, { target: { value: 'Focus on senior leadership qualities.' } });

    // Send -> only Resume regenerates (callCount becomes 6)
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(callCount).toBe(6);
      expect(screen.getByRole('button', { name: /^send$/i })).toBeTruthy();
    });

    // Resume tab was regenerated with new draft, so Resume is NOT stale
    const resumeTab = screen.getByRole('tab', { name: /^resume/i });
    expect(within(resumeTab).queryByLabelText('Inputs changed')).toBeNull();

    // The other 4 tabs show the stale amber dot on their tab trigger
    const coverLetterTabTrigger = screen.getByRole('tab', { name: /cover letter/i });
    const linkedinTabTrigger = screen.getByRole('tab', { name: /linkedin/i });
    const emailTabTrigger = screen.getByRole('tab', { name: /email/i });
    const answersTabTrigger = screen.getByRole('tab', { name: /answers/i });

    await waitFor(() => {
      expect(within(coverLetterTabTrigger).getByLabelText('Inputs changed')).toBeTruthy();
      expect(within(linkedinTabTrigger).getByLabelText('Inputs changed')).toBeTruthy();
      expect(within(emailTabTrigger).getByLabelText('Inputs changed')).toBeTruthy();
      expect(within(answersTabTrigger).getByLabelText('Inputs changed')).toBeTruthy();
    });

    // Switching to Cover Letter tab shows the visible stale badge with title and details
    const coverLetterTab = screen.getByRole('tab', { name: /cover letter/i });
    fireEvent.keyDown(coverLetterTab, { key: 'Enter', code: 'Enter' });
    fireEvent.click(coverLetterTab);

    await waitFor(() => {
      expect(screen.getByText('Inputs changed since this was generated')).toBeTruthy();
    });
  });

  it('editing Questions box marks ONLY the Answers tab stale', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        callCount++;
        return new Response(makeAnthropicStream(`Draft for call ${callCount}`), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    // Select Answers
    const answersToggle = screen.getByRole('button', { name: /application answers/i });
    fireEvent.click(answersToggle);

    const questionsArea = screen.getByLabelText(/application questions/i);
    fireEvent.change(questionsArea, { target: { value: 'Original question 1' } });

    // Click Send (Resume, Cover Letter, Answers)
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(callCount).toBe(3);
      expect(screen.getByRole('button', { name: /^send$/i })).toBeTruthy();
    });

    // No stale dots initially
    const initialResumeTab = screen.getByRole('tab', { name: /^resume/i });
    const initialCoverLetterTab = screen.getByRole('tab', { name: /cover letter/i });
    const initialAnswersTab = screen.getByRole('tab', { name: /answers/i });

    expect(within(initialResumeTab).queryByLabelText('Inputs changed')).toBeNull();
    expect(within(initialCoverLetterTab).queryByLabelText('Inputs changed')).toBeNull();
    expect(within(initialAnswersTab).queryByLabelText('Inputs changed')).toBeNull();

    // Switch to fake timers for debounced stale badge recomputation (300 ms)
    vi.useFakeTimers();
    try {
      // Now edit ONLY the Questions box
      fireEvent.change(questionsArea, { target: { value: 'Modified question 1 with extra details' } });

      // Before 300 ms debounce fires, stale dot is not yet present
      expect(within(initialAnswersTab).queryByLabelText('Inputs changed')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Debounced stale badge recomputed (300ms)
      expect(within(initialAnswersTab).getByLabelText('Inputs changed')).toBeTruthy();

      // Resume and Cover Letter MUST NOT be marked stale
      expect(within(initialResumeTab).queryByLabelText('Inputs changed')).toBeNull();
      expect(within(initialCoverLetterTab).queryByLabelText('Inputs changed')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('handles edit-overwrite confirmation (Cancel starts nothing; Continue folds edit into previous and starts)', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        callCount++;
        return new Response(makeAnthropicStream(`Version ${callCount} content`), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    // Unselect Cover Letter so only Resume runs
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(callCount).toBe(1);
    });

    // Verify initial generated text in Resume editor
    const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
    expect(editor.value).toBe('Version 1 content');

    // User edits the draft
    fireEvent.change(editor, { target: { value: 'My custom edited resume text' } });
    expect(editor.value).toBe('My custom edited resume text');
    expect(screen.getByText('Edited')).toBeTruthy();

    // User clicks Regenerate
    const regenBtn = screen.getByRole('button', { name: /regenerate/i });
    fireEvent.click(regenBtn);

    // Overwrite confirm dialog appears with exact text
    const dialogDescription = screen.getByText(
      'You edited Resume. Regenerating will replace your edits (you can still restore the previous version once). Continue?',
    );
    expect(dialogDescription).toBeTruthy();

    // Click Cancel -> dialog closes, nothing started, callCount stays 1
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(callCount).toBe(1);
    expect(editor.value).toBe('My custom edited resume text');

    // Click Regenerate again, and click Continue
    fireEvent.click(regenBtn);
    const continueBtn = screen.getByRole('button', { name: /continue/i });
    fireEvent.click(continueBtn);

    // Generation proceeds (callCount becomes 2)
    await waitFor(() => {
      expect(callCount).toBe(2);
      expect(editor.value).toBe('Version 2 content');
    });

    // Previous version was folded to include the user's edits
    // Restore previous version button is now enabled
    const restoreBtn = screen.getByRole('button', { name: /restore previous version/i });
    expect(restoreBtn.hasAttribute('disabled')).toBe(false);

    // Click Restore -> restored text is 'My custom edited resume text'
    fireEvent.click(restoreBtn);
    expect(editor.value).toBe('My custom edited resume text');
  });

  it('restore previous version: with unsaved edits asks "Discard your unsaved edits to this tab?", cancel preserves edits, confirm restores', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        callCount++;
        return new Response(makeAnthropicStream(`Draft generation ${callCount}`), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    // Unselect Cover Letter so only Resume runs
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(callCount).toBe(1);
    });

    // Regenerate to create version 2 (version 1 becomes previous)
    const regenBtn = screen.getByRole('button', { name: /regenerate/i });
    fireEvent.click(regenBtn);

    await waitFor(() => {
      expect(callCount).toBe(2);
    });

    const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
    expect(editor.value).toBe('Draft generation 2');

    // Make an unsaved edit to the current version
    fireEvent.change(editor, { target: { value: 'Unsaved edits on v2' } });
    expect(screen.getByText('Edited')).toBeTruthy();

    // Click Restore previous version -> dialog asks to discard
    const restoreBtn = screen.getByRole('button', { name: /restore previous version/i });
    fireEvent.click(restoreBtn);

    expect(screen.getByRole('heading', { name: 'Discard your unsaved edits to this tab?' })).toBeTruthy();

    // Cancel preserves unsaved edits
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(editor.value).toBe('Unsaved edits on v2');

    // Click Restore again and confirm
    fireEvent.click(restoreBtn);
    const confirmBtn = screen.getByRole('button', { name: /^continue$/i });
    fireEvent.click(confirmBtn);

    // Restores Draft generation 1, userEdited is reset
    expect(editor.value).toBe('Draft generation 1');
    expect(screen.queryByText('Edited')).toBeNull();
  });

  it('per-tab Regenerate runs while another job runs, and works on an unselected kind', async () => {
    let resolveResume: (res: Response) => void;
    const resumePromise = new Promise<Response>((resolve) => {
      resolveResume = resolve;
    });

    let resumeCount = 0;
    let coverLetterCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
        if (url.includes('/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        const bodyStr = opts.body as string;

        if (bodyStr.includes('output=\\"RESUME\\"')) {
          resumeCount++;
          if (resumeCount === 1) {
            return resumePromise;
          }
          return new Response(makeAnthropicStream('Resume updated'), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }

        coverLetterCount++;
        return new Response(makeAnthropicStream(`Cover Letter run ${coverLetterCount}`), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    // Generate both initially, but Resume hangs
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    // Cover letter finishes immediately
    await waitFor(() => {
      expect(coverLetterCount).toBe(1);
    });

    // Unselect Cover Letter toggle from Outputs
    const coverLetterToggle = screen.getByRole('button', { name: /cover letter/i });
    fireEvent.click(coverLetterToggle);
    expect(coverLetterToggle.getAttribute('aria-pressed')).toBe('false');

    // Switch to Cover Letter tab
    const coverLetterTab = screen.getByRole('tab', { name: /cover letter/i });
    fireEvent.keyDown(coverLetterTab, { key: 'Enter', code: 'Enter' });
    fireEvent.click(coverLetterTab);

    // Cover Letter is unselected, but per-tab Regenerate is available and runs while Resume is still hanging!
    const coverLetterRegen = screen.getByRole('button', { name: /regenerate/i });
    expect(coverLetterRegen.hasAttribute('disabled')).toBe(false);

    fireEvent.click(coverLetterRegen);

    await waitFor(() => {
      expect(coverLetterCount).toBe(2);
    });

    // Resolve resume
    resolveResume!(
      new Response(makeAnthropicStream('Resume finished'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^send$/i })).toBeTruthy();
    });
  });

  it('Clear job aborts all in-flight and queued jobs, resets tabs to empty state, and ignores late arrivals', async () => {
    const fetchSignals: AbortSignal[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
        if (url.includes('/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (opts.signal) {
          fetchSignals.push(opts.signal);
        }
        // Never resolve automatically to simulate in-flight requests
        return new Promise<Response>(() => {});
      }),
    );

    render(<App />);

    // Select 3 outputs: Resume, Cover Letter, LinkedIn Message
    // Since concurrency is 2: 2 will be in-flight, 1 will be queued
    const linkedinToggle = screen.getByRole('button', { name: /linkedin message/i });
    fireEvent.click(linkedinToggle);

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    // Wait until 2 jobs are in-flight
    await waitFor(() => {
      expect(fetchSignals.length).toBe(2);
    });

    // Click Clear job and confirm
    fireEvent.click(screen.getByRole('button', { name: /clear job/i }));
    const confirmClearBtn = screen.getByRole('button', { name: /^clear job$/i });
    fireEvent.click(confirmClearBtn);

    // Both in-flight fetch requests were aborted
    expect(fetchSignals[0].aborted).toBe(true);
    expect(fetchSignals[1].aborted).toBe(true);

    // Empty state returns, tabs are hidden
    await waitFor(() => {
      expect(screen.getByText('Your drafts will appear here')).toBeTruthy();
    });

    // Send button works again
    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    expect(sendBtn.hasAttribute('disabled')).toBe(false);
  });

  it('completes multi-output generation inside React.StrictMode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(makeAnthropicStream('Draft in StrictMode'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      const editor = screen.getByLabelText(/resume draft/i) as HTMLTextAreaElement;
      expect(editor.value).toBe('Draft in StrictMode');
    });
  });

  it('never writes job text, drafts, snapshots, or queue state to localStorage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(makeAnthropicStream('Sensitive generated draft content'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^send$/i })).toBeTruthy();
    });

    // Check all keys in localStorage
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
      expect(val).not.toContain('Sensitive generated draft content');
      expect(val).not.toContain('queue');
      expect(val).not.toContain('snapshot');
    }
  });

  it('registers beforeunload handler while outputs exist and removes it after Clear job (§20 M8)', async () => {
    const addListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(makeAnthropicStream('Draft output for beforeunload test'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    render(<App />);

    // Before generation: no beforeunload listener registered
    const initialAdds = addListenerSpy.mock.calls.filter((c) => c[0] === 'beforeunload');
    expect(initialAdds.length).toBe(0);

    // Generate a draft (Resume is selected by default)
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    // Handler registered while outputs exist
    await waitFor(() => {
      const adds = addListenerSpy.mock.calls.filter((c) => c[0] === 'beforeunload');
      expect(adds.length).toBeGreaterThan(0);
      expect(screen.getByText('Draft output for beforeunload test')).toBeTruthy();
    });

    // Press Clear job and confirm
    fireEvent.click(screen.getByRole('button', { name: /clear job/i }));
    const confirmClearBtn = screen.getByRole('button', { name: /^clear job$/i });
    fireEvent.click(confirmClearBtn);

    // Handler removed after Clear job
    await waitFor(() => {
      const adds = addListenerSpy.mock.calls.filter((c) => c[0] === 'beforeunload');
      const removes = removeListenerSpy.mock.calls.filter((c) => c[0] === 'beforeunload');
      expect(removes.length).toBeGreaterThan(0);
      expect(removes.length).toBe(adds.length);
    });
  });

  describe('Per-tab Regenerate/Retry Send-Blocker Gating (§17.3, §14.3)', () => {
    it('(i) with Master Info unedited sample, Regenerate of an existing draft sends no request and the button is disabled', async () => {
      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('/models')) {
            return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          callCount++;
          return new Response(makeAnthropicStream(`Resume version ${callCount}`), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }),
      );

      render(<App />);

      // Only Resume selected
      fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => {
        expect(callCount).toBe(1);
        expect(screen.getByLabelText(/resume draft/i)).toBeTruthy();
      });

      const regenBtn = screen.getByRole('button', { name: /regenerate/i });
      expect(regenBtn.hasAttribute('disabled')).toBe(false);

      // Re-introduce unedited sample marker into Master Info
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      const masterInfoTab = await screen.findByRole('tab', { name: /master info/i });
      fireEvent.keyDown(masterInfoTab, { key: 'Enter', code: 'Enter' });
      const editor = await screen.findByRole('textbox', { name: 'Master Info' });
      fireEvent.change(editor, {
        target: { value: '<!-- TEMPLATE-UNEDITED: delete this line -->\n# Jordan Smith\nSenior Data Analyst' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
      fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

      // Regenerate button must be disabled and linked to blocker reason
      expect(regenBtn.hasAttribute('disabled')).toBe(true);
      expect(regenBtn.getAttribute('aria-describedby')).toBe('send-blocker-reason');

      // Attempting to click sends no request
      fireEvent.click(regenBtn);
      expect(callCount).toBe(1);
    });

    it('(ii) same with empty job context on Answers draft, Regenerate sends no request and the button is disabled', async () => {
      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('/models')) {
            return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          callCount++;
          return new Response(makeAnthropicStream(`Answers version ${callCount}`), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }),
      );

      render(<App />);

      // Unselect Resume and Cover Letter, select Answers
      fireEvent.click(screen.getByRole('button', { name: /resume/i }));
      fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
      fireEvent.click(screen.getByRole('button', { name: /application answers/i }));

      // Provide questions so Send is not blocked initially
      const questionsArea = screen.getByLabelText(/application questions/i);
      fireEvent.change(questionsArea, { target: { value: '1. Why RefractBio?' } });

      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => {
        expect(callCount).toBe(1);
        expect(screen.getByLabelText(/answers draft/i)).toBeTruthy();
      });

      const regenBtn = screen.getByRole('button', { name: /regenerate/i });
      expect(regenBtn.hasAttribute('disabled')).toBe(false);

      // Clear questions and ensure no attachments exist (empty job context for Answers)
      fireEvent.change(questionsArea, { target: { value: '   ' } });

      // Regenerate button on Answers must be disabled and linked to blocker reason
      expect(regenBtn.hasAttribute('disabled')).toBe(true);
      expect(regenBtn.getAttribute('aria-describedby')).toBe('send-blocker-reason');

      // Attempting to click sends no request
      fireEvent.click(regenBtn);
      expect(callCount).toBe(1);
    });

    it('(iii) with an attachment in an error state, Regenerate sends no request and the button is disabled', async () => {
      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('/models')) {
            return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          callCount++;
          return new Response(makeAnthropicStream(`Resume version ${callCount}`), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }),
      );

      render(<App />);

      // Only Resume selected
      fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => {
        expect(callCount).toBe(1);
        expect(screen.getByLabelText(/resume draft/i)).toBeTruthy();
      });

      const regenBtn = screen.getByRole('button', { name: /regenerate/i });
      expect(regenBtn.hasAttribute('disabled')).toBe(false);

      // Add a file that enters error status during reading
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const badText = 'a'.repeat(98) + '\uFFFD\uFFFD';
      const badFile = new File([badText], 'bad.txt', { type: 'text/plain' });
      fireEvent.change(fileInput, { target: { files: [badFile] } });

      await waitFor(() => {
        expect(screen.getByText(/Remove the file marked with an error/i)).toBeTruthy();
      });

      // Regenerate button must be disabled and linked to blocker reason
      expect(regenBtn.hasAttribute('disabled')).toBe(true);
      expect(regenBtn.getAttribute('aria-describedby')).toBe('send-blocker-reason');

      // Attempting to click sends no request
      fireEvent.click(regenBtn);
      expect(callCount).toBe(1);
    });

    it('(iv) when no blocker applies, Regenerate still works', async () => {
      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('/models')) {
            return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          callCount++;
          return new Response(makeAnthropicStream(`Resume version ${callCount}`), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }),
      );

      render(<App />);

      // Only Resume selected
      fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => {
        expect(callCount).toBe(1);
        expect(screen.getByLabelText(/resume draft/i)).toBeTruthy();
      });

      const regenBtn = screen.getByRole('button', { name: /regenerate/i });
      expect(regenBtn.hasAttribute('disabled')).toBe(false);

      // Click Regenerate
      fireEvent.click(regenBtn);

      await waitFor(() => {
        expect(callCount).toBe(2);
      });
    });
  });
});
