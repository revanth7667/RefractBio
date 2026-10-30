import { describe, it, expect } from 'vitest';
import { redact } from '../../src/providers/redact';

describe('Key Redaction (src/providers/redact.ts)', () => {
  const fakeKey = 'sk-test-fake-0000';

  it('redacts plain key from text', () => {
    const input = `Error: unauthorized access with key ${fakeKey} was denied`;
    const result = redact(input, fakeKey);
    expect(result).toBe('Error: unauthorized access with key [redacted] was denied');
    expect(result.includes(fakeKey)).toBe(false);
  });

  it('redacts trimmed key if key had leading or trailing whitespace', () => {
    const untrimmedKey = `  ${fakeKey}  `;
    const input = `Key: ${fakeKey}`;
    const result = redact(input, untrimmedKey);
    expect(result).toBe('Key: [redacted]');
    expect(result.includes(fakeKey)).toBe(false);
  });

  it('redacts URL-encoded key from query params or URLs', () => {
    const specialKey = 'sk-test-fake+key/123==';
    const encoded = encodeURIComponent(specialKey);
    const input = `https://generativelanguage.googleapis.com/v1beta/models?key=${encoded}`;
    const result = redact(input, specialKey);
    expect(result).toBe('https://generativelanguage.googleapis.com/v1beta/models?key=[redacted]');
    expect(result.includes(specialKey)).toBe(false);
    expect(result.includes(encoded)).toBe(false);
  });

  it('handles empty or missing parameters cleanly', () => {
    expect(redact('', fakeKey)).toBe('');
    expect(redact('some text', '')).toBe('some text');
    expect(redact('some text', undefined)).toBe('some text');
  });

  it('redacts multiple occurrences', () => {
    const input = `${fakeKey} and again ${fakeKey}`;
    expect(redact(input, fakeKey)).toBe('[redacted] and again [redacted]');
  });
});

