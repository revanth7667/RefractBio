import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import { getPrefixedKey } from '../../src/storage/keys';
import { SettingsProvider } from '../../src/state/SettingsContext';
import { MasterInfoProvider } from '../../src/state/MasterInfoContext';
import { InstructionsProvider } from '../../src/state/InstructionsContext';
import { JobProvider } from '../../src/state/JobContext';
import { GenerationProvider, useGeneration } from '../../src/state/GenerationContext';
import { MainLayout } from '../../src/ui/layout/MainLayout';
import { MainWorkspace } from '../../src/ui/layout/MainWorkspace';

function AnnouncementTrigger({ message }: { message: string }) {
  const { announceStatus } = useGeneration();
  return (
    <button type="button" onClick={() => announceStatus(message)}>
      Trigger Announcement
    </button>
  );
}

function getLiveElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]')
  );
}

describe('App-wide Status Region (SPEC §17.7)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';
  const cleanMasterInfo = '# Jordan Smith\nSenior Data Analyst';

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/';
    vi.restoreAllMocks();

    storage.set('masterInfo', { text: cleanMasterInfo, updatedAt: new Date().toISOString() });
    storage.set('settings', {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
      rememberKeys: false,
      paperSize: 'letter',
      theme: 'system',
      showAllModels: false,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('an announcement region is present in the DOM with zero drafts', () => {
    const { container } = render(<App />);

    // Zero drafts generated; empty state is showing
    expect(screen.getByText(/Your drafts will appear here/i)).toBeTruthy();

    // App-wide polite live region exists in the DOM
    const liveRegions = container.querySelectorAll('[aria-live="polite"].sr-only');
    expect(liveRegions).toHaveLength(1);
    expect(liveRegions[0].getAttribute('aria-atomic')).toBe('true');
  });

  it('an announcement is delivered while the Outputs pane is hidden in narrow layout', async () => {
    const { container } = render(
      <SettingsProvider>
        <MasterInfoProvider>
          <InstructionsProvider>
            <JobProvider>
              <GenerationProvider>
                <MainLayout>
                  <MainWorkspace />
                  <AnnouncementTrigger message="Generation finished for Resume" />
                </MainLayout>
              </GenerationProvider>
            </JobProvider>
          </InstructionsProvider>
        </MasterInfoProvider>
      </SettingsProvider>,
    );

    // Outputs pane wrapper is hidden by default in narrow mode (narrowTab === 'inputs')
    const outputsPane = container.querySelector('.md\\:w-\\[60\\%\\]');
    expect(outputsPane?.classList.contains('hidden')).toBe(true);

    // Trigger an announcement
    const triggerBtn = screen.getByRole('button', { name: 'Trigger Announcement' });
    act(() => {
      triggerBtn.click();
    });

    // The app-wide live region is NOT inside the hidden outputs pane
    const liveRegion = container.querySelector('[aria-live="polite"].sr-only');
    expect(liveRegion).toBeTruthy();
    expect(outputsPane?.contains(liveRegion)).toBe(false);
    expect(liveRegion?.textContent).toBe('Generation finished for Resume');
  });

  it('counts all live elements across empty, generating (wide and narrow), and with drafts states', async () => {
    // Setup stored API key with rememberKeys: true so Send is not blocked
    storage.set('settings', {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
      rememberKeys: true,
      paperSize: 'letter',
      theme: 'system',
      showAllModels: false,
    });
    storage.set('apiKeys', { anthropic: fakeKey });

    let resolveStream!: () => void;
    const streamPromise = new Promise<void>((res) => {
      resolveStream = res;
    });

    const createStream = () =>
      new ReadableStream({
        async start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":1}}}\n\n'
            )
          );
          controller.enqueue(
            new TextEncoder().encode(
              'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
            )
          );
          controller.enqueue(
            new TextEncoder().encode(
              'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"# Jordan Smith\\n\\nSenior Data Analyst"}}\n\n'
            )
          );
          await streamPromise;
          controller.enqueue(
            new TextEncoder().encode(
              'event: message_stop\ndata: {"type":"message_stop"}\n\n'
            )
          );
          controller.close();
        },
      });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(createStream(), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        )
      )
    );

    storage.set('masterInfo', {
      text: '<!-- TEMPLATE-UNEDITED -->\n# Jordan Smith\nSenior Data Analyst',
      updatedAt: new Date().toISOString(),
    });

    const { container } = render(<App />);

    // 0. Blocked state (sample Master Info, empty job context):
    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    expect(sendBtn.getAttribute('aria-describedby')).toBe('send-blocker-reason');
    expect(document.getElementById('send-blocker-reason')).toBeTruthy();

    const blockedLiveElements = getLiveElements(container);
    expect(blockedLiveElements).toHaveLength(2);
    expect(blockedLiveElements[0].getAttribute('aria-live')).toBe('polite');
    expect(blockedLiveElements[1].getAttribute('aria-label')).toBe('File upload notices');

    // Resolve blocker by saving clean Master Info
    const openMasterBtn = screen.getByRole('button', { name: 'Open Master Info' });
    fireEvent.click(openMasterBtn);

    const masterEditor = screen.getByRole('textbox', { name: 'Master Info' });
    fireEvent.change(masterEditor, { target: { value: cleanMasterInfo } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // 1. Empty state (Send ready with job context):
    // Deselect cover letter toggle so only Resume runs
    const coverToggle = screen.getByRole('button', { name: /cover letter/i });
    fireEvent.click(coverToggle);

    // Provide job context
    const contextInput = screen.getByLabelText(/job context/i);
    fireEvent.change(contextInput, { target: { value: 'Looking for a Senior Data Analyst.' } });

    // Send button aria-describedby is absent when unblocked
    expect(sendBtn.getAttribute('aria-describedby')).toBeNull();
    expect(document.getElementById('send-blocker-reason')).toBeNull();

    // In ready empty state: exactly app-wide status region + local file-notices region
    const emptyStateLiveElements = getLiveElements(container);
    expect(emptyStateLiveElements).toHaveLength(2);
    expect(emptyStateLiveElements[0].getAttribute('aria-live')).toBe('polite');
    expect(emptyStateLiveElements[1].getAttribute('aria-label')).toBe('File upload notices');

    // 2. Generating state (wide layout):
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Sending…/i)).toBeTruthy();
    });

    const generatingWideLiveElements = getLiveElements(container);
    expect(generatingWideLiveElements).toHaveLength(2);
    expect(generatingWideLiveElements[0].getAttribute('aria-live')).toBe('polite');
    expect(generatingWideLiveElements[1].getAttribute('aria-label')).toBe('File upload notices');

    // 3. Generating state (narrow layout):
    // Switch to Outputs tab in narrow view
    const narrowOutputsTab = screen.getByRole('tab', { name: /outputs/i });
    fireEvent.click(narrowOutputsTab);

    // Verify generating indicator does not create an unauthorized live region
    const generatingDot = narrowOutputsTab.querySelector('[aria-label="Generating"]');
    expect(generatingDot).toBeTruthy();
    expect(generatingDot?.getAttribute('role')).toBe('img');
    expect(generatingDot?.getAttribute('aria-live')).toBeNull();

    const generatingNarrowLiveElements = getLiveElements(container);
    expect(generatingNarrowLiveElements).toHaveLength(2);
    expect(generatingNarrowLiveElements[0].getAttribute('aria-live')).toBe('polite');
    expect(generatingNarrowLiveElements[1].getAttribute('aria-label')).toBe('File upload notices');

    // 4. With drafts:
    // Resolve stream and wait for draft to finish
    await act(async () => {
      resolveStream();
    });

    await waitFor(() => {
      expect(screen.queryByText(/Sending…/i)).toBeNull();
      expect(screen.getByRole('tab', { name: /resume/i })).toBeTruthy();
    });

    const draftsLiveElements = getLiveElements(container);
    expect(draftsLiveElements).toHaveLength(2);
    expect(draftsLiveElements[0].getAttribute('aria-live')).toBe('polite');
    expect(draftsLiveElements[1].getAttribute('aria-label')).toBe('File upload notices');
  });

  it('shows exactly two allowed live regions when storage is unavailable banner is displayed', () => {
    vi.spyOn(storage, 'isAvailable').mockReturnValue(false);
    render(<App />);

    expect(screen.getByText(/isn't letting RefractBio save anything/i)).toBeTruthy();

    const liveElements = getLiveElements(document.body);
    expect(liveElements).toHaveLength(2);
    expect(liveElements[0].getAttribute('aria-live')).toBe('polite');
    expect(liveElements[1].getAttribute('aria-label')).toBe('File upload notices');
  });

  it('shows exactly two allowed live regions when a generation error callout is displayed', async () => {
    storage.set('settings', {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
      rememberKeys: true,
      paperSize: 'letter',
      theme: 'system',
      showAllModels: false,
    });
    storage.set('apiKeys', { anthropic: fakeKey });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes('/messages')) {
          return Promise.reject(new Error('Network failure'));
        }
        return new Response(
          JSON.stringify({
            data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.change(screen.getByLabelText(/job context/i), {
      target: { value: 'Looking for a Senior Data Analyst.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong|Could not connect/i)).toBeTruthy();
    });

    const liveElements = getLiveElements(document.body);
    expect(liveElements).toHaveLength(2);
    expect(liveElements[0].getAttribute('aria-live')).toBe('polite');
    expect(liveElements[1].getAttribute('aria-label')).toBe('File upload notices');
  });

  it('shows exactly two allowed live regions when a truncation notice is displayed', async () => {
    storage.set('settings', {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
      rememberKeys: true,
      paperSize: 'letter',
      theme: 'system',
      showAllModels: false,
    });
    storage.set('apiKeys', { anthropic: fakeKey });

    const truncatedBody = fs.readFileSync(
      path.resolve(__dirname, '../fixtures/sse/anthropic-truncated.txt'),
      'utf-8'
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        return new Response(truncatedBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      })
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));
    fireEvent.change(screen.getByLabelText(/job context/i), {
      target: { value: 'Looking for a Senior Data Analyst.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.getByText(/This draft was cut off/i)).toBeTruthy();
    });

    const liveElements = getLiveElements(document.body);
    expect(liveElements).toHaveLength(2);
    expect(liveElements[0].getAttribute('aria-live')).toBe('polite');
    expect(liveElements[1].getAttribute('aria-label')).toBe('File upload notices');
  });

  it('shows exactly two allowed live regions in Settings sheet with Master Info tab (sample marker and corrupt stored value)', async () => {
    localStorage.setItem(getPrefixedKey('masterInfo'), '{ corrupt json');

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const masterTab = await screen.findByRole('tab', { name: /master info/i });
    fireEvent.keyDown(masterTab, { key: 'Enter', code: 'Enter' });

    const dialog = screen.getByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getByText(/Your saved Master Info could not be loaded/i)).toBeTruthy();
      expect(within(dialog).getByText(/still contains the sample marker/i)).toBeTruthy();
    });

    const liveElements = getLiveElements(document.body);
    expect(liveElements).toHaveLength(2);
    expect(liveElements[0].getAttribute('aria-live')).toBe('polite');
    expect(liveElements[1].getAttribute('aria-label')).toBe('File upload notices');
  });

  it('shows exactly two allowed live regions in Settings sheet with Instructions tab (warning-producing draft)', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /instructions/i })).toBeTruthy();
    });
    const instTab = screen.getByRole('tab', { name: /instructions/i });
    fireEvent.keyDown(instTab, { key: 'Enter', code: 'Enter' });
    fireEvent.click(instTab);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /instructions editor/i })).toBeTruthy();
    });
    const editor = screen.getByRole('textbox', { name: /instructions editor/i });
    fireEvent.change(editor, { target: { value: '# INVALID_SECTION\nSome content' } });

    await waitFor(() => {
      expect(screen.getByText(/Heading "# INVALID_SECTION" isn't recognised/i)).toBeTruthy();
    });

    const liveElements = getLiveElements(document.body);
    expect(liveElements).toHaveLength(2);
    expect(liveElements[0].getAttribute('aria-live')).toBe('polite');
    expect(liveElements[1].getAttribute('aria-label')).toBe('File upload notices');
  });
});
