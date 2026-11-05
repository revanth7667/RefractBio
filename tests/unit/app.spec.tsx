import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import { APP_NAME } from '../../src/config';

describe('App & Hash Routing & Settings', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    document.documentElement.className = '';
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        reload: vi.fn(),
      },
    });
  });

  it('renders main view with app header and empty drafts placeholder', () => {
    render(<App />);
    expect(screen.getByText(APP_NAME)).toBeTruthy();
    expect(screen.getByText('Your drafts will appear here')).toBeTruthy();
  });

  it('renders persistent storage unavailable banner when storage is unavailable at startup (§9.4)', () => {
    vi.spyOn(storage, 'isAvailable').mockReturnValue(false);
    render(<App />);

    expect(
      screen.getByText(
        `This browser isn't letting ${APP_NAME} save anything (this can happen when the page is opened directly from disk in some browsers, or when site data is blocked). You can still use the app, but your Master Info and settings will be lost when you close the tab. Download your Master Info before leaving.`
      )
    ).toBeTruthy();
  });

  it('renders HelpPage when hash is #/help', async () => {
    window.location.hash = '#/help';
    render(<App />);

    expect(screen.getByText(`${APP_NAME} Help & Documentation`)).toBeTruthy();
    expect(screen.getByText('Back to drafts')).toBeTruthy();
  });

  it('opens Settings sheet and updates theme', async () => {
    render(<App />);
    const settingsBtn = screen.getByRole('button', { name: /settings/i });
    fireEvent.click(settingsBtn);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Manage application appearance and local data.')).toBeTruthy();

    const appearanceTab = screen.getByRole('tab', { name: /appearance/i });
    fireEvent.keyDown(appearanceTab, { key: 'Enter', code: 'Enter' });

    const darkBtn = await screen.findByRole('button', { name: /dark/i });
    fireEvent.click(darkBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    const savedSettings = storage.get<{ theme: string }>('settings');
    expect(savedSettings.ok).toBe(true);
    if (savedSettings.ok) {
      expect(savedSettings.value.theme).toBe('dark');
    }
  });

  it('deletes all app data and resets storage upon confirmation', async () => {
    storage.set('settings', { theme: 'dark' });
    storage.set('masterInfo', { text: 'my career', updatedAt: new Date().toISOString() });
    localStorage.setItem('unrelated_key', 'keep_this');

    render(<App />);
    const settingsBtn = screen.getByRole('button', { name: /settings/i });
    fireEvent.click(settingsBtn);

    const dataTab = screen.getByRole('tab', { name: /data/i });
    fireEvent.keyDown(dataTab, { key: 'Enter', code: 'Enter' });

    // In Data tab
    const deleteBtn = await screen.findByRole('button', { name: /delete all app data/i });
    fireEvent.click(deleteBtn);

    // AlertDialog opens
    const confirmBtn = await screen.findByRole('button', { name: /delete everything/i });
    act(() => {
      fireEvent.click(confirmBtn);
    });

    expect(storage.get('settings').ok).toBe(false);
    expect(storage.get('masterInfo').ok).toBe(false);
    expect(localStorage.getItem('unrelated_key')).toBe('keep_this');
  });

  it('renders decorative logo-mark icon in header before app name with alt="" and aria-hidden="true" (§17.1)', () => {
    const { container } = render(<App />);
    const headerLogo = container.querySelector('header img');
    expect(headerLogo).toBeTruthy();
    expect(headerLogo?.getAttribute('alt')).toBe('');
    expect(headerLogo?.getAttribute('aria-hidden')).toBe('true');
  });

  describe('Storage corruption handling and non-clobbering robustness (§9.2, finding B2/B3/B6)', () => {
    const corruptCases: Array<{ key: storage.StorageKey; rawValue: string }> = [
      { key: 'masterInfo', rawValue: JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: null }) },
      { key: 'masterInfo', rawValue: JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: 123 }) },
      { key: 'masterInfo', rawValue: '{ broken json' },
      { key: 'instructions', rawValue: JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: null }) },
      { key: 'instructions', rawValue: JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: 123 }) },
      { key: 'instructions', rawValue: '{ broken json' },
      { key: 'apiKeys', rawValue: JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: null }) },
      { key: 'apiKeys', rawValue: JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: { anthropic: 123 } }) },
      { key: 'apiKeys', rawValue: '{ broken json' },
      { key: 'settings', rawValue: JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: null }) },
      { key: 'settings', rawValue: JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: 123 }) },
      { key: 'settings', rawValue: '{ broken json' },
    ];

    it.each(corruptCases)(
      'renders app without throwing when $key has corrupt value: $rawValue',
      ({ key, rawValue }) => {
        const fullKey = `refractbio:v1:${key}`;
        localStorage.setItem(fullKey, rawValue);

        expect(() => render(<App />)).not.toThrow();
        expect(screen.getByText(APP_NAME)).toBeTruthy();
      }
    );

    it('does not overwrite corrupt settings or apiKeys stored value on subsequent settings action', async () => {
      const settingsKey = 'refractbio:v1:settings';
      const apiKeysKey = 'refractbio:v1:apiKeys';
      const corruptSettings = JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: null });
      const corruptApiKeys = JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: null });

      localStorage.setItem(settingsKey, corruptSettings);
      localStorage.setItem(apiKeysKey, corruptApiKeys);

      render(<App />);

      // Perform an unrelated setting action (e.g. open Settings sheet and click appearance)
      const settingsBtn = screen.getByRole('button', { name: /settings/i });
      fireEvent.click(settingsBtn);

      const appearanceTab = screen.getByRole('tab', { name: /appearance/i });
      fireEvent.keyDown(appearanceTab, { key: 'Enter', code: 'Enter' });

      const darkBtn = await screen.findByRole('button', { name: /dark/i });
      fireEvent.click(darkBtn);

      // Verify that corrupt values in localStorage were NOT clobbered/overwritten
      expect(localStorage.getItem(settingsKey)).toBe(corruptSettings);
      expect(localStorage.getItem(apiKeysKey)).toBe(corruptApiKeys);
    });

    it('does not overwrite corrupt masterInfo or instructions on unrelated user actions', () => {
      const masterInfoKey = 'refractbio:v1:masterInfo';
      const instructionsKey = 'refractbio:v1:instructions';
      const corruptMasterInfo = JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: null });
      const corruptInstructions = JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01', data: null });

      localStorage.setItem(masterInfoKey, corruptMasterInfo);
      localStorage.setItem(instructionsKey, corruptInstructions);

      render(<App />);

      // Type in the job input (an unrelated action)
      const jobInput = screen.getByRole('textbox', { name: /job description/i });
      fireEvent.change(jobInput, { target: { value: 'Software engineer at Example Corp' } });

      // Corrupt stored values must remain unchanged
      expect(localStorage.getItem(masterInfoKey)).toBe(corruptMasterInfo);
      expect(localStorage.getItem(instructionsKey)).toBe(corruptInstructions);
    });
  });
});
