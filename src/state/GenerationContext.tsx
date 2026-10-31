import React, {
  createContext,
  useContext,
  useReducer,
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/components/ui/alert-dialog';
import type { AppError, OutputKind, OutputTab } from '../types';
import { OUTPUT_NAMES } from '../types';
import {
  createInitialTabs,
  tabsReducer,
} from '../generation/tabReducer';
import { GenerationQueue } from '../generation/queue';
import { useSettings } from './SettingsContext';
import { useMasterInfo } from './MasterInfoContext';
import { useInstructions } from './InstructionsContext';
import { useJob, OUTPUT_ORDER } from './JobContext';
import { assemble, OUTPUT_LABEL } from '../prompt/assemble';
import { computeSnapshotHash, createInputSnapshot } from '../prompt/snapshot';
import { formatLocalDate } from '../prompt/formatDate';
import { getAdapter } from '../providers/registry';
import { useBeforeUnload } from './useBeforeUnload';

export interface GenerationProgress {
  completed: number;
  total: number;
  /** Backwards compatibility alias for completed */
  current: number;
}

export interface GenerationContextValue {
  tabs: Record<OutputKind, OutputTab>;
  activeTab: OutputKind;
  setActiveTab: (kind: OutputKind) => void;
  isGenerating: boolean;
  isTabBusy: (kind: OutputKind) => boolean;
  isTabStale: (kind: OutputKind) => boolean;
  generatingProgress: GenerationProgress | null;
  sendRun: () => Promise<void>;
  retryTab: (kind: OutputKind) => Promise<void>;
  restoreTab: (kind: OutputKind) => void;
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

  // Overwrite confirm dialog state (§14.3)
  const [overwriteDialogOpen, setOverwriteDialogOpen] = useState(false);
  const [overwriteNames, setOverwriteNames] = useState('');
  const overwriteCallbackRef = useRef<(() => void) | null>(null);

  // Restore confirm dialog state (§14.3)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const restoreKindRef = useRef<OutputKind | null>(null);

  // Stale tabs state (§14.4, debounced 300 ms)
  const [staleTabs, setStaleTabs] = useState<Record<OutputKind, boolean>>({
    RESUME: false,
    COVER_LETTER: false,
    LINKEDIN_MESSAGE: false,
    EMAIL: false,
    ANSWERS: false,
  });

  // Track active/queued state across renders
  const queueRef = useRef<GenerationQueue<OutputKind>>(new GenerationQueue<OutputKind>(2));
  const runIdRef = useRef<number>(0);
  const clearedRef = useRef<boolean>(false);
  const totalJobsRef = useRef<number>(0);
  const completedJobsRef = useRef<number>(0);

  // Re-render when queue pending status changes
  const [, setQueueVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = queueRef.current.subscribe(() => {
      setQueueVersion((v) => v + 1);
      const pendingCount = queueRef.current.totalPending;
      if (pendingCount === 0) {
        setIsGenerating(false);
        setGeneratingProgress(null);
      } else {
        setIsGenerating(true);
      }
    });

    const currentQueue = queueRef.current;
    return () => {
      unsubscribe();
      currentQueue.abortAll();
    };
  }, []);

  const { settings, apiKeys } = useSettings();
  const { effectiveMasterInfo } = useMasterInfo();
  const { resolvedSaved } = useInstructions();
  const { jobInputs } = useJob();

  const selectedProvider = settings.selectedProvider;
  const currentKey = apiKeys[selectedProvider] || '';
  const selectedModel = settings.selectedModel[selectedProvider] || '';

  // Leave-page warning hook (§14.7)
  useBeforeUnload(tabs, isGenerating);

  // Debounced stale badge recomputation (§14.4, 300 ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      const nextStale: Record<OutputKind, boolean> = {
        RESUME: false,
        COVER_LETTER: false,
        LINKEDIN_MESSAGE: false,
        EMAIL: false,
        ANSWERS: false,
      };

      for (const kind of OUTPUT_ORDER) {
        const currentVersion = tabs[kind].current;
        if (currentVersion?.snapshot) {
          const currentHash = computeSnapshotHash({
            kind,
            masterInfo: effectiveMasterInfo.text,
            instructions: resolvedSaved,
            inputs: jobInputs,
            provider: selectedProvider,
            model: selectedModel,
          });
          nextStale[kind] = currentHash !== currentVersion.snapshot.hash;
        }
      }

      setStaleTabs(nextStale);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    tabs,
    effectiveMasterInfo.text,
    resolvedSaved,
    jobInputs,
    selectedProvider,
    selectedModel,
  ]);

  const announceStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
  }, []);

  const clearGeneration = useCallback(() => {
    clearedRef.current = true;
    runIdRef.current++;
    queueRef.current.abortAll();
    dispatch({ type: 'CLEAR_ALL' });
    setIsGenerating(false);
    setGeneratingProgress(null);
  }, []);

  const editTab = useCallback((kind: OutputKind, text: string) => {
    dispatch({ type: 'EDIT', kind, text });
  }, []);

  const isTabBusy = useCallback((kind: OutputKind) => {
    return queueRef.current.isPending(kind) || tabs[kind].status === 'generating';
  }, [tabs]);

  const isTabStale = useCallback((kind: OutputKind) => {
    return staleTabs[kind] ?? false;
  }, [staleTabs]);

  const runSingleGeneration = useCallback(
    async (kind: OutputKind, signal: AbortSignal, runId: number) => {
      if (signal.aborted || clearedRef.current || runIdRef.current !== runId) return;

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
          signal,
          onDelta: (text) => {
            if (signal.aborted || clearedRef.current || runIdRef.current !== runId) return;
            dispatch({ type: 'DELTA', kind, text });
          },
        });

        if (signal.aborted || clearedRef.current || runIdRef.current !== runId) return;

        dispatch({
          type: 'SUCCESS',
          kind,
          fullText: result.text,
          truncated: result.truncated,
          snapshot,
        });
        announceStatus(`${OUTPUT_LABEL[kind]} generated.`);
      } catch (err: unknown) {
        if (signal.aborted || clearedRef.current || runIdRef.current !== runId) {
          if (!clearedRef.current && runIdRef.current === runId) {
            dispatch({ type: 'ABORT', kind });
          }
          return;
        }

        dispatch({ type: 'FAIL', kind, error: err as AppError });
        announceStatus(`Failed to generate ${OUTPUT_LABEL[kind]}.`);
      }
    },
    [
      jobInputs,
      effectiveMasterInfo.text,
      resolvedSaved,
      selectedProvider,
      selectedModel,
      currentKey,
      announceStatus,
    ],
  );

  const executeJobs = useCallback(
    async (kindsToRun: OutputKind[]) => {
      clearedRef.current = false;
      const currentRunId = runIdRef.current;

      setIsGenerating(true);
      setActiveTab(kindsToRun[0]);

      totalJobsRef.current = kindsToRun.length;
      completedJobsRef.current = 0;
      setGeneratingProgress({
        completed: 0,
        total: kindsToRun.length,
        current: Math.min(1, kindsToRun.length),
      });

      const promises = kindsToRun.map((kind) => {
        return queueRef.current
          .enqueue(kind, async (signal) => {
            await runSingleGeneration(kind, signal, currentRunId);
          })
          .finally(() => {
            if (!clearedRef.current && runIdRef.current === currentRunId) {
              completedJobsRef.current++;
              setGeneratingProgress({
                completed: completedJobsRef.current,
                total: totalJobsRef.current,
                current: Math.min(completedJobsRef.current + 1, totalJobsRef.current),
              });
            }
          });
      });

      await Promise.allSettled(promises);

      if (!clearedRef.current && queueRef.current.totalPending === 0) {
        setIsGenerating(false);
        setGeneratingProgress(null);
      }
    },
    [runSingleGeneration],
  );

  const executePerTabRetry = useCallback(
    async (kind: OutputKind) => {
      clearedRef.current = false;
      const currentRunId = runIdRef.current;

      setIsGenerating(true);
      setActiveTab(kind);

      await queueRef.current
        .enqueue(kind, async (signal) => {
          await runSingleGeneration(kind, signal, currentRunId);
        })
        .catch(() => {
          // Handled inside runSingleGeneration
        });

      if (!clearedRef.current && queueRef.current.totalPending === 0) {
        setIsGenerating(false);
      }
    },
    [runSingleGeneration],
  );

  const sendRun = useCallback(async () => {
    const kindsToSend = OUTPUT_ORDER.filter((k) => jobInputs.selectedOutputs.includes(k));
    if (kindsToSend.length === 0 || !currentKey || !selectedModel || isGenerating) return;

    // Edit-overwrite confirm (§14.3)
    const editedKinds = kindsToSend.filter((k) => tabs[k].userEdited);
    if (editedKinds.length > 0) {
      const names = editedKinds.map((k) => OUTPUT_NAMES[k]).join(', ');
      setOverwriteNames(names);
      overwriteCallbackRef.current = () => {
        for (const k of editedKinds) {
          dispatch({ type: 'FOLD_EDIT', kind: k });
        }
        executeJobs(kindsToSend);
      };
      setOverwriteDialogOpen(true);
      return;
    }

    executeJobs(kindsToSend);
  }, [jobInputs.selectedOutputs, currentKey, selectedModel, isGenerating, tabs, executeJobs]);

  const retryTab = useCallback(
    async (kind: OutputKind) => {
      if (!currentKey || !selectedModel || isTabBusy(kind)) return;

      // Edit-overwrite confirm (§14.3)
      if (tabs[kind].userEdited) {
        const names = OUTPUT_NAMES[kind];
        setOverwriteNames(names);
        overwriteCallbackRef.current = () => {
          dispatch({ type: 'FOLD_EDIT', kind });
          executePerTabRetry(kind);
        };
        setOverwriteDialogOpen(true);
        return;
      }

      executePerTabRetry(kind);
    },
    [currentKey, selectedModel, isTabBusy, tabs, executePerTabRetry],
  );

  const restoreTab = useCallback(
    (kind: OutputKind) => {
      const tab = tabs[kind];
      if (!tab || tab.previous === null || isTabBusy(kind)) return;

      if (tab.userEdited) {
        restoreKindRef.current = kind;
        setRestoreDialogOpen(true);
        return;
      }

      dispatch({ type: 'RESTORE_PREVIOUS', kind });
    },
    [tabs, isTabBusy],
  );

  const handleConfirmOverwrite = () => {
    setOverwriteDialogOpen(false);
    if (overwriteCallbackRef.current) {
      const cb = overwriteCallbackRef.current;
      overwriteCallbackRef.current = null;
      cb();
    }
  };

  const handleCancelOverwrite = () => {
    setOverwriteDialogOpen(false);
    overwriteCallbackRef.current = null;
  };

  const handleConfirmRestore = () => {
    setRestoreDialogOpen(false);
    if (restoreKindRef.current) {
      dispatch({ type: 'RESTORE_PREVIOUS', kind: restoreKindRef.current });
      restoreKindRef.current = null;
    }
  };

  const handleCancelRestore = () => {
    setRestoreDialogOpen(false);
    restoreKindRef.current = null;
  };

  return (
    <GenerationContext.Provider
      value={{
        tabs,
        activeTab,
        setActiveTab,
        isGenerating,
        isTabBusy,
        isTabStale,
        generatingProgress,
        sendRun,
        retryTab,
        restoreTab,
        clearGeneration,
        editTab,
        statusMessage,
        announceStatus,
      }}
    >
      {children}

      {/* Edit-overwrite Confirmation AlertDialog (§14.3) */}
      <AlertDialog open={overwriteDialogOpen} onOpenChange={setOverwriteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite edits?</AlertDialogTitle>
            <AlertDialogDescription>
              {`You edited ${overwriteNames}. Regenerating will replace your edits (you can still restore the previous version once). Continue?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelOverwrite}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmOverwrite}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore previous version Confirmation AlertDialog (§14.3) */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your unsaved edits to this tab?</AlertDialogTitle>
            <AlertDialogDescription>
              Discard your unsaved edits to this tab?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelRestore}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRestore}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
