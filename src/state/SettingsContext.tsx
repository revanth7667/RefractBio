import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Settings, Theme, PaperSize, ProviderId } from '../types';
import * as storage from '../storage/storage';

const DEFAULT_SETTINGS: Settings = {
  selectedProvider: 'anthropic',
  selectedModel: {},
  rememberKeys: false,
  theme: 'system',
  paperSize: 'letter',
  showAllModels: false,
};

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  setTheme: (theme: Theme) => void;
  setPaperSize: (size: PaperSize) => void;
  setSelectedProvider: (provider: ProviderId) => void;
  resetAllData: () => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<Settings>(() => {
    const res = storage.get<Settings>('settings');
    if (res.ok) {
      return { ...DEFAULT_SETTINGS, ...res.value };
    }
    return DEFAULT_SETTINGS;
  });

  const updateSettings = (updates: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...updates };
      storage.set('settings', next);
      return next;
    });
  };

  const setTheme = (theme: Theme) => updateSettings({ theme });
  const setPaperSize = (paperSize: PaperSize) => updateSettings({ paperSize });
  const setSelectedProvider = (selectedProvider: ProviderId) => updateSettings({ selectedProvider });

  const resetAllData = () => {
    storage.removeAll();
    setSettingsState(DEFAULT_SETTINGS);
  };

  // Sync theme with document element
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    const applyTheme = (theme: Theme) => {
      if (theme === 'dark') {
        root.classList.add('dark');
      } else if (theme === 'light') {
        root.classList.remove('dark');
      } else {
        const isSystemDark =
          typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (isSystemDark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    applyTheme(settings.theme);

    if (settings.theme === 'system' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        if (e.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      };
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
      }
    }
  }, [settings.theme]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        setTheme,
        setPaperSize,
        setSelectedProvider,
        resetAllData,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
