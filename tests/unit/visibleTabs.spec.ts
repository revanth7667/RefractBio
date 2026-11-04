import { describe, it, expect } from 'vitest';
import { visibleTabs } from '../../src/generation/visibleTabs';
import type { OutputTab, OutputVersion } from '../../src/types';

describe('visibleTabs selector (A26, §14.2)', () => {
  const dummyVersion: OutputVersion = {
    document: 'Draft content',
    gaps: '',
    gapsMissing: false,
    truncated: false,
    stopped: false,
    snapshot: {
      hash: 'h123',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      generatedAt: '2026-10-30T12:00:00Z',
      attachmentNames: [],
    },
  };

  const createTab = (
    kind: OutputTab['kind'],
    status: OutputTab['status'] = 'idle',
    hasCurrent = false,
  ): OutputTab => ({
    kind,
    status,
    current: hasCurrent ? dummyVersion : null,
    previous: null,
    editorText: hasCurrent ? dummyVersion.document : '',
    userEdited: false,
    streamingText: '',
    error: null,
  });

  it('returns an empty array when all tabs are idle with no versions (A26)', () => {
    const tabs: OutputTab[] = [
      createTab('RESUME', 'idle', false),
      createTab('COVER_LETTER', 'idle', false),
      createTab('LINKEDIN_MESSAGE', 'idle', false),
      createTab('EMAIL', 'idle', false),
      createTab('ANSWERS', 'idle', false),
    ];

    expect(visibleTabs(tabs)).toEqual([]);
  });

  it('includes tabs that are generating, done, or error even without current version', () => {
    const tabs: OutputTab[] = [
      createTab('RESUME', 'generating', false),
      createTab('COVER_LETTER', 'error', false),
      createTab('LINKEDIN_MESSAGE', 'idle', false),
    ];

    const visible = visibleTabs(tabs);
    expect(visible.map((t) => t.kind)).toEqual(['RESUME', 'COVER_LETTER']);
  });

  it('includes tabs that are idle but have a current version', () => {
    const tabs: OutputTab[] = [
      createTab('RESUME', 'idle', true),
      createTab('COVER_LETTER', 'idle', false),
    ];

    const visible = visibleTabs(tabs);
    expect(visible.map((t) => t.kind)).toEqual(['RESUME']);
  });

  it('orders visible tabs in the fixed order: Resume, Cover Letter, LinkedIn, Email, Answers regardless of input order', () => {
    const scrambledTabs: OutputTab[] = [
      createTab('ANSWERS', 'done', true),
      createTab('EMAIL', 'generating', false),
      createTab('COVER_LETTER', 'done', true),
      createTab('RESUME', 'done', true),
      createTab('LINKEDIN_MESSAGE', 'error', false),
    ];

    const visible = visibleTabs(scrambledTabs);
    expect(visible.map((t) => t.kind)).toEqual([
      'RESUME',
      'COVER_LETTER',
      'LINKEDIN_MESSAGE',
      'EMAIL',
      'ANSWERS',
    ]);
  });

  it('accepts Record<OutputKind, OutputTab> as input', () => {
    const recordTabs: Record<OutputTab['kind'], OutputTab> = {
      RESUME: createTab('RESUME', 'idle', false),
      COVER_LETTER: createTab('COVER_LETTER', 'done', true),
      LINKEDIN_MESSAGE: createTab('LINKEDIN_MESSAGE', 'idle', false),
      EMAIL: createTab('EMAIL', 'generating', false),
      ANSWERS: createTab('ANSWERS', 'idle', false),
    };

    const visible = visibleTabs(recordTabs);
    expect(visible.map((t) => t.kind)).toEqual(['COVER_LETTER', 'EMAIL']);
  });
});
