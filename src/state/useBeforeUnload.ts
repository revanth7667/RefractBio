import { useEffect } from 'react';
import type { OutputKind, OutputTab } from '../types';

/**
 * Register a beforeunload handler (preventDefault and returnValue = '') ONLY while
 * any tab has current !== null, any tab is generating, or userEdited is true (§14.7).
 * Remove it otherwise.
 * Registered/removed through one effect keyed strictly on that boolean condition.
 */
export function useBeforeUnload(
  tabs: Record<OutputKind, OutputTab>,
  isGenerating: boolean,
): void {
  const shouldWarn =
    isGenerating ||
    Object.values(tabs).some(
      (tab) =>
        tab.current !== null ||
        tab.status === 'generating' ||
        tab.userEdited,
    );

  useEffect(() => {
    if (!shouldWarn) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldWarn]);
}

