import { describe, it, expect } from 'vitest';
import {
  createInitialTab,
  createInitialTabs,
  tabReducer,
  tabsReducer,
} from '../../src/generation/tabReducer';
import { GAPS_DELIMITER } from '../../src/config';
import type { AppError, InputSnapshot } from '../../src/types';

describe('tabReducer (src/generation/tabReducer.ts, §14.1–§14.3)', () => {
  const dummySnapshot: InputSnapshot = {
    hash: 'h1234567',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    generatedAt: '2026-10-30T14:00:00.000Z',
    attachmentNames: [],
  };

  it('initializes tab with idle status and empty fields', () => {
    const tab = createInitialTab('RESUME');
    expect(tab.kind).toBe('RESUME');
    expect(tab.status).toBe('idle');
    expect(tab.current).toBeNull();
    expect(tab.previous).toBeNull();
    expect(tab.editorText).toBe('');
    expect(tab.userEdited).toBe(false);
    expect(tab.streamingText).toBe('');
    expect(tab.error).toBeNull();
  });

  it('handles START action: sets status to generating, resets streamingText and error', () => {
    const initial = createInitialTab('RESUME');
    const generating = tabReducer(initial, { type: 'START' });

    expect(generating.status).toBe('generating');
    expect(generating.streamingText).toBe('');
    expect(generating.error).toBeNull();
  });

  it('folds user edits into current.document on START when userEdited is true (§14.3)', () => {
    const initial = createInitialTab('RESUME');
    const withVersion = tabReducer(initial, {
      type: 'SUCCESS',
      fullText: 'Draft 1',
      truncated: false,
      snapshot: dummySnapshot,
    });

    const edited = tabReducer(withVersion, {
      type: 'EDIT',
      text: 'Draft 1 with manual user edits',
    });
    expect(edited.userEdited).toBe(true);
    expect(edited.current?.document).toBe('Draft 1');

    const restarted = tabReducer(edited, { type: 'START' });
    expect(restarted.current?.document).toBe('Draft 1 with manual user edits');
  });

  it('handles DELTA action: appends text deltas to streamingText', () => {
    let tab = createInitialTab('RESUME');
    tab = tabReducer(tab, { type: 'START' });
    tab = tabReducer(tab, { type: 'DELTA', text: 'Hello ' });
    tab = tabReducer(tab, { type: 'DELTA', text: 'world!' });

    expect(tab.streamingText).toBe('Hello world!');
  });

  it('handles SUCCESS action: splits gaps, commits new version, sets status to done, resets userEdited', () => {
    let tab = createInitialTab('RESUME');
    tab = tabReducer(tab, { type: 'START' });
    tab = tabReducer(tab, { type: 'DELTA', text: 'Streaming chunk' });

    const fullText = `Executive Summary\nSkills: SQL\n${GAPS_DELIMITER}\n- Missing Python experience`;
    tab = tabReducer(tab, {
      type: 'SUCCESS',
      fullText,
      truncated: true,
      snapshot: dummySnapshot,
    });

    expect(tab.status).toBe('done');
    expect(tab.streamingText).toBe('');
    expect(tab.editorText).toBe('Executive Summary\nSkills: SQL');
    expect(tab.userEdited).toBe(false);
    expect(tab.error).toBeNull();
    expect(tab.current?.document).toBe('Executive Summary\nSkills: SQL');
    expect(tab.current?.gaps).toBe('- Missing Python experience');
    expect(tab.current?.gapsMissing).toBe(false);
    expect(tab.current?.truncated).toBe(true);
  });

  it('handles FAIL action (A7): sets error status, discards streamingText, keeps editorText and versions', () => {
    let tab = createInitialTab('RESUME');
    tab = tabReducer(tab, {
      type: 'SUCCESS',
      fullText: 'Previous good draft',
      truncated: false,
      snapshot: dummySnapshot,
    });

    tab = tabReducer(tab, { type: 'START' });
    tab = tabReducer(tab, { type: 'DELTA', text: 'Partial failing chunk' });

    const err: AppError = {
      category: 'rate_limit',
      message: 'Rate limit reached for Anthropic. Wait a moment and press Retry.',
    };

    tab = tabReducer(tab, { type: 'FAIL', error: err });

    expect(tab.status).toBe('error');
    expect(tab.error).toEqual(err);
    expect(tab.streamingText).toBe('');
    expect(tab.editorText).toBe('Previous good draft');
    expect(tab.current?.document).toBe('Previous good draft');
  });

  it('handles ABORT action (A7): reverts to done if version exists, or idle if none', () => {
    let tabWithNoVersion = createInitialTab('RESUME');
    tabWithNoVersion = tabReducer(tabWithNoVersion, { type: 'START' });
    tabWithNoVersion = tabReducer(tabWithNoVersion, { type: 'DELTA', text: 'Partial...' });
    const abortedNoVersion = tabReducer(tabWithNoVersion, { type: 'ABORT' });
    expect(abortedNoVersion.status).toBe('idle');
    expect(abortedNoVersion.streamingText).toBe('');

    let tabWithVersion = createInitialTab('RESUME');
    tabWithVersion = tabReducer(tabWithVersion, {
      type: 'SUCCESS',
      fullText: 'Committed draft',
      truncated: false,
      snapshot: dummySnapshot,
    });
    tabWithVersion = tabReducer(tabWithVersion, { type: 'START' });
    const abortedWithVersion = tabReducer(tabWithVersion, { type: 'ABORT' });
    expect(abortedWithVersion.status).toBe('done');
    expect(abortedWithVersion.editorText).toBe('Committed draft');
  });

  it('handles EDIT action: tracks userEdited compared to current.document', () => {
    let tab = createInitialTab('COVER_LETTER');
    tab = tabReducer(tab, {
      type: 'SUCCESS',
      fullText: 'Original letter',
      truncated: false,
      snapshot: dummySnapshot,
    });

    tab = tabReducer(tab, { type: 'EDIT', text: 'Modified letter' });
    expect(tab.editorText).toBe('Modified letter');
    expect(tab.userEdited).toBe(true);

    tab = tabReducer(tab, { type: 'EDIT', text: 'Original letter' });
    expect(tab.userEdited).toBe(false);
  });

  it('handles RESTORE_PREVIOUS action: swaps current and previous versions (§14.3)', () => {
    let tab = createInitialTab('EMAIL');
    tab = tabReducer(tab, {
      type: 'SUCCESS',
      fullText: 'Version 1',
      truncated: false,
      snapshot: dummySnapshot,
    });
    tab = tabReducer(tab, {
      type: 'SUCCESS',
      fullText: 'Version 2',
      truncated: false,
      snapshot: dummySnapshot,
    });

    expect(tab.current?.document).toBe('Version 2');
    expect(tab.previous?.document).toBe('Version 1');

    tab = tabReducer(tab, { type: 'RESTORE_PREVIOUS' });
    expect(tab.current?.document).toBe('Version 1');
    expect(tab.previous?.document).toBe('Version 2');
    expect(tab.editorText).toBe('Version 1');
    expect(tab.userEdited).toBe(false);

    // Pressing it twice returns to original (A8)
    tab = tabReducer(tab, { type: 'RESTORE_PREVIOUS' });
    expect(tab.current?.document).toBe('Version 2');
    expect(tab.previous?.document).toBe('Version 1');
    expect(tab.editorText).toBe('Version 2');
  });

  it('handles CLEAR action: resets tab to pristine idle state', () => {
    let tab = createInitialTab('ANSWERS');
    tab = tabReducer(tab, {
      type: 'SUCCESS',
      fullText: 'Answers draft',
      truncated: false,
      snapshot: dummySnapshot,
    });

    const cleared = tabReducer(tab, { type: 'CLEAR' });
    expect(cleared.status).toBe('idle');
    expect(cleared.current).toBeNull();
    expect(cleared.previous).toBeNull();
    expect(cleared.editorText).toBe('');
    expect(cleared.userEdited).toBe(false);
  });

  it('tabsReducer routes actions to the specified tab and supports CLEAR_ALL', () => {
    let tabs = createInitialTabs();
    tabs = tabsReducer(tabs, {
      type: 'START',
      kind: 'RESUME',
    });
    tabs = tabsReducer(tabs, {
      type: 'SUCCESS',
      kind: 'RESUME',
      fullText: 'Resume text',
      truncated: false,
      snapshot: dummySnapshot,
    });

    expect(tabs.RESUME.status).toBe('done');
    expect(tabs.COVER_LETTER.status).toBe('idle');

    tabs = tabsReducer(tabs, { type: 'CLEAR_ALL' });
    expect(tabs.RESUME.status).toBe('idle');
    expect(tabs.RESUME.current).toBeNull();
  });

  it('folds edits on FOLD_EDIT (fold-on-confirm) so previous will hold edits after success (§14.3)', () => {
    let tab = createInitialTab('RESUME');
    tab = tabReducer(tab, {
      type: 'SUCCESS',
      fullText: 'Draft 1',
      truncated: false,
      snapshot: dummySnapshot,
    });

    tab = tabReducer(tab, {
      type: 'EDIT',
      text: 'Draft 1 manually edited by user',
    });
    expect(tab.userEdited).toBe(true);

    // Confirm dialog Continue folds edits into current.document before generation starts
    tab = tabReducer(tab, { type: 'FOLD_EDIT' });
    expect(tab.current?.document).toBe('Draft 1 manually edited by user');

    tab = tabReducer(tab, { type: 'START' });
    tab = tabReducer(tab, {
      type: 'SUCCESS',
      fullText: 'Draft 2 from model',
      truncated: false,
      snapshot: dummySnapshot,
    });

    // Previous version holds the user-edited text, not the stale generated text
    expect(tab.previous?.document).toBe('Draft 1 manually edited by user');
    expect(tab.current?.document).toBe('Draft 2 from model');
  });
});
