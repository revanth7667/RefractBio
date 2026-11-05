import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Settings, Theme, PaperSize, ProviderId, ModelInfo, AppError } from '../types';
import * as storage from '../storage/storage';
import { getAdapter } from '../providers/registry';
import { getDefaultModels } from '../providers/modelFilter';

const DEFAULT_SETTINGS: Settings = {
  selectedProvider: 'anthropic',
  selectedModel: {},
  rememberKeys: false,
  theme: 'system',
  paperSize: 'letter',
  showAllModels: {},
};

interface SettingsContextValue {
  settings: Settings;
  apiKeys: Record<ProviderId, string>;
  storageAvailable: boolean;
  models: Record<ProviderId, ModelInfo[]>;
  loadingModels: Record<ProviderId, boolean>;
  modelErrors: Record<ProviderId, AppError | null>;
  loadModels: (providerId: ProviderId, explicitKey?: string) => Promise<void>;
  setCachedModels: (providerId: ProviderId, models: ModelInfo[]) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  settingsTab: string;
  setSettingsTab: (tab: string) => void;
  openSettings: (tab?: string) => void;
  setApiKey: (provider: ProviderId, key: string) => void;
  setRememberKeys: (remember: boolean) => void;
  setSelectedModel: (provider: ProviderId, model: string) => void;
  setShowAllModels: (providerOrShow: ProviderId | boolean, show?: boolean) => void;
  updateSettings: (updates: Partial<Settings>) => void;
  setTheme: (theme: Theme) => void;
  setPaperSize: (size: PaperSize) => void;
  setSelectedProvider: (provider: ProviderId) => void;
  resetAllData: () => void;
  settingsLoadError: 'parse_error' | 'schema_mismatch' | null;
  apiKeysLoadError: 'parse_error' | 'schema_mismatch' | null;
  resetSettings: () => void;
  resetApiKeys: () => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [storageAvailable] = useState(() => storage.isAvailable());

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string>('providers');

  const [settingsLoadError, setSettingsLoadError] = useState<'parse_error' | 'schema_mismatch' | null>(() => {
    const res = storage.get<Settings>('settings');
    if (!res.ok && (res.reason === 'parse_error' || res.reason === 'schema_mismatch')) {
      return res.reason;
    }
    return null;
  });

  const [apiKeysLoadError, setApiKeysLoadError] = useState<'parse_error' | 'schema_mismatch' | null>(() => {
    const res = storage.get<Partial<Record<ProviderId, string>>>('apiKeys');
    if (!res.ok && (res.reason === 'parse_error' || res.reason === 'schema_mismatch')) {
      return res.reason;
    }
    return null;
  });

  const openSettings = (tab?: string) => {
    if (tab) {
      setSettingsTab(tab);
    }
    setSettingsOpen(true);
  };

  const [settings, setSettingsState] = useState<Settings>(() => {
    const res = storage.get<Settings>('settings');
    if (res.ok) {
      return { ...DEFAULT_SETTINGS, ...res.value };
    }
    return DEFAULT_SETTINGS;
  });

  const [apiKeys, setApiKeysState] = useState<Record<ProviderId, string>>(() => {
    // Only load saved keys if rememberKeys was enabled
    const resSettings = storage.get<Settings>('settings');
    if (resSettings.ok && resSettings.value.rememberKeys) {
      const resKeys = storage.get<Partial<Record<ProviderId, string>>>('apiKeys');
      if (resKeys.ok && resKeys.value) {
        return {
          anthropic: resKeys.value.anthropic || '',
          gemini: resKeys.value.gemini || '',
        };
      }
    }
    return { anthropic: '', gemini: '' };
  });

  const [models, setModels] = useState<Record<ProviderId, ModelInfo[]>>({
    anthropic: [],
    gemini: [],
  });

  const [loadingModels, setLoadingModels] = useState<Record<ProviderId, boolean>>({
    anthropic: false,
    gemini: false,
  });

  const [modelErrors, setModelErrors] = useState<Record<ProviderId, AppError | null>>({
    anthropic: null,
    gemini: null,
  });

  const setCachedModels = (providerId: ProviderId, fetchedModels: ModelInfo[]) => {
    setModels((prev) => ({ ...prev, [providerId]: fetchedModels }));
    setModelErrors((prev) => ({ ...prev, [providerId]: null }));

    // If no model is currently selected, select the first default model or first available model
    setSettingsState((prevSettings) => {
      const currentSelected = prevSettings.selectedModel[providerId];
      if (currentSelected === undefined && fetchedModels.length > 0) {
        const defaultList = getDefaultModels(fetchedModels, providerId);
        const firstDefault = defaultList[0] || fetchedModels.find((m) => m.likelyChat) || fetchedModels[0];
        if (firstDefault) {
          const nextSelected = { ...prevSettings.selectedModel, [providerId]: firstDefault.id };
          const next = { ...prevSettings, selectedModel: nextSelected };
          if (!settingsLoadError) {
            storage.set('settings', next);
          }
          return next;
        }
      }
      return prevSettings;
    });
  };

