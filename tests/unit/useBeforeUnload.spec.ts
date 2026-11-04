import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBeforeUnload } from '../../src/state/useBeforeUnload';
import { createInitialTabs } from '../../src/generation/tabReducer';
import type { OutputTab, OutputVersion } from '../../src/types';

describe('useBeforeUnload hook (§14.7, Task 8)', () => {
  let addListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addListenerSpy = vi.spyOn(window, 'addEventListener');
    removeListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addListenerSpy.mockRestore();
    removeListenerSpy.mockRestore();
  });

  const dummyVersion: OutputVersion = {
    document: 'Draft text',
    gaps: '',
    gapsMissing: false,
    truncated: false,
    stopped: false,
    snapshot: {
      hash: 'h1234567',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      generatedAt: '2026-10-30T12:00:00.000Z',
      attachmentNames: [],
    },
  };

  it('is NOT registered on a fresh profile (no outputs, idle, not generating, no user edits)', () => {
    const tabs = createInitialTabs();
    renderHook(() => useBeforeUnload(tabs, false));

    const beforeUnloadAdds = addListenerSpy.mock.calls.filter(
      (call) => call[0] === 'beforeunload',
    );
    expect(beforeUnloadAdds.length).toBe(0);
  });

  it('is registered when any tab has current !== null (outputs exist)', () => {
    const tabs = createInitialTabs();
    tabs.RESUME = {
      ...tabs.RESUME,
      status: 'done',
      current: dummyVersion,
    };

    const { unmount } = renderHook(() => useBeforeUnload(tabs, false));

    const beforeUnloadAdds = addListenerSpy.mock.calls.filter(
      (call) => call[0] === 'beforeunload',
    );
    expect(beforeUnloadAdds.length).toBe(1);

    // Invoking handler calls preventDefault and sets returnValue
    const handler = beforeUnloadAdds[0][1] as (e: BeforeUnloadEvent) => unknown;
    const fakeEvent = {
      preventDefault: vi.fn(),
      returnValue: 'initial',
    } as unknown as BeforeUnloadEvent;

    handler(fakeEvent);
    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(fakeEvent.returnValue).toBe('');

    unmount();
    const beforeUnloadRemoves = removeListenerSpy.mock.calls.filter(
      (call) => call[0] === 'beforeunload',
    );
    expect(beforeUnloadRemoves.length).toBe(1);
  });

  it('is registered when any tab is generating or isGenerating is true', () => {
    const tabs = createInitialTabs();
    tabs.COVER_LETTER = {
      ...tabs.COVER_LETTER,
      status: 'generating',
    };

    renderHook(() => useBeforeUnload(tabs, true));

    const beforeUnloadAdds = addListenerSpy.mock.calls.filter(
      (call) => call[0] === 'beforeunload',
    );
    expect(beforeUnloadAdds.length).toBe(1);
  });

  it('is registered when userEdited is true', () => {
    const tabs = createInitialTabs();
    tabs.EMAIL = {
      ...tabs.EMAIL,
      userEdited: true,
    };

    renderHook(() => useBeforeUnload(tabs, false));

    const beforeUnloadAdds = addListenerSpy.mock.calls.filter(
      (call) => call[0] === 'beforeunload',
    );
    expect(beforeUnloadAdds.length).toBe(1);
  });

  it('is removed when tabs are reset to empty (e.g. after Clear job)', () => {
    let tabs: Record<string, OutputTab> = createInitialTabs();
    tabs.RESUME = {
      ...tabs.RESUME,
      status: 'done',
      current: dummyVersion,
    };

    let generating = false;

    const { rerender } = renderHook(() => useBeforeUnload(tabs, generating));

    expect(
      addListenerSpy.mock.calls.filter((call) => call[0] === 'beforeunload').length,
    ).toBe(1);

    // Simulate Clear job: tabs reset to initial, generating false
    tabs = createInitialTabs();
    generating = false;

    rerender();

    expect(
      removeListenerSpy.mock.calls.filter((call) => call[0] === 'beforeunload').length,
    ).toBe(1);
  });
});

