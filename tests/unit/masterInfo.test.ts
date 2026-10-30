import { describe, it, expect } from 'vitest';
import { TEMPLATE_MARKER_TOKEN } from '../../src/config';
import limits from '../../src/data/limits.json';
import {
  hasTemplateMarker,
  stripHtmlComments,
  resolveEffective,
  lengthNote,
} from '../../src/masterInfo/masterInfo';
import sampleRaw from '../../src/data/master-info.sample.md?raw';
import sampleFixtureRaw from '../fixtures/master/sample-unedited.md?raw';
import editedRaw from '../fixtures/master/edited.md?raw';

describe('Master Info helpers (§10.3, §19.3)', () => {
  it('asserts sample and unedited fixture are identical so they cannot drift', () => {
    expect(sampleRaw).toBe(sampleFixtureRaw);
  });

  it('detects template marker in sample and not in edited fixture', () => {
    expect(hasTemplateMarker(sampleRaw)).toBe(true);
    expect(hasTemplateMarker(editedRaw)).toBe(false);
  });

  it('contains the marker token exactly once, on line 1 only, and not in guidance comment', () => {
    // Count occurrences of token
    const tokenRegex = new RegExp(TEMPLATE_MARKER_TOKEN, 'g');
    const matches = sampleRaw.match(tokenRegex);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(1);

    const lines = sampleRaw.split('\n');
    expect(lines[0].includes(TEMPLATE_MARKER_TOKEN)).toBe(true);

    // Extract guidance comments (comments after line 1)
    const rest = lines.slice(1).join('\n');
    const comments = rest.match(/<!--[\s\S]*?-->/g) || [];
    expect(comments.length).toBeGreaterThan(0);
    for (const comment of comments) {
      expect(comment.includes(TEMPLATE_MARKER_TOKEN)).toBe(false);
    }
  });

  it('unblocks generation when line 1 is deleted', () => {
    const lines = sampleRaw.split('\n');
    const withoutLine1 = lines.slice(1).join('\n');
    expect(hasTemplateMarker(withoutLine1)).toBe(false);
  });

  describe('stripHtmlComments', () => {
    it('strips single-line comments', () => {
      const input = 'Before <!-- single line comment --> After';
      expect(stripHtmlComments(input)).toBe('Before  After');
    });

    it('strips multi-line comments', () => {
      const input = 'Start\n<!--\nLine 1\nLine 2\n-->\nEnd';
      expect(stripHtmlComments(input)).toBe('Start\n\nEnd');
    });

    it('collapses runs of 3 or more newlines to 2 and trims', () => {
      const input = '\n\n\nHello\n\n\n\n\nWorld\n\n\n';
      expect(stripHtmlComments(input)).toBe('Hello\n\nWorld');
    });

    it('cleans comments and collapses whitespace correctly', () => {
      const input = `
# Title

<!--
Comment block
-->


## Section 1
Content
`;
      const cleaned = stripHtmlComments(input);
      expect(cleaned).toBe('# Title\n\n## Section 1\nContent');
    });
  });

  describe('resolveEffective', () => {
    it('returns bundled sample with source bundled-sample when stored is null', () => {
      const res = resolveEffective(null, sampleRaw);
      expect(res).toEqual({
        text: sampleRaw,
        source: 'bundled-sample',
      });
    });

    it('returns stored text with source stored when stored is present', () => {
      const stored = {
        text: 'Custom Master Info content',
        updatedAt: '2026-10-29T00:00:00.000Z',
      };
      const res = resolveEffective(stored, sampleRaw);
      expect(res).toEqual({
        text: 'Custom Master Info content',
        source: 'stored',
      });
    });

    it('returns stored text even when empty or whitespace', () => {
      const emptyStored = {
        text: '',
        updatedAt: '2026-10-29T00:00:00.000Z',
      };
      expect(resolveEffective(emptyStored, sampleRaw)).toEqual({
        text: '',
        source: 'stored',
      });

      const whitespaceStored = {
        text: '   \n\t  \n',
        updatedAt: '2026-10-29T00:00:00.000Z',
      };
      expect(resolveEffective(whitespaceStored, sampleRaw)).toEqual({
        text: '   \n\t  \n',
        source: 'stored',
      });
    });
  });

  describe('lengthNote', () => {
    const limit = limits.masterInfoWarnChars;

    it('returns null when text is below or exactly at the limit', () => {
      const below = 'a'.repeat(limit - 1);
      expect(lengthNote(below)).toBeNull();

      const exact = 'a'.repeat(limit);
      expect(lengthNote(exact)).toBeNull();
    });

    it('returns { chars } when text is one character above the limit', () => {
      const above = 'a'.repeat(limit + 1);
      expect(lengthNote(above)).toEqual({ chars: limit + 1 });
    });

    it('uses custom limit when supplied', () => {
      expect(lengthNote('12345', 5)).toBeNull();
      expect(lengthNote('123456', 5)).toEqual({ chars: 6 });
    });
  });

  describe('property-style random string fuzz test', () => {
    it('no helper throws on 200 random strings', () => {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 \n\r\t<!-->_-\uFFFD\u0000🔥\u200B';
      for (let i = 0; i < 200; i++) {
        const len = (i * 37) % 500;
        let str = '';
        for (let j = 0; j < len; j++) {
          const idx = Math.floor(Math.random() * characters.length);
          str += characters[idx];
        }

        expect(() => hasTemplateMarker(str)).not.toThrow();
        expect(() => stripHtmlComments(str)).not.toThrow();
        expect(() =>
          resolveEffective(
            i % 2 === 0 ? null : { text: str, updatedAt: new Date().toISOString() },
            sampleRaw,
          ),
        ).not.toThrow();
        expect(() => lengthNote(str)).not.toThrow();
      }
    });
  });
});

