import { describe, expect, it } from 'vitest';
import {
  buildCanonicalSnapshotJson,
  computeSnapshotHash,
  createInputSnapshot,
  fnv1a32,
} from '../../src/prompt/snapshot';
import type { Attachment, JobInputs, ResolvedInstructions } from '../../src/types';

describe('Input snapshot and hash (§14.4)', () => {
  const dummyInstructions: ResolvedInstructions = {
    sections: {
      GLOBAL: 'Global rules',
      RESUME: 'Resume structure',
      COVER_LETTER: 'Cover letter structure',
      LINKEDIN_MESSAGE: 'LinkedIn structure',
      EMAIL: 'Email structure',
      ANSWERS: 'Answers structure',
    },
    fallbacks: [],
    warnings: [],
  };

  const sampleAttachment: Attachment = {
    id: 'att-1',
    name: 'notes.txt',
    mime: 'text/plain',
    kind: 'text',
    sizeBytes: 120,
    fingerprint: 'fp-notes-1234',
    status: 'ready',
  };

  const dummyInputs: JobInputs = {
    pastedText: 'Job description text',
    attachments: [sampleAttachment],
    customInstructions: 'Be concise',
    questions: '1. Why work here?',
    selectedOutputs: ['RESUME', 'ANSWERS'],
  };

  it('computes deterministic FNV-1a 32-bit hex hash', () => {
    const hash1 = fnv1a32('hello world');
    const hash2 = fnv1a32('hello world');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(8);
    expect(/^[0-9a-f]{8}$/.test(hash1)).toBe(true);
  });

  it('matches canonical JSON key order per §14.4', () => {
    const json = buildCanonicalSnapshotJson({
      kind: 'RESUME',
      masterInfo: 'My master info',
      instructions: dummyInstructions,
      inputs: dummyInputs,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    });

    const parsed = JSON.parse(json);
    const keys = Object.keys(parsed);
    expect(keys).toEqual([
      'kind',
      'masterInfo',
      'instructions',
      'pastedText',
      'attachments',
      'customInstructions',
      'questions',
      'provider',
      'model',
    ]);
  });

  it('excludes API key and today date from canonical JSON and hash', () => {
    const json = buildCanonicalSnapshotJson({
      kind: 'RESUME',
      masterInfo: 'Master info text',
      instructions: dummyInstructions,
      inputs: dummyInputs,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    });

    expect(json).not.toContain('apiKey');
    expect(json).not.toContain('today');
    expect(json).not.toContain('generatedAt');
  });

  it('changes hash when any input changes', () => {
    const baseParams = {
      kind: 'RESUME' as const,
      masterInfo: 'Base master info',
      instructions: dummyInstructions,
      inputs: dummyInputs,
      provider: 'anthropic' as const,
      model: 'claude-3-5-sonnet',
    };

    const baseHash = computeSnapshotHash(baseParams);

    // 1. kind change
    expect(computeSnapshotHash({ ...baseParams, kind: 'COVER_LETTER' })).not.toBe(baseHash);

    // 2. masterInfo change
    expect(computeSnapshotHash({ ...baseParams, masterInfo: 'Different master info' })).not.toBe(
      baseHash,
    );

    // 3. instructions change
    const alteredInstructions: ResolvedInstructions = {
      ...dummyInstructions,
      sections: { ...dummyInstructions.sections, GLOBAL: 'Different global' },
    };
    expect(computeSnapshotHash({ ...baseParams, instructions: alteredInstructions })).not.toBe(
      baseHash,
    );

    // 4. pastedText change
    expect(
      computeSnapshotHash({
        ...baseParams,
        inputs: { ...dummyInputs, pastedText: 'Different job text' },
      }),
    ).not.toBe(baseHash);

    // 5. attachments change
    const alteredAttachment: Attachment = {
      ...sampleAttachment,
      fingerprint: 'fp-different-fingerprint',
    };
    expect(
      computeSnapshotHash({
        ...baseParams,
        inputs: { ...dummyInputs, attachments: [alteredAttachment] },
      }),
    ).not.toBe(baseHash);

    // 6. customInstructions change
    expect(
      computeSnapshotHash({
        ...baseParams,
        inputs: { ...dummyInputs, customInstructions: 'Different custom instructions' },
      }),
    ).not.toBe(baseHash);

    // 7. provider change
    expect(computeSnapshotHash({ ...baseParams, provider: 'gemini' })).not.toBe(baseHash);

    // 8. model change
    expect(computeSnapshotHash({ ...baseParams, model: 'claude-3-opus' })).not.toBe(baseHash);
  });

  it('editing questions changes ONLY the ANSWERS hash and never other output tabs', () => {
    const inputsQ1 = { ...dummyInputs, questions: 'Original question' };
    const inputsQ2 = { ...dummyInputs, questions: 'Edited question' };

    // RESUME hash is unchanged
    const resumeHash1 = computeSnapshotHash({
      kind: 'RESUME',
      masterInfo: 'Info',
      instructions: dummyInstructions,
      inputs: inputsQ1,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    });
    const resumeHash2 = computeSnapshotHash({
      kind: 'RESUME',
      masterInfo: 'Info',
      instructions: dummyInstructions,
      inputs: inputsQ2,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    });
    expect(resumeHash1).toBe(resumeHash2);

    // COVER_LETTER hash is unchanged
    const coverHash1 = computeSnapshotHash({
      kind: 'COVER_LETTER',
      masterInfo: 'Info',
      instructions: dummyInstructions,
      inputs: inputsQ1,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    });
    const coverHash2 = computeSnapshotHash({
      kind: 'COVER_LETTER',
      masterInfo: 'Info',
      instructions: dummyInstructions,
      inputs: inputsQ2,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    });
    expect(coverHash1).toBe(coverHash2);

    // ANSWERS hash DOES change
    const answersHash1 = computeSnapshotHash({
      kind: 'ANSWERS',
      masterInfo: 'Info',
      instructions: dummyInstructions,
      inputs: inputsQ1,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    });
    const answersHash2 = computeSnapshotHash({
      kind: 'ANSWERS',
      masterInfo: 'Info',
      instructions: dummyInstructions,
      inputs: inputsQ2,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    });
    expect(answersHash1).not.toBe(answersHash2);
  });

  it('createInputSnapshot creates complete snapshot with caller-provided metadata', () => {
    const snapshot = createInputSnapshot({
      kind: 'RESUME',
      masterInfo: 'Info',
      instructions: dummyInstructions,
      inputs: dummyInputs,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      generatedAt: '2026-10-30T12:00:00Z',
    });

    expect(snapshot.hash).toHaveLength(8);
    expect(snapshot.provider).toBe('anthropic');
    expect(snapshot.model).toBe('claude-3-5-sonnet');
    expect(snapshot.generatedAt).toBe('2026-10-30T12:00:00Z');
    expect(snapshot.attachmentNames).toEqual(['notes.txt']);
  });
});
