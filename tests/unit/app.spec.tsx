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
});
