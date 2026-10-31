import type { OutputKind, OutputTab } from '../types';

export const TAB_ORDER: readonly OutputKind[] = [
  'RESUME',
  'COVER_LETTER',
  'LINKEDIN_MESSAGE',
  'EMAIL',
  'ANSWERS',
] as const;

/**
 * Tab visibility selector per §14.2 and A26.
 * Returns tabs where status !== 'idle' || current !== null, in the fixed order:
 * Resume, Cover Letter, LinkedIn, Email, Answers.
 */
export function visibleTabs(
  tabs: readonly OutputTab[] | Record<OutputKind, OutputTab>,
): OutputTab[] {
  const tabList: OutputTab[] = Array.isArray(tabs)
    ? [...tabs]
    : Object.values(tabs);

  const visible = tabList.filter(
    (tab) => tab.status !== 'idle' || tab.current !== null,
  );

  return TAB_ORDER.map((kind) => visible.find((t) => t.kind === kind)).filter(
    (t): t is OutputTab => t !== undefined,
  );
}
