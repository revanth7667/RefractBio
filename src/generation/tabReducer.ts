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
  | { type: 'EDIT'; text: string }
  | { type: 'RESTORE_PREVIOUS' }
  | { type: 'CLEAR' };

export type TabsAction =
  | { type: 'START'; kind: OutputKind }
  | { type: 'DELTA'; kind: OutputKind; text: string }
  | { type: 'SUCCESS'; kind: OutputKind; fullText: string; truncated: boolean; snapshot: InputSnapshot }
  | { type: 'FAIL'; kind: OutputKind; error: AppError }
  | { type: 'ABORT'; kind: OutputKind }
  | { type: 'EDIT'; kind: OutputKind; text: string }
  | { type: 'RESTORE_PREVIOUS'; kind: OutputKind }
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