  const loadModels = async (providerId: ProviderId, explicitKey?: string) => {
    const key = explicitKey !== undefined ? explicitKey : apiKeys[providerId];
    if (!key || !key.trim()) return;

    setLoadingModels((prev) => ({ ...prev, [providerId]: true }));
    setModelErrors((prev) => ({ ...prev, [providerId]: null }));

    try {
      const adapter = getAdapter(providerId);
      const fetchedModels = await adapter.listModels({ id: providerId, apiKey: key });
      setCachedModels(providerId, fetchedModels);
    } catch (err: unknown) {
      const appErr =
        typeof err === 'object' && err !== null && 'category' in err && 'message' in err
          ? (err as AppError)
          : null;
      setModelErrors((prev) => ({ ...prev, [providerId]: appErr }));
    } finally {
      setLoadingModels((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  // Load models at startup if a key is already available (§13.4 rule 1)
  useEffect(() => {
    const providers: ProviderId[] = ['anthropic', 'gemini'];
    for (const p of providers) {
      const key = apiKeys[p];
      if (key && key.trim()) {
        loadModels(p, key);
      }
    }
  }, []);

  const updateSettings = (updates: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...updates };
      if (!settingsLoadError) {
        storage.set('settings', next);
      }
      return next;
    });
  };

  const setTheme = (theme: Theme) => updateSettings({ theme });
  const setPaperSize = (paperSize: PaperSize) => updateSettings({ paperSize });
  const setSelectedProvider = (selectedProvider: ProviderId) => updateSettings({ selectedProvider });
  const setShowAllModels = (providerOrShow: ProviderId | boolean, maybeShow?: boolean) => {
    setSettingsState((prev) => {
      let provider: ProviderId;
      let show: boolean;
      if (typeof providerOrShow === 'boolean') {
        provider = prev.selectedProvider;
        show = providerOrShow;
      } else {
        provider = providerOrShow;
        show = Boolean(maybeShow);
      }
      const nextShowAll = { ...prev.showAllModels, [provider]: show };
      const next = { ...prev, showAllModels: nextShowAll };
      if (!settingsLoadError) {
        storage.set('settings', next);
      }
      return next;
    });
  };

  const setSelectedModel = (provider: ProviderId, model: string) => {
    setSettingsState((prev) => {
      const nextSelected = { ...prev.selectedModel, [provider]: model };
      const next = { ...prev, selectedModel: nextSelected };
      if (!settingsLoadError) {
        storage.set('settings', next);
      }
      return next;
    });
  };

  const setApiKey = (provider: ProviderId, key: string) => {
    setApiKeysState((prev) => {
      const next = { ...prev, [provider]: key };
      if (settings.rememberKeys && !apiKeysLoadError) {
        storage.set('apiKeys', next);
      }
      return next;
    });
  };

  const setRememberKeys = (remember: boolean) => {
    updateSettings({ rememberKeys: remember });
    if (remember) {
      if (!apiKeysLoadError) {
        storage.set('apiKeys', apiKeys);
      }
    } else {
      storage.remove('apiKeys');
    }
  };

  const resetAllData = () => {
    storage.removeAll();
    setSettingsState(DEFAULT_SETTINGS);
    setApiKeysState({ anthropic: '', gemini: '' });
    setModels({ anthropic: [], gemini: [] });
    setModelErrors({ anthropic: null, gemini: null });
  };

  const resetSettings = () => {
    storage.remove('settings');
    setSettingsState(DEFAULT_SETTINGS);
    setSettingsLoadError(null);
  };

  const resetApiKeys = () => {
    storage.remove('apiKeys');
    setApiKeysState({ anthropic: '', gemini: '' });
    setApiKeysLoadError(null);
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
        apiKeys,
        storageAvailable,
        models,
        loadingModels,
        modelErrors,
        loadModels,
        setCachedModels,
        settingsOpen,
        setSettingsOpen,
        settingsTab,
        setSettingsTab,
        openSettings,
        setApiKey,
        setRememberKeys,
        setSelectedModel,
        setShowAllModels,
        updateSettings,
        setTheme,
        setPaperSize,
        setSelectedProvider,
        resetAllData,
        settingsLoadError,
        apiKeysLoadError,
        resetSettings,
        resetApiKeys,
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
