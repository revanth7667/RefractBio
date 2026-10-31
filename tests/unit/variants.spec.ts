import { describe, it, expect } from 'vitest';
import { splitLinkedInVariants, hasEmailSubject } from '../../src/generation/variants';

describe('LinkedIn variants and badges (src/generation/variants.ts, §12.7, A29)', () => {
  it('splits connection note and direct message correctly with exact labels', () => {
    const text = [
      'Variant 1: Connection request note',
      'Hi Jordan, saw your data science work.',
      '',
      'Variant 2: Direct message',
      'Hi Jordan, I noticed your opening for a Senior Analyst. Here is my background.',
    ].join('\n');

    const result = splitLinkedInVariants(text);
    expect(result.found).toBe(true);
    expect(result.connectionNote).toBe('Hi Jordan, saw your data science work.');
    expect(result.directMessage).toBe(
      'Hi Jordan, I noticed your opening for a Senior Analyst. Here is my background.',
    );
  });

  it('matches labels case-insensitively and with optional surrounding bold **', () => {
    const text = [
      '**variant 1: connection request note**',
      'Connection note text.',
      '',
      '**VARIANT 2: DIRECT MESSAGE**',
      'Direct message text.',
    ].join('\n');

    const result = splitLinkedInVariants(text);
    expect(result.found).toBe(true);
    expect(result.connectionNote).toBe('Connection note text.');
    expect(result.directMessage).toBe('Direct message text.');
  });

  it('returns found: false when label 1 is missing', () => {
    const text = [
      'Variant 2: Direct message',
      'Only direct message present.',
    ].join('\n');

    const result = splitLinkedInVariants(text);
    expect(result.found).toBe(false);
    expect(result.connectionNote).toBe('');
    expect(result.directMessage).toBe('');
  });

  it('returns found: false when label 2 is missing', () => {
    const text = [
      'Variant 1: Connection request note',
      'Only connection note present.',
    ].join('\n');

    const result = splitLinkedInVariants(text);
    expect(result.found).toBe(false);
  });

  it('returns found: false when label 2 appears before label 1', () => {
    const text = [
      'Variant 2: Direct message',
      'DM text',
      'Variant 1: Connection request note',
      'Connection text',
    ].join('\n');

    const result = splitLinkedInVariants(text);
    expect(result.found).toBe(false);
  });

  it('hasEmailSubject detects presence and absence of Subject: line', () => {
    expect(hasEmailSubject('Subject: Senior Analyst Application')).toBe(true);
    expect(hasEmailSubject('  \n  Subject: Senior Analyst Application')).toBe(true);
    expect(hasEmailSubject('Dear Hiring Manager,\nI am writing...')).toBe(false);
    expect(hasEmailSubject('')).toBe(false);
  });
});
