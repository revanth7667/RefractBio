import { describe, it, expect } from 'vitest';
import { splitEmailDraft } from '../../src/export/email';

describe('splitEmailDraft (§16.2)', () => {
  it('returns found = false when draft does not start with Subject:', () => {
    const text = 'Hello, this is an email without a subject.\nBest,\nJordan';
    const result = splitEmailDraft(text);
    expect(result).toEqual({
      found: false,
      subject: '',
      body: '',
    });
  });

  it('returns found = false when text is empty', () => {
    const result = splitEmailDraft('');
    expect(result).toEqual({
      found: false,
      subject: '',
      body: '',
    });
  });

  it('returns found = false when Subject: is lowercase or preceded by spaces or blank line', () => {
    expect(splitEmailDraft('subject: Hello').found).toBe(false);
    expect(splitEmailDraft('  Subject: Hello').found).toBe(false);
    expect(splitEmailDraft('\nSubject: Hello').found).toBe(false);
  });

  it('extracts subject and body separated by a blank line (LF)', () => {
    const text = 'Subject: Logistics Data Analyst Application\n\nDear Hiring Team,\n\nI am writing to apply.\n\nSincerely,\nJordan';
    const result = splitEmailDraft(text);
    expect(result.found).toBe(true);
    expect(result.subject).toBe('Logistics Data Analyst Application');
    expect(result.body).toBe('Dear Hiring Team,\n\nI am writing to apply.\n\nSincerely,\nJordan');
  });

  it('handles CRLF line endings', () => {
    const text = 'Subject: Freight Data Analyst\r\n\r\nHi Jordan,\r\n\r\nHere is the body text.\r\n\r\nBest regards.';
    const result = splitEmailDraft(text);
    expect(result.found).toBe(true);
    expect(result.subject).toBe('Freight Data Analyst');
    expect(result.body).toBe('Hi Jordan,\n\nHere is the body text.\n\nBest regards.');
  });

  it('gives body = everything after the Subject line when there is no blank line', () => {
    const text = 'Subject: Quick question\nLine directly below subject without blank line.\nAnother line.';
    const result = splitEmailDraft(text);
    expect(result.found).toBe(true);
    expect(result.subject).toBe('Quick question');
    expect(result.body).toBe('Line directly below subject without blank line.\nAnother line.');
  });

  it('handles Subject line only with no following text', () => {
    const text = 'Subject: Announcement only';
    const result = splitEmailDraft(text);
    expect(result.found).toBe(true);
    expect(result.subject).toBe('Announcement only');
    expect(result.body).toBe('');
  });

  it('trims leading and trailing whitespace from both subject and body', () => {
    const text = 'Subject:    Spaced out subject    \n\n   \n   Body with leading spaces\nand lines.   \n\n';
    const result = splitEmailDraft(text);
    expect(result.found).toBe(true);
    expect(result.subject).toBe('Spaced out subject');
    expect(result.body).toBe('Body with leading spaces\nand lines.');
  });
});
