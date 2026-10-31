import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildMarkdownFilename,
  formatDownloadTimestamp,
  downloadMarkdown,
} from '../../src/export/markdown';
import { copyToClipboard } from '../../src/export/clipboard';
import { APP_ID } from '../../src/config';

describe('Markdown and Clipboard Export (src/export/, §16.1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats timestamp as YYYYMMDD-HHmm in local time', () => {
    const fixedDate = new Date(2026, 9, 30, 14, 5); // October 30, 2026, 14:05 local
    const ts = formatDownloadTimestamp(fixedDate);
    expect(ts).toBe('20261030-1405');
  });

  it('builds filename matching {APP_ID}-{kind-lowercase-hyphenated}-{YYYYMMDD-HHmm}.md (§16.1)', () => {
    const fixedDate = new Date(2026, 9, 29, 14, 15);

    expect(buildMarkdownFilename('RESUME', fixedDate)).toBe(
      `${APP_ID}-resume-20261029-1415.md`,
    );
    expect(buildMarkdownFilename('COVER_LETTER', fixedDate)).toBe(
      `${APP_ID}-cover-letter-20261029-1415.md`,
    );
    expect(buildMarkdownFilename('LINKEDIN_MESSAGE', fixedDate)).toBe(
      `${APP_ID}-linkedin-message-20261029-1415.md`,
    );
    expect(buildMarkdownFilename('EMAIL', fixedDate)).toBe(
      `${APP_ID}-email-20261029-1415.md`,
    );
    expect(buildMarkdownFilename('ANSWERS', fixedDate)).toBe(
      `${APP_ID}-answers-20261029-1415.md`,
    );
  });

  it('downloadMarkdown creates anchor, triggers download click, and revokes object URL', () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/dummy-id');
    const revokeObjectURLMock = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });

    let clicked = false;
    let createdAnchor: HTMLAnchorElement | null = null;

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
      if (tagName === 'a') {
        createdAnchor = el as HTMLAnchorElement;
        el.click = () => {
          clicked = true;
        };
      }
      return el;
    });

    const fixedDate = new Date(2026, 9, 30, 10, 0);
    downloadMarkdown('COVER_LETTER', '# My Cover Letter', fixedDate);

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(createdAnchor).not.toBeNull();
    expect((createdAnchor as HTMLAnchorElement | null)?.download).toBe(
      `${APP_ID}-cover-letter-20261030-1000.md`,
    );
    expect(clicked).toBe(true);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/dummy-id');
  });

  it('copyToClipboard copies text when clipboard API is available and returns false when rejected', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const success = await copyToClipboard('Sample text to copy');
    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('Sample text to copy');

    // Rejection handling
    writeTextMock.mockRejectedValue(new Error('Permission denied'));
    const failure = await copyToClipboard('Failed text');
    expect(failure).toBe(false);
  });
});
