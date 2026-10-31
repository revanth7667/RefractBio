import React, {
  createContext,
  useContext,
  useReducer,
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import type { AppError, OutputKind, OutputTab } from '../types';
import {
  createInitialTabs,
  tabsReducer,
} from '../generation/tabReducer';
import { useSettings } from './SettingsContext';
import { useMasterInfo } from './MasterInfoContext';
import { useInstructions } from './InstructionsContext';
import { useJob } from './JobContext';
import { assemble, OUTPUT_LABEL } from '../prompt/assemble';
import { createInputSnapshot } from '../prompt/snapshot';
import { formatLocalDate } from '../prompt/formatDate';
import { getAdapter } from '../providers/registry';

export interface GenerationProgress {
  current: number;
  total: number;
}

export interface GenerationContextValue {
  tabs: Record<OutputKind, OutputTab>;
  activeTab: OutputKind;
  setActiveTab: (kind: OutputKind) => void;
  isGenerating: boolean;
  generatingProgress: GenerationProgress | null;
  sendRun: () => Promise<void>;
  retryTab: (kind: OutputKind) => Promise<void>;
  clearGeneration: () => void;
  editTab: (kind: OutputKind, text: string) => void;
  statusMessage: string;
  announceStatus: (msg: string) => void;
}

const GenerationContext = createContext<GenerationContextValue | undefined>(undefined);

export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const [tabs, dispatch] = useReducer(tabsReducer, undefined, createInitialTabs);
  const [activeTab, setActiveTab] = useState<OutputKind>('RESUME');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState<GenerationProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const { settings, apiKeys } = useSettings();
  const { effectiveMasterInfo } = useMasterInfo();
  const { resolvedSaved } = useInstructions();
  const { jobInputs } = useJob();

  const selectedProvider = settings.selectedProvider;
  const currentKey = apiKeys[selectedProvider] || '';
  const selectedModel = settings.selectedModel[selectedProvider] || '';

  const announceStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
  }, []);

  const clearGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    dispatch({ type: 'CLEAR_ALL' });
    setIsGenerating(false);
    setGeneratingProgress(null);
  }, []);

  const editTab = useCallback((kind: OutputKind, text: string) => {
    dispatch({ type: 'EDIT', kind, text });
  }, []);

  const retryTab = useCallback(
    async (kind: OutputKind) => {
      if (!currentKey || !selectedModel) return;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsGenerating(true);
      setGeneratingProgress({ current: 1, total: 1 });
      setActiveTab(kind);
      dispatch({ type: 'START', kind });
      announceStatus(`Generating ${OUTPUT_LABEL[kind]}…`);

      try {
        const today = formatLocalDate(new Date());
        const prompt = assemble(
          kind,
          jobInputs,
          effectiveMasterInfo.text,
          resolvedSaved,
          today,
        );
        const snapshot = createInputSnapshot({
          kind,
          masterInfo: effectiveMasterInfo.text,
          instructions: resolvedSaved,
          inputs: jobInputs,
          provider: selectedProvider,
          model: selectedModel,
          generatedAt: new Date().toISOString(),
        });

        const adapter = getAdapter(selectedProvider);
        const result = await adapter.generate({
          config: { id: selectedProvider, apiKey: currentKey },
          model: selectedModel,
          prompt,
          signal: abortController.signal,
          onDelta: (text) => {
            dispatch({ type: 'DELTA', kind, text });
          },
        });

        dispatch({
          type: 'SUCCESS',
          kind,
          fullText: result.text,
          truncated: result.truncated,
          snapshot,
        });
        announceStatus(`${OUTPUT_LABEL[kind]} generated.`);
      } catch (err: unknown) {
        if (!abortController.signal.aborted) {
          dispatch({ type: 'FAIL', kind, error: err as AppError });
          announceStatus(`Failed to generate ${OUTPUT_LABEL[kind]}.`);
        }
      } finally {
        setIsGenerating(false);
        setGeneratingProgress(null);
      }
    },
    [
      currentKey,
      selectedModel,
      selectedProvider,
      jobInputs,
      effectiveMasterInfo.text,
      resolvedSaved,
      announceStatus,
    ],
  );

  const sendRun = useCallback(async () => {
    const outputsToRun = jobInputs.selectedOutputs;
    if (outputsToRun.length === 0 || !currentKey || !selectedModel) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsGenerating(true);
    setActiveTab(outputsToRun[0]);

    // Milestone M7b runs selected outputs sequentially (concurrency 2 queue is Phase M8)
    for (let i = 0; i < outputsToRun.length; i++) {
      if (abortController.signal.aborted) break;

      const kind = outputsToRun[i];
      setGeneratingProgress({ current: i + 1, total: outputsToRun.length });
      dispatch({ type: 'START', kind });
      announceStatus(`Generating ${OUTPUT_LABEL[kind]} (${i + 1} of ${outputsToRun.length})…`);

      try {
        const today = formatLocalDate(new Date());
        const prompt = assemble(
          kind,
          jobInputs,
          effectiveMasterInfo.text,
          resolvedSaved,
          today,
        );
        const snapshot = createInputSnapshot({
          kind,
          masterInfo: effectiveMasterInfo.text,
          instructions: resolvedSaved,
          inputs: jobInputs,
          provider: selectedProvider,
          model: selectedModel,
          generatedAt: new Date().toISOString(),
        });

        const adapter = getAdapter(selectedProvider);
        const result = await adapter.generate({
          config: { id: selectedProvider, apiKey: currentKey },
          model: selectedModel,
          prompt,
          signal: abortController.signal,
          onDelta: (text) => {
            dispatch({ type: 'DELTA', kind, text });
          },
        });

        dispatch({
          type: 'SUCCESS',
          kind,
          fullText: result.text,
          truncated: result.truncated,
          snapshot,
        });
        announceStatus(`${OUTPUT_LABEL[kind]} generated.`);
      } catch (err: unknown) {
        if (abortController.signal.aborted) {
          dispatch({ type: 'ABORT', kind });
          break;
        }
        dispatch({ type: 'FAIL', kind, error: err as AppError });
        announceStatus(`Failed to generate ${OUTPUT_LABEL[kind]}.`);
      }
    }

    setIsGenerating(false);
    setGeneratingProgress(null);
  }, [
    jobInputs,
    currentKey,
    selectedModel,
    selectedProvider,
    effectiveMasterInfo.text,
    resolvedSaved,
    announceStatus,
  ]);

  return (
    <GenerationContext.Provider
      value={{
        tabs,
        activeTab,
        setActiveTab,
        isGenerating,
        generatingProgress,
        sendRun,
        retryTab,
        clearGeneration,
        editTab,
        statusMessage,
        announceStatus,
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration(): GenerationContextValue {
  const context = useContext(GenerationContext);
  if (!context) {
    throw new Error('useGeneration must be used within a GenerationProvider');
  }
  return context;
}
