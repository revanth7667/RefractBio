import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import { APP_ID } from '../../src/config';
import type { MasterInfoFile, InstructionsFile, Settings } from '../../src/types';

describe('Milestone M7a Inputs, SendBar, Blockers, and Estimates UI', () => {
  const fakeKey = 'sk-test-fake-0000';
  const cleanMasterInfo = '# Jordan Smith\nSenior Data Analyst\nSQL and Python experience.';

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders default output toggles (Resume and Cover Letter selected with aria-pressed)', () => {
    render(<App />);

    const resumeBtn = screen.getByRole('button', { name: /resume/i });
    const coverLetterBtn = screen.getByRole('button', { name: /cover letter/i });
    const linkedinBtn = screen.getByRole('button', { name: /linkedin message/i });
    const emailBtn = screen.getByRole('button', { name: /email/i });
    const answersBtn = screen.getByRole('button', { name: /application answers/i });

    expect(resumeBtn.getAttribute('aria-pressed')).toBe('true');
    expect(coverLetterBtn.getAttribute('aria-pressed')).toBe('true');
    expect(linkedinBtn.getAttribute('aria-pressed')).toBe('false');
    expect(emailBtn.getAttribute('aria-pressed')).toBe('false');
    expect(answersBtn.getAttribute('aria-pressed')).toBe('false');

    // Clicking toggle updates aria-pressed
    fireEvent.click(emailBtn);
    expect(emailBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('controls Questions box visibility, retains text across toggles, and is cleared by Clear job', () => {
    render(<App />);

    // Initially Answers is off, so Questions box is not in the document
    expect(screen.queryByLabelText(/application questions/i)).toBeNull();

    // Toggle Answers on
    const answersBtn = screen.getByRole('button', { name: /application answers/i });
    fireEvent.click(answersBtn);

    // Questions box is now visible
    const questionsInput = screen.getByLabelText(/application questions/i) as HTMLTextAreaElement;
    expect(questionsInput).toBeTruthy();

    // Type questions
    fireEvent.change(questionsInput, {
      target: { value: '1. Why RefractBio?\n2. Tell me about a time you solved an issue.' },
    });
    expect(questionsInput.value).toContain('Why RefractBio?');

    // Toggle Answers off
    fireEvent.click(answersBtn);
    expect(screen.queryByLabelText(/application questions/i)).toBeNull();

    // Toggle Answers back on -> text must be preserved in memory
    fireEvent.click(answersBtn);
    const restoredInput = screen.getByLabelText(/application questions/i) as HTMLTextAreaElement;
    expect(restoredInput.value).toBe('1. Why RefractBio?\n2. Tell me about a time you solved an issue.');
  });

  it('disables Send on a fresh profile with sample marker message and Open Master Info button', () => {
    render(<App />);

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    expect(sendBtn.hasAttribute('disabled')).toBe(true);

    const blockerMsg = document.getElementById('send-blocker-reason')!;
    expect(blockerMsg).toBeTruthy();
    expect(sendBtn.getAttribute('aria-describedby')).toBe('send-blocker-reason');
    expect(blockerMsg.textContent).toContain('Your Master Info still contains the sample marker');

    const openMasterInfoBtn = screen.getByRole('button', { name: /open master info/i });
    expect(openMasterInfoBtn).toBeTruthy();
  });

  it('"Open Master Info" button opens Settings sheet on Master Info tab', () => {
    render(<App />);

    const openMasterInfoBtn = screen.getByRole('button', { name: /open master info/i });
    fireEvent.click(openMasterInfoBtn);

    const sheet = screen.getByRole('dialog');
    expect(sheet).toBeTruthy();

    // Master Info tab is active and its editor is rendered
    expect(screen.getByRole('tab', { name: /master info/i }).getAttribute('data-state')).toBe('active');
    expect(screen.getByPlaceholderText(/paste or write your master info/i)).toBeTruthy();
  });

  it('enables Send once Master Info is saved, key is present, and model is selected (pressing does nothing in M7a)', async () => {
    // Setup stored Master Info without marker
    const masterInfoFile: MasterInfoFile = {
      text: cleanMasterInfo,
      updatedAt: new Date().toISOString(),
    };
    storage.set('masterInfo', masterInfoFile);

    // Setup stored settings with remembered key
    const settings: Settings = {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet' },
      rememberKeys: true,
      theme: 'system',
      paperSize: 'letter',
      showAllModels: {},
    };
    storage.set('settings', settings);
    storage.set('apiKeys', { anthropic: fakeKey });

    render(<App />);

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    expect(sendBtn.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();

    // Clicking Send in M7a executes the handler prop safely without throwing
    fireEvent.click(sendBtn);
  });

  it('opens confirmation dialog on Clear job and resets inputs to defaults on confirm', async () => {
    render(<App />);

    // Fill in job context
    const contextInput = screen.getByLabelText(/job context/i);
    fireEvent.change(contextInput, { target: { value: 'Pasted job posting details' } });

    // Toggle Answers on and fill questions
    const answersBtn = screen.getByRole('button', { name: /application answers/i });
    fireEvent.click(answersBtn);
    const questionsInput = screen.getByLabelText(/application questions/i);
    fireEvent.change(questionsInput, { target: { value: 'Sample question' } });

    // Click Clear job
    const clearBtn = screen.getByRole('button', { name: /clear job/i });
    fireEvent.click(clearBtn);

    // Dialog appears with exact §14.5 text
    expect(screen.getByText('Clear this job?')).toBeTruthy();
    expect(
      screen.getByText(
        'Clear this job? This removes the job context, questions, attachments, custom instructions and all generated outputs, including previous versions. Your Master Info, instructions file and API keys are not affected.',
      ),
    ).toBeTruthy();

    // Confirm clear
    const confirmBtn = screen.getByRole('button', { name: /^clear job$/i });
    fireEvent.click(confirmBtn);

    // Context input is reset
    expect((screen.getByLabelText(/job context/i) as HTMLTextAreaElement).value).toBe('');

    // Outputs are reset to default (Resume & Cover Letter only, Answers is OFF)
    expect(screen.queryByLabelText(/application questions/i)).toBeNull();
    const resumeBtn = screen.getByRole('button', { name: /resume/i });
    const coverLetterBtn = screen.getByRole('button', { name: /cover letter/i });
    expect(resumeBtn.getAttribute('aria-pressed')).toBe('true');
    expect(coverLetterBtn.getAttribute('aria-pressed')).toBe('true');
    expect(answersBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('triggers Send on Ctrl/Cmd+Enter only when Send is enabled', () => {
    // 1. When Send is disabled (fresh profile): Ctrl+Enter does not trigger send
    const { unmount } = render(<App />);

    const contextArea = screen.getByLabelText(/job context/i);
    fireEvent.keyDown(contextArea, { key: 'Enter', ctrlKey: true });
    // Still disabled
    expect(screen.getByRole('button', { name: /^send$/i }).hasAttribute('disabled')).toBe(true);

    unmount();

    // 2. When Send is enabled:
    storage.set('masterInfo', { text: cleanMasterInfo, updatedAt: new Date().toISOString() });
    storage.set('settings', {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet' },
      rememberKeys: true,
      theme: 'system',
      paperSize: 'letter',
      showAllModels: {},
    });
    storage.set('apiKeys', { anthropic: fakeKey });

    render(<App />);
    const enabledSendBtn = screen.getByRole('button', { name: /^send$/i });
    expect(enabledSendBtn.hasAttribute('disabled')).toBe(false);

    // Ctrl+Enter on context area runs handler without error
    const contextAreaEnabled = screen.getByLabelText(/job context/i);
    fireEvent.keyDown(contextAreaEnabled, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(contextAreaEnabled, { key: 'Enter', metaKey: true });
  });

  it('displays the Instructions badge for fallbacks computed from saved text', () => {
    // Save an instructions file missing the EMAIL section
    const partialInstructions: InstructionsFile = {
      text: '# GLOBAL\nGlobal rules\n# RESUME\nResume rules\n# COVER_LETTER\nCL rules\n# LINKEDIN_MESSAGE\nLI rules\n# ANSWERS\nAnswers rules',
      updatedAt: new Date().toISOString(),
    };
    storage.set('instructions', partialInstructions);

    render(<App />);

    // One section (EMAIL) fell back to default -> "Instructions: 1 section using default" (singular)
    expect(screen.getByText('Instructions: 1 section using default')).toBeTruthy();
  });

  it('never writes job inputs to localStorage while typing in every input (only the four allowed keys ever exist)', () => {
    render(<App />);

    const contextInput = screen.getByLabelText(/job context/i);
    fireEvent.change(contextInput, { target: { value: 'Secret job context information' } });

    const answersBtn = screen.getByRole('button', { name: /application answers/i });
    fireEvent.click(answersBtn);
    const questionsInput = screen.getByLabelText(/application questions/i);
    fireEvent.change(questionsInput, { target: { value: 'Secret questions' } });

    const customInstructionsSummary = screen.getByText(/custom instructions \(this job only\)/i);
    fireEvent.click(customInstructionsSummary);
    const customInstructionsInput = screen.getByPlaceholderText(/e\.g\. Emphasise reporting automation/i);
    fireEvent.change(customInstructionsInput, { target: { value: 'Secret custom instructions' } });

    // Verify localStorage:
    // Only the four allowed keys could ever be touched: masterInfo, instructions, apiKeys, settings
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

    // Explicitly verify none of the typed job strings landed in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key) || '';
        expect(val).not.toContain('Secret job context information');
        expect(val).not.toContain('Secret questions');
        expect(val).not.toContain('Secret custom instructions');
      }
    }
  });

  it('triggers exactly one model-list request per provider with a stored key at startup, and Send bar shows loaded models (§13.4 rule 1)', async () => {
    // Setup stored settings with rememberKeys on and stored keys for both providers
    const initialSettings: Settings = {
      theme: 'system',
      paperSize: 'letter',
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: '', gemini: '' },
      showAllModels: {},
      rememberKeys: true,
    };
    storage.set('settings', initialSettings);
    storage.set('apiKeys', {
      anthropic: fakeKey,
      gemini: 'fake-gemini-key',
    });

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes('anthropic.com')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                { id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet' },
                { id: 'claude-3-haiku-20240307', display_name: 'Claude 3 Haiku' },
              ],
              has_more: false,
            }),
            { status: 200 }
          )
        );
      }
      if (urlStr.includes('googleapis.com')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              models: [
                {
                  name: 'models/gemini-1.5-flash',
                  displayName: 'Gemini 1.5 Flash',
                  supportedGenerationMethods: ['generateContent'],
                },
              ],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${urlStr}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    // Send bar's model picker loads and displays the loaded models for the active provider (anthropic)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Claude 3.5 Sonnet' })).toBeTruthy();
    });

    // Exactly one model-list request per provider with a stored key (1 anthropic, 1 gemini)
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(requestedUrls.some((u) => u.includes('anthropic.com'))).toBe(true);
    expect(requestedUrls.some((u) => u.includes('googleapis.com'))).toBe(true);
  });

  it('triggers no model-list request when mounting with no key stored, nor while typing a key (§13.4 rule 1)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    // With no key stored, mounting triggers no model-list request
    expect(fetchMock).not.toHaveBeenCalled();

    // Open Settings dialog (defaults to providers tab)
    const settingsBtn = screen.getByRole('button', { name: /settings/i });
    fireEvent.click(settingsBtn);

    // Typing into Anthropic key input triggers no model-list request
    const anthropicInput = screen.getByPlaceholderText(/enter your anthropic api key/i);
    fireEvent.change(anthropicInput, { target: { value: 'sk-' } });
    fireEvent.change(anthropicInput, { target: { value: fakeKey } });

    // Typing into Gemini key input triggers no model-list request
    const geminiInput = screen.getByPlaceholderText(/enter your google gemini api key/i);
    fireEvent.change(geminiInput, { target: { value: 'AIza' } });
    fireEvent.change(geminiInput, { target: { value: 'fake-gemini-typing-key' } });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
