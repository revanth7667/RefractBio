import type {
  AppError,
  InputSnapshot,
  OutputKind,
  OutputTab,
  OutputVersion,
  TabStatus,
} from '../types';
import { splitGaps } from './gaps';

export type TabAction =
  | { type: 'START' }
  | { type: 'DELTA'; text: string }
  | { type: 'SUCCESS'; fullText: string; truncated: boolean; snapshot: InputSnapshot }
  | { type: 'FAIL'; error: AppError }
  | { type: 'ABORT' }
  | { type: 'STOP'; snapshot?: InputSnapshot; queued?: boolean }
  | { type: 'EDIT'; text: string }
  | { type: 'RESTORE_PREVIOUS' }
  | { type: 'FOLD_EDIT' }
  | { type: 'CLEAR' };

export type TabsAction =
  | { type: 'START'; kind: OutputKind }
  | { type: 'DELTA'; kind: OutputKind; text: string }
  | { type: 'SUCCESS'; kind: OutputKind; fullText: string; truncated: boolean; snapshot: InputSnapshot }
  | { type: 'FAIL'; kind: OutputKind; error: AppError }
  | { type: 'ABORT'; kind: OutputKind }
  | { type: 'STOP'; kind: OutputKind; snapshot?: InputSnapshot; queued?: boolean }
  | { type: 'EDIT'; kind: OutputKind; text: string }
  | { type: 'RESTORE_PREVIOUS'; kind: OutputKind }
  | { type: 'FOLD_EDIT'; kind: OutputKind }
  | { type: 'CLEAR'; kind: OutputKind }
  | { type: 'CLEAR_ALL' };

export function createInitialTab(kind: OutputKind): OutputTab {
  return {
    kind,
    status: 'idle',
    current: null,
    previous: null,
    editorText: '',
    userEdited: false,
    streamingText: '',
    error: null,
  };
}

export function createInitialTabs(): Record<OutputKind, OutputTab> {
  return {
    RESUME: createInitialTab('RESUME'),
    COVER_LETTER: createInitialTab('COVER_LETTER'),
    LINKEDIN_MESSAGE: createInitialTab('LINKEDIN_MESSAGE'),
    EMAIL: createInitialTab('EMAIL'),
    ANSWERS: createInitialTab('ANSWERS'),
  };
}

/**
 * Pure state reducer for a single output tab per §14.1 and §14.3.
 */
export function tabReducer(tab: OutputTab, action: TabAction): OutputTab {
  switch (action.type) {
    case 'START': {
      // If user had edited the draft, fold edits into current.document before starting (§14.3)
      const current =
        tab.userEdited && tab.current
          ? { ...tab.current, document: tab.editorText }
          : tab.current;

      return {
        ...tab,
        status: 'generating',
        current,
        streamingText: '',
        error: null,
      };
    }

    case 'DELTA': {
      return {
        ...tab,
        streamingText: tab.streamingText + action.text,
      };
    }

    case 'SUCCESS': {
      const { document, gaps, gapsMissing } = splitGaps(action.fullText);
      const newVersion: OutputVersion = {
        document,
        gaps,
        gapsMissing,
        truncated: action.truncated,
        stopped: false,
        snapshot: action.snapshot,
      };

      return {
        ...tab,
        status: 'done',
        previous: tab.current,
        current: newVersion,
        editorText: document,
        userEdited: false,
        streamingText: '',
        error: null,
      };
    }

    case 'FAIL': {
      // A7: On error, streaming text is discarded; editorText, current, previous, userEdited unchanged.
      return {
        ...tab,
        status: 'error',
        error: action.error,
        streamingText: '',
      };
    }

    case 'ABORT': {
      // A7: On abort, streaming text discarded; reverts to done if version exists, else idle.
      const nextStatus: TabStatus = tab.current !== null ? 'done' : 'idle';
      return {
        ...tab,
        status: nextStatus,
        streamingText: '',
      };
    }

    case 'STOP': {
      // Stopping after stream already finished is a no-op (§14.8)
      if (tab.status !== 'generating' && !action.queued) {
        return tab;
      }

      // Case 1: Queued job (not yet started)
      if (action.queued) {
        if (tab.current !== null) {
          return {
            ...tab,
            status: 'done',
            streamingText: '',
            error: null,
          };
        }
        return {
          ...tab,
          status: 'idle',
          streamingText: '',
          error: null,
        };
      }

      // Cases 2 & 3: Running job, no text received yet
      if (!tab.streamingText) {
        // Case 2: current !== null -> reverts as in ABORT
        if (tab.current !== null) {
          return {
            ...tab,
            status: 'done',
            streamingText: '',
          };
        }
        // Case 3: current === null -> error category 'stopped'
        return {
          ...tab,
          status: 'error',
          streamingText: '',
          error: {
            category: 'stopped',
            message:
              'Stopped before anything came back. Press Retry, or choose another provider or model.',
          },
        };
      }

      // Case 4: Running job, some text received
      const { document, gaps, gapsMissing } = splitGaps(tab.streamingText);
      const snapshot: InputSnapshot = action.snapshot ?? (tab.current ? tab.current.snapshot : {
        hash: '',
        provider: 'anthropic',
        model: '',
        generatedAt: new Date().toISOString(),
        attachmentNames: [],
      });
      const newVersion: OutputVersion = {
        document,
        gaps,
        gapsMissing,
        truncated: false,
        stopped: true,
        snapshot,
      };

      return {
        ...tab,
        status: 'done',
        previous: tab.current,
        current: newVersion,
        editorText: document,
        userEdited: false,
        streamingText: '',
        error: null,
      };
    }

    case 'EDIT': {
      const userEdited =
        tab.current !== null ? action.text !== tab.current.document : false;
      return {
        ...tab,
        editorText: action.text,
        userEdited,
      };
    }

    case 'RESTORE_PREVIOUS': {
      if (!tab.previous) {
        return tab;
      }
      return {
        ...tab,
        current: tab.previous,
        previous: tab.current,
        editorText: tab.previous.document,
        userEdited: false,
      };
    }

    case 'FOLD_EDIT': {
      if (tab.current && tab.userEdited) {
        return {
          ...tab,
          current: {
            ...tab.current,
            document: tab.editorText,
          },
        };
      }
      return tab;
    }

    case 'CLEAR': {
      return createInitialTab(tab.kind);
    }

    default:
      return tab;
  }
}

/**
 * Pure state reducer for all output tabs keyed by OutputKind.
 */
export function tabsReducer(
  state: Record<OutputKind, OutputTab>,
  action: TabsAction,
): Record<OutputKind, OutputTab> {
  if (action.type === 'CLEAR_ALL') {
    return createInitialTabs();
  }

  const tab = state[action.kind];
  if (!tab) return state;

  return {
    ...state,
    [action.kind]: tabReducer(tab, action),
  };
}
