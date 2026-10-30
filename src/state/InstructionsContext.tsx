import React, { createContext, useContext, useState } from 'react';
import type { InstructionsFile, ResolvedInstructions } from '../types';
import * as storage from '../storage/storage';
import { resolveInstructions, splitInstructions } from '../instructions/split';
import defaultInstructionsRaw from '../data/instructions.default.md?raw';

export interface SaveInstructionsResult {
  ok: boolean;
  reason?: 'quota_exceeded' | 'unavailable' | 'parse_error' | 'schema_mismatch' | 'not_found';
  message?: string;
}

export interface InstructionsContextValue {
  savedInstructions: InstructionsFile | null;
  savedText: string | null;
  editorDraft: string;
  setEditorDraft: (text: string) => void;
  resolvedSaved: ResolvedInstructions;
  resolvedDraft: ResolvedInstructions;
  hasUnsavedChanges: boolean;
  saveInstructions: () => SaveInstructionsResult;
  discardDraft: () => void;
  clearInstructions: () => void;
  resetInstructionsToDefault: () => void;
  loadError: 'parse_error' | 'schema_mismatch' | null;
}

const InstructionsContext = createContext<InstructionsContextValue | undefined>(undefined);

export function InstructionsProvider({ children }: { children: React.ReactNode }) {
  const [savedInstructions, setSavedInstructions] = useState<InstructionsFile | null>(() => {
    const res = storage.get<InstructionsFile>('instructions');
    if (res.ok) {
      return res.value;
    }
    return null;
  });

  const [loadError, setLoadError] = useState<'parse_error' | 'schema_mismatch' | null>(() => {
    const res = storage.get<InstructionsFile>('instructions');
    if (!res.ok && (res.reason === 'parse_error' || res.reason === 'schema_mismatch')) {
      return res.reason;
    }
    return null;
  });

  const [editorDraft, setEditorDraft] = useState<string>(() => {
    const res = storage.get<InstructionsFile>('instructions');
    if (res.ok) {
      return res.value.text;
    }
    return defaultInstructionsRaw;
  });

  const baselineText = savedInstructions !== null ? savedInstructions.text : defaultInstructionsRaw;
  const hasUnsavedChanges = editorDraft !== baselineText;

  // Resolved result for saved text (which generation uses)
  const resolvedSaved = resolveInstructions(savedInstructions, defaultInstructionsRaw);

  // Resolved result for draft text (for previewing warnings in editor)
  const resolvedDraft = splitInstructions(editorDraft, defaultInstructionsRaw);

  const saveInstructions = (): SaveInstructionsResult => {
    const newFile: InstructionsFile = {
      text: editorDraft,
      updatedAt: new Date().toISOString(),
    };

    const res = storage.set('instructions', newFile);

    if (res.ok) {
      setSavedInstructions(newFile);
      setLoadError(null);
      return { ok: true };
    }

    if (res.reason === 'unavailable') {
      // In-memory state counts as stored for the tab
      setSavedInstructions(newFile);
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

  const discardDraft = () => {
    setEditorDraft(baselineText);
  };

  const resetInstructionsToDefault = () => {
    const newFile: InstructionsFile = {
      text: defaultInstructionsRaw,
      updatedAt: new Date().toISOString(),
    };
    setEditorDraft(defaultInstructionsRaw);
    setSavedInstructions(newFile);
    setLoadError(null);
    storage.set('instructions', newFile);
  };

  const clearInstructions = () => {
    setSavedInstructions(null);
    setEditorDraft(defaultInstructionsRaw);
    setLoadError(null);
  };

  return (
    <InstructionsContext.Provider
      value={{
        savedInstructions,
        savedText: savedInstructions ? savedInstructions.text : null,
        editorDraft,
        setEditorDraft,
        resolvedSaved,
        resolvedDraft,
        hasUnsavedChanges,
        saveInstructions,
        discardDraft,
        clearInstructions,
        resetInstructionsToDefault,
        loadError,
      }}
    >
      {children}
    </InstructionsContext.Provider>
  );
}

const DEFAULT_INSTRUCTIONS_VALUE: InstructionsContextValue = {
  savedInstructions: null,
  savedText: null,
  editorDraft: defaultInstructionsRaw,
  setEditorDraft: () => {},
  resolvedSaved: resolveInstructions(null, defaultInstructionsRaw),
  resolvedDraft: splitInstructions(defaultInstructionsRaw, defaultInstructionsRaw),
  hasUnsavedChanges: false,
  saveInstructions: () => ({ ok: true }),
  discardDraft: () => {},
  clearInstructions: () => {},
  resetInstructionsToDefault: () => {},
  loadError: null,
};

export function useInstructions(): InstructionsContextValue {
  const ctx = useContext(InstructionsContext);
  if (!ctx) {
    return DEFAULT_INSTRUCTIONS_VALUE;
  }
  return ctx;
}
