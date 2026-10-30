import React, { createContext, useContext, useState } from 'react';
import type { EffectiveMasterInfo, MasterInfoFile } from '../types';
import * as storage from '../storage/storage';
import { resolveEffective } from '../masterInfo/masterInfo';
import sampleRaw from '../data/master-info.sample.md?raw';

export interface SaveResult {
  ok: boolean;
  reason?: 'quota_exceeded' | 'unavailable' | 'parse_error' | 'schema_mismatch' | 'not_found';
  message?: string;
}

export interface MasterInfoContextValue {
  savedMasterInfo: MasterInfoFile | null;
  savedText: string | null;
  editorDraft: string;
  setEditorDraft: (text: string) => void;
  effectiveMasterInfo: EffectiveMasterInfo;
  hasUnsavedChanges: boolean;
  saveMasterInfo: () => SaveResult;
  resetMasterInfoToSample: () => void;
  discardDraft: () => void;
  clearMasterInfo: () => void;
  loadError: 'parse_error' | 'schema_mismatch' | null;
}

const MasterInfoContext = createContext<MasterInfoContextValue | undefined>(undefined);

export function MasterInfoProvider({ children }: { children: React.ReactNode }) {
  const [savedMasterInfo, setSavedMasterInfo] = useState<MasterInfoFile | null>(() => {
    const res = storage.get<MasterInfoFile>('masterInfo');
    if (res.ok) {
      return res.value;
    }
    return null;
  });

  const [loadError, setLoadError] = useState<'parse_error' | 'schema_mismatch' | null>(() => {
    const res = storage.get<MasterInfoFile>('masterInfo');
    if (!res.ok && (res.reason === 'parse_error' || res.reason === 'schema_mismatch')) {
      return res.reason;
    }
    return null;
  });

  const [editorDraft, setEditorDraft] = useState<string>(() => {
    const res = storage.get<MasterInfoFile>('masterInfo');
    if (res.ok) {
      return res.value.text;
    }
    return sampleRaw;
  });

  const effectiveMasterInfo = resolveEffective(savedMasterInfo, sampleRaw);

  const baselineText = savedMasterInfo !== null ? savedMasterInfo.text : sampleRaw;
  const hasUnsavedChanges = editorDraft !== baselineText;

  const saveMasterInfo = (): SaveResult => {
    const newFile: MasterInfoFile = {
      text: editorDraft,
      updatedAt: new Date().toISOString(),
    };

    const res = storage.set('masterInfo', newFile);

    if (res.ok) {
      setSavedMasterInfo(newFile);
      setLoadError(null);
      return { ok: true };
    }

    if (res.reason === 'unavailable') {
      // In-memory state counts as stored for the tab
      setSavedMasterInfo(newFile);
      setLoadError(null);
      return { ok: true, reason: 'unavailable', message: res.message };
    }

    if (res.reason === 'quota_exceeded') {
      return {
        ok: false,
        reason: 'quota_exceeded',
        message: "Couldn't save: browser storage is full. Download a copy now, then shorten the file or delete app data.",
      };
    }

    return {
      ok: false,
      reason: res.reason,
      message: res.message,
    };
  };

  const resetMasterInfoToSample = () => {
    const newFile: MasterInfoFile = {
      text: sampleRaw,
      updatedAt: new Date().toISOString(),
    };
    setEditorDraft(sampleRaw);
    setSavedMasterInfo(newFile);
    setLoadError(null);
    storage.set('masterInfo', newFile);
  };

  const discardDraft = () => {
    setEditorDraft(baselineText);
  };

  const clearMasterInfo = () => {
    setSavedMasterInfo(null);
    setEditorDraft(sampleRaw);
    setLoadError(null);
  };

  return (
    <MasterInfoContext.Provider
      value={{
        savedMasterInfo,
        savedText: savedMasterInfo ? savedMasterInfo.text : null,
        editorDraft,
        setEditorDraft,
        effectiveMasterInfo,
        hasUnsavedChanges,
        saveMasterInfo,
        resetMasterInfoToSample,
        discardDraft,
        clearMasterInfo,
        loadError,
      }}
    >
      {children}
    </MasterInfoContext.Provider>
  );
}

export function useMasterInfo(): MasterInfoContextValue {
  const ctx = useContext(MasterInfoContext);
  if (!ctx) {
    throw new Error('useMasterInfo must be used within a MasterInfoProvider');
  }
  return ctx;
}

