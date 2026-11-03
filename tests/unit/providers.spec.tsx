import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsProvider } from '../../src/state/SettingsContext';
import { ProvidersPanel } from '../../src/ui/settings/ProvidersPanel';
import { ModelPicker } from '../../src/ui/inputs/ModelPicker';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import type { ModelInfo } from '../../src/types';

describe('ProvidersPanel & ModelPicker (UI Settings → Providers)', () => {
  const fakeKey = 'sk-test-fake-0000';

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ModelPicker Component', () => {
    const mockModels: ModelInfo[] = [
      {
        id: 'claude-3-5-sonnet',
        displayName: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        likelyChat: true,
        supportsImages: 'yes',
        supportsPdf: 'yes',
        capabilitySource: 'api-metadata',
        smallTierGuess: false,
      },
      {
        id: 'claude-3-haiku',
        displayName: 'Claude 3 Haiku',
        provider: 'anthropic',
        likelyChat: true,
        supportsImages: 'no',
        supportsPdf: 'no',
        capabilitySource: 'api-metadata',
        smallTierGuess: true,
      },
      {
        id: 'claude-embed-v1',
        displayName: 'Claude Embed',
        provider: 'anthropic',
        likelyChat: false,
        supportsImages: 'unknown',
        supportsPdf: 'unknown',
        capabilitySource: 'none',
        smallTierGuess: false,
      },
    ];

    it('renders native select with chat models only when showAll is false', () => {
      const onSelect = vi.fn();
      const onToggle = vi.fn();

      render(
        <ModelPicker
          provider="anthropic"
          models={mockModels}
          selectedModel="claude-3-5-sonnet"
          onSelectModel={onSelect}
          showAllModels={false}
          onToggleShowAll={onToggle}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeTruthy();

      expect(screen.getByRole('option', { name: 'Claude 3.5 Sonnet' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'Claude 3 Haiku' })).toBeTruthy();
      expect(screen.queryByRole('option', { name: 'Claude Embed' })).toBeNull();
      expect(screen.getByRole('option', { name: /other \(type a model id\)/i })).toBeTruthy();
    });

    it('shows non-chat models when showAll is true', () => {
      render(
        <ModelPicker
          provider="anthropic"
          models={mockModels}
          selectedModel="claude-3-5-sonnet"
          onSelectModel={vi.fn()}
          showAllModels={true}
          onToggleShowAll={vi.fn()}
        />
      );

      expect(screen.getByRole('option', { name: 'Claude Embed' })).toBeTruthy();
    });

    it('shows default latest Flash, Flash-lite, and Pro models for Gemini when showAll is false', () => {
      const geminiModels: ModelInfo[] = [
        { id: 'models/gemini-flash-latest', displayName: 'Gemini Flash Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'models/gemini-flash-lite-latest', displayName: 'Gemini Flash-Lite Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'models/gemini-pro-latest', displayName: 'Gemini Pro Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'models/gemini-1.5-flash-001', displayName: 'Gemini 1.5 Flash 001', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'models/gemini-1.5-pro-001', displayName: 'Gemini 1.5 Pro 001', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'models/text-embedding-004', displayName: 'Text Embedding 004', provider: 'gemini', likelyChat: false, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];

      const { rerender } = render(
        <ModelPicker
          provider="gemini"
          models={geminiModels}
          selectedModel="models/gemini-flash-latest"
          onSelectModel={vi.fn()}
          showAllModels={false}
          onToggleShowAll={vi.fn()}
        />
      );

      // Default: only Flash, Flash-lite, and Pro are shown
      expect(screen.getByRole('option', { name: 'Gemini Flash Latest' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'Gemini Flash-Lite Latest' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'Gemini Pro Latest' })).toBeTruthy();
      expect(screen.queryByRole('option', { name: 'Gemini 1.5 Flash 001' })).toBeNull();
      expect(screen.queryByRole('option', { name: 'Gemini 1.5 Pro 001' })).toBeNull();
      expect(screen.queryByRole('option', { name: 'Text Embedding 004' })).toBeNull();

      // When showAll is true: all models are shown
      rerender(
        <ModelPicker
          provider="gemini"
          models={geminiModels}
          selectedModel="models/gemini-flash-latest"
          onSelectModel={vi.fn()}
          showAllModels={true}
          onToggleShowAll={vi.fn()}
        />
      );

      expect(screen.getByRole('option', { name: 'Gemini 1.5 Flash 001' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'Gemini 1.5 Pro 001' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'Text Embedding 004' })).toBeTruthy();
    });

    it('appends selected model to options when Show all is false and selected model is in models but not in default list', () => {
      const extraModel: ModelInfo = {
        id: 'claude-2.1',
        displayName: 'Claude 2.1',
        provider: 'anthropic',
        likelyChat: true,
        supportsImages: 'no',
        supportsPdf: 'no',
        capabilitySource: 'none',
        smallTierGuess: false,
      };

      const allModels = [...mockModels, extraModel];
      const onSelect = vi.fn();

      render(
        <ModelPicker
          provider="anthropic"
          models={allModels}
          selectedModel="claude-2.1"
          onSelectModel={onSelect}
          showAllModels={false}
          onToggleShowAll={vi.fn()}
        />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('claude-2.1');
      expect(screen.getByRole('option', { name: 'Claude 2.1' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'Claude 3.5 Sonnet' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'Claude 3 Haiku' })).toBeTruthy();
    });

    it('displays small-tier warning note when selected model is a small tier guess', () => {
      render(
        <ModelPicker
          provider="anthropic"
          models={mockModels}
          selectedModel="claude-3-haiku"
          onSelectModel={vi.fn()}
          showAllModels={false}
          onToggleShowAll={vi.fn()}
        />
      );

      expect(
        screen.getByText(/This model's name suggests a smaller, faster tier that may write weaker resumes/i)
      ).toBeTruthy();
    });

    it('reveals text input when "Other (type a model ID)" is selected', () => {
      const onSelect = vi.fn();
      render(
        <ModelPicker
          provider="anthropic"
          models={mockModels}
          selectedModel="claude-3-5-sonnet"
          onSelectModel={onSelect}
          showAllModels={false}
          onToggleShowAll={vi.fn()}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '__manual__' } });

      const customInput = screen.getByLabelText(/custom model id/i);
      expect(customInput).toBeTruthy();

      fireEvent.change(customInput, { target: { value: 'custom-model-id' } });
      expect(onSelect).toHaveBeenCalledWith('custom-model-id');
    });
  });

  describe('ProvidersPanel Integration', () => {
    it('renders provider key inputs with password type, autocomplete off, and show/hide toggle', () => {
      render(
        <SettingsProvider>
          <ProvidersPanel />
        </SettingsProvider>
      );

      const anthropicInput = screen.getByPlaceholderText(/enter your anthropic api key/i) as HTMLInputElement;
      expect(anthropicInput.type).toBe('password');
      expect(anthropicInput.getAttribute('autocomplete')).toBe('off');
      expect(anthropicInput.getAttribute('spellcheck')).toBe('false');

      const showBtn = screen.getAllByRole('button', { name: /show api key/i })[0];
      fireEvent.click(showBtn);
      expect(anthropicInput.type).toBe('text');

      const hideBtn = screen.getByRole('button', { name: /hide api key/i });
      fireEvent.click(hideBtn);
      expect(anthropicInput.type).toBe('password');
    });

    it('renders official documentation / console links for key creation', () => {
      render(
        <SettingsProvider>
          <ProvidersPanel />
        </SettingsProvider>
      );

      const anthropicLink = screen.getByRole('link', { name: /anthropic console/i });
      expect(anthropicLink.getAttribute('href')).toBe('https://console.anthropic.com/settings/keys');
      expect(anthropicLink.getAttribute('target')).toBe('_blank');

      const geminiLink = screen.getByRole('link', { name: /google ai studio/i });
      expect(geminiLink.getAttribute('href')).toBe('https://aistudio.google.com/app/apikey');
      expect(geminiLink.getAttribute('target')).toBe('_blank');
    });

    it('displays free-tier data-use terms notice under Gemini key field', () => {
      render(
        <SettingsProvider>
          <ProvidersPanel />
        </SettingsProvider>
      );

      expect(
        screen.getByText(/Gemini API Additional Terms of Service/i)
      ).toBeTruthy();
    });

    it('executes Test connection and shows "Connected, N models found" on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' }],
            has_more: false,
          }),
          { status: 200 }
        )
      ));

      render(
        <SettingsProvider>
          <ProvidersPanel />
        </SettingsProvider>
      );

      const anthropicInput = screen.getByPlaceholderText(/enter your anthropic api key/i);
      fireEvent.change(anthropicInput, { target: { value: fakeKey } });

      const testBtn = screen.getAllByRole('button', { name: /test connection/i })[0];
      fireEvent.click(testBtn);

      await waitFor(() => {
        expect(screen.getByText(/Connected, 1 models found/i)).toBeTruthy();
      });
    });

    it('executes Test connection and shows mapped error + suggestions on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      render(
        <SettingsProvider>
          <ProvidersPanel />
        </SettingsProvider>
      );

      const anthropicInput = screen.getByPlaceholderText(/enter your anthropic api key/i);
      fireEvent.change(anthropicInput, { target: { value: fakeKey } });

      const testBtn = screen.getAllByRole('button', { name: /test connection/i })[0];
      fireEvent.click(testBtn);

      await waitFor(() => {
        expect(screen.getByText(/blocked before it reached the provider/i)).toBeTruthy();
        expect(screen.getByText(/Check that your computer has an active internet connection/i)).toBeTruthy();
      });
    });

    it('manages "Remember my API keys on this device" switch and deletes keys when turned off', async () => {
      render(
        <SettingsProvider>
          <ProvidersPanel />
        </SettingsProvider>
      );

      // Warning text is always visible
      expect(
        screen.getByText(/Keys are sent only to the provider you choose. If you turn this on, keys are saved in this browser/i)
      ).toBeTruthy();

      const rememberSwitch = screen.getByRole('switch', { name: /remember my api keys on this device/i });
      expect(rememberSwitch.getAttribute('aria-checked')).toBe('false');

      // Enter a key with remember OFF
      const anthropicInput = screen.getByPlaceholderText(/enter your anthropic api key/i);
      fireEvent.change(anthropicInput, { target: { value: fakeKey } });

      // In localStorage, apiKeys key must NOT exist yet
      expect(storage.get('apiKeys').ok).toBe(false);

      // Turn remember ON
      fireEvent.click(rememberSwitch);
      expect(rememberSwitch.getAttribute('aria-checked')).toBe('true');

      // Now apiKeys should be saved in localStorage
      const saved = storage.get<Record<string, string>>('apiKeys');
      expect(saved.ok).toBe(true);
      if (saved.ok) {
        expect(saved.value.anthropic).toBe(fakeKey);
      }

      // Turn remember OFF -> should immediately delete keys
      fireEvent.click(rememberSwitch);
      expect(rememberSwitch.getAttribute('aria-checked')).toBe('false');
      expect(storage.get('apiKeys').ok).toBe(false);
    });

    it('manages "Show all models" independently per provider in Settings and survives reload', () => {
      const { unmount } = render(
        <SettingsProvider>
          <ProvidersPanel />
        </SettingsProvider>
      );

      const checkboxes = screen.getAllByRole('checkbox', { name: /show all models/i }) as HTMLInputElement[];
      expect(checkboxes).toHaveLength(2);

      const [anthropicCheckbox, geminiCheckbox] = checkboxes;
      expect(anthropicCheckbox.checked).toBe(false);
      expect(geminiCheckbox.checked).toBe(false);

      // Checking anthropic leaves gemini unchanged
      fireEvent.click(anthropicCheckbox);
      expect(anthropicCheckbox.checked).toBe(true);
      expect(geminiCheckbox.checked).toBe(false);

      // Checking gemini leaves anthropic unchanged
      fireEvent.click(geminiCheckbox);
      expect(anthropicCheckbox.checked).toBe(true);
      expect(geminiCheckbox.checked).toBe(true);

      // Unchecking anthropic leaves gemini checked
      fireEvent.click(anthropicCheckbox);
      expect(anthropicCheckbox.checked).toBe(false);
      expect(geminiCheckbox.checked).toBe(true);

      unmount();

      // Reloading from storage retains independent state
      render(
        <SettingsProvider>
          <ProvidersPanel />
        </SettingsProvider>
      );
      const reloadedCheckboxes = screen.getAllByRole('checkbox', { name: /show all models/i }) as HTMLInputElement[];
      expect(reloadedCheckboxes[0].checked).toBe(false);
      expect(reloadedCheckboxes[1].checked).toBe(true);
    });

    it('syncs per-provider "Show all models" between SendBar and Settings panel and switches correctly', () => {
      render(<App />);

      // On main workspace, SendBar has Show all models (for default anthropic)
      const sendBarCheckbox = screen.getByLabelText(/show all models/i) as HTMLInputElement;
      expect(sendBarCheckbox.checked).toBe(false);

      // Tick Anthropic Show all models in SendBar
      fireEvent.click(sendBarCheckbox);
      expect(sendBarCheckbox.checked).toBe(true);

      // Open Settings sheet to Providers tab
      const settingsBtn = screen.getByRole('button', { name: /settings/i });
      fireEvent.click(settingsBtn);

      // Settings panel Anthropic checkbox reflects true, Gemini reflects false
      const checkboxes = screen.getAllByRole('checkbox', { name: /show all models/i }) as HTMLInputElement[];
      // In sheet: checkboxes[0] is Anthropic in ProvidersPanel, checkboxes[1] is Gemini in ProvidersPanel
      expect(checkboxes[0].checked).toBe(true);
      expect(checkboxes[1].checked).toBe(false);

      // Tick Gemini in Settings panel
      fireEvent.click(checkboxes[1]);
      expect(checkboxes[1].checked).toBe(true);
      expect(checkboxes[0].checked).toBe(true);

      // Close Settings sheet by pressing Escape
      fireEvent.keyDown(document.body, { key: 'Escape' });

      // Switch provider to Gemini in SendBar
      const providerSelect = screen.getByLabelText(/provider/i);
      fireEvent.change(providerSelect, { target: { value: 'gemini' } });

      // SendBar now reflects Gemini's value (true)
      const geminiSendBarCheckbox = screen.getByLabelText(/show all models/i) as HTMLInputElement;
      expect(geminiSendBarCheckbox.checked).toBe(true);

      // Untick Gemini in SendBar
      fireEvent.click(geminiSendBarCheckbox);
      expect(geminiSendBarCheckbox.checked).toBe(false);

      // Switch provider back to Anthropic
      fireEvent.change(providerSelect, { target: { value: 'anthropic' } });

      // Anthropic in SendBar is still checked (true)
      const anthropicSendBarCheckbox = screen.getByLabelText(/show all models/i) as HTMLInputElement;
      expect(anthropicSendBarCheckbox.checked).toBe(true);
    });
  });
});

