import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import * as storage from '../../src/storage/storage';
import { getPrefixedKey } from '../../src/storage/keys';
import { SettingsProvider, useSettings } from '../../src/state/SettingsContext';
import { MasterInfoProvider } from '../../src/state/MasterInfoContext';
import { InstructionsProvider } from '../../src/state/InstructionsContext';
import { SettingsSheet } from '../../src/ui/settings/SettingsSheet';
import type { PaperSize } from '../../src/types';

describe('Corrupt settings & apiKeys notices and reset (SPEC §9.2)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';
  const cleanMasterInfo = '# Jordan Sample\nData Analyst\nSQL and Python experience.';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();

    storage.set('masterInfo', {
      text: cleanMasterInfo,
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Settings corrupt notice and reset', () => {
    const corruptSettingsPayload = '{"schemaVersion": 999, "data": "incompatible-version"}';

    it('shows notice when corrupt, cancel keeps corrupt state, reset removes storage item, restores defaults, and subsequent changes persist', async () => {
      localStorage.setItem(getPrefixedKey('settings'), corruptSettingsPayload);

      render(
        <SettingsProvider>
          <MasterInfoProvider>
            <InstructionsProvider>
              <SettingsSheet open={true} onOpenChange={() => {}} />
            </InstructionsProvider>
          </MasterInfoProvider>
        </SettingsProvider>
      );

      // Notice is visible with exact required text
      const noticeText =
        'Your saved settings could not be loaded because the stored data is invalid or has an incompatible version. Default settings are in use.';
      const notice = screen.getByText(noticeText);
      expect(notice).toBeTruthy();

      // Assert notice is NOT inside a live region
      const noticeContainer = notice.closest('div');
      expect(noticeContainer?.getAttribute('aria-live')).toBeNull();
      expect(noticeContainer?.getAttribute('role')).toBeNull();

      // Button is present
      const resetBtn = screen.getByRole('button', { name: 'Reset Settings' });
      expect(resetBtn).toBeTruthy();

      // Click Reset Settings opens confirmation dialog
      fireEvent.click(resetBtn);

      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toBeTruthy();
      expect(within(dialog).getByText('Reset settings?')).toBeTruthy();
      expect(
        within(dialog).getByText(
          'This will replace your stored settings with the defaults. Your Master Info, instructions and API keys are not changed.'
        )
      ).toBeTruthy();

      // Cancel preserves corrupt state
      const cancelBtn = within(dialog).getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtn);

      expect(screen.getByText(noticeText)).toBeTruthy();
      expect(localStorage.getItem(getPrefixedKey('settings'))).toBe(corruptSettingsPayload);

      // Click Reset Settings again and confirm
      fireEvent.click(screen.getByRole('button', { name: 'Reset Settings' }));
      const confirmDialog = screen.getByRole('alertdialog');
      const confirmBtn = within(confirmDialog).getByRole('button', { name: 'Reset Settings' });
      fireEvent.click(confirmBtn);

      // Notice is gone
      await waitFor(() => {
        expect(screen.queryByText(noticeText)).toBeNull();
      });

      // Stored settings item is removed
      expect(localStorage.getItem(getPrefixedKey('settings'))).toBeNull();

      // Other keys (e.g. Master Info) were not touched
      expect(storage.get('masterInfo').ok).toBe(true);

      // Subsequent setting changes persist again
      const appearanceTab = screen.getByRole('tab', { name: /^Appearance$/i });
      fireEvent.keyDown(appearanceTab, { key: 'Enter', code: 'Enter' });
      fireEvent.click(appearanceTab);

      const paperSelect = document.getElementById('paper-size-select') as HTMLSelectElement;
      expect(paperSelect).not.toBeNull();
      fireEvent.change(paperSelect, { target: { value: 'a4' } });

      const updatedSettings = storage.get<{ paperSize: string }>('settings');
      expect(updatedSettings.ok).toBe(true);
      if (updatedSettings.ok) {
        expect(updatedSettings.value.paperSize).toBe('a4');
      }
    });
  });

  describe('API keys corrupt notice and reset', () => {
    const corruptApiKeysPayload = 'invalid-json{{{';

    it('shows notice when corrupt, cancel keeps corrupt state, reset removes storage item and clears in-memory keys', async () => {
      localStorage.setItem(getPrefixedKey('apiKeys'), corruptApiKeysPayload);
      storage.set('settings', {
        selectedProvider: 'anthropic',
        selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
        rememberKeys: true,
        theme: 'system',
        paperSize: 'letter',
        showAllModels: false,
      });

      render(
        <SettingsProvider>
          <MasterInfoProvider>
            <InstructionsProvider>
              <SettingsSheet open={true} onOpenChange={() => {}} />
            </InstructionsProvider>
          </MasterInfoProvider>
        </SettingsProvider>
      );

      // Notice is visible on Providers tab with exact required text
      const noticeText =
        'Your saved API keys could not be loaded because the stored data is invalid.';
      const notice = screen.getByText(noticeText);
      expect(notice).toBeTruthy();

      // Assert notice is NOT inside a live region
      const noticeContainer = notice.closest('div');
      expect(noticeContainer?.getAttribute('aria-live')).toBeNull();
      expect(noticeContainer?.getAttribute('role')).toBeNull();

      // Button is present
      const resetBtn = screen.getByRole('button', { name: 'Reset API Keys' });
      expect(resetBtn).toBeTruthy();

      // Click Reset API Keys opens confirmation dialog
      fireEvent.click(resetBtn);

      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toBeTruthy();
      expect(within(dialog).getByText('Reset API keys?')).toBeTruthy();
      expect(
        within(dialog).getByText('This will delete your stored API keys from this browser.')
      ).toBeTruthy();

      // Cancel preserves corrupt state
      const cancelBtn = within(dialog).getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtn);

      expect(screen.getByText(noticeText)).toBeTruthy();
      expect(localStorage.getItem(getPrefixedKey('apiKeys'))).toBe(corruptApiKeysPayload);

      // Click Reset API Keys again and confirm
      fireEvent.click(screen.getByRole('button', { name: 'Reset API Keys' }));
      const confirmDialog = screen.getByRole('alertdialog');
      const confirmBtn = within(confirmDialog).getByRole('button', { name: 'Reset API Keys' });
      fireEvent.click(confirmBtn);

      // Notice is gone
      await waitFor(() => {
        expect(screen.queryByText(noticeText)).toBeNull();
      });

      // Stored apiKeys item is removed
      expect(localStorage.getItem(getPrefixedKey('apiKeys'))).toBeNull();

      // Settings and Master Info were not touched
      expect(storage.get('settings').ok).toBe(true);
      expect(storage.get('masterInfo').ok).toBe(true);
    });
  });

  describe('Valid stored settings and apiKeys', () => {
    it('shows no notices when stored data is valid', () => {
      storage.set('settings', {
        selectedProvider: 'anthropic',
        selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
        rememberKeys: true,
        theme: 'system',
        paperSize: 'letter',
        showAllModels: false,
      });
      storage.set('apiKeys', { anthropic: fakeKey, gemini: 'fake-gemini-key' });

      render(
        <SettingsProvider>
          <MasterInfoProvider>
            <InstructionsProvider>
              <SettingsSheet open={true} onOpenChange={() => {}} />
            </InstructionsProvider>
          </MasterInfoProvider>
        </SettingsProvider>
      );

      expect(
        screen.queryByText(/Your saved settings could not be loaded/i)
      ).toBeNull();
      expect(
        screen.queryByText(/Your saved API keys could not be loaded/i)
      ).toBeNull();
    });
  });
});
