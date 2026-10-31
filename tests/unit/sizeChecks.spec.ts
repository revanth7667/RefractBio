import { describe, it, expect } from 'vitest';
import limits from '../../src/data/limits.json';
import {
  checkPerFileMax,
  isLargeFile,
  checkMaxAttachments,
  checkTotalAttachmentWarning,
  checkProviderRequestSize,
} from '../../src/files/sizeChecks';
import { classifyFile } from '../../src/files/classify';
import type { Attachment } from '../../src/types';

describe('Size Limits and Checks (§15.3, Task 5)', () => {
  it('refuses a generated 25 MB test file with exact 20 MB message', () => {
    // Generate virtual 25 MB file in test (25 * 1024 * 1024 bytes) without committing it
    const file25Mb = {
      name: 'large-dataset.pdf',
      size: 25 * 1024 * 1024,
    };

    const res = checkPerFileMax(file25Mb);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("large-dataset.pdf is over 20 MB and can't be attached.");
  });

  it('accepts files within perFileMaxBytes (e.g. 19 MB)', () => {
    const file19Mb = {
      name: 'reasonable.pdf',
      size: 19 * 1024 * 1024,
    };
    expect(checkPerFileMax(file19Mb).ok).toBe(true);
  });

  it('refuses .heic with the §15.2 message', () => {
    const res = classifyFile({ name: 'photo.heic' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe(
        "photo.heic: this file type isn't supported. Use PNG, JPEG, WEBP, GIF, PDF, DOCX, TXT or MD.",
      );
    }
  });

  it('does not add the 11th file and returns message', () => {
    // When 10 attachments already exist, 1 incoming file cannot be added
    const res1 = checkMaxAttachments(10, 1);
    expect(res1.allowedCount).toBe(0);
    expect(res1.message).toBe('Only up to 10 files can be attached. Extra files were not added.');

    // When 8 attachments exist, 3 incoming files -> 2 allowed, 1 extra dropped with message
    const res2 = checkMaxAttachments(8, 3);
    expect(res2.allowedCount).toBe(2);
    expect(res2.message).toBe('Only up to 10 files can be attached. Extra files were not added.');

    // When 5 attachments exist, 5 incoming -> all allowed, no message
    const res3 = checkMaxAttachments(5, 5);
    expect(res3.allowedCount).toBe(5);
    expect(res3.message).toBeUndefined();
  });

  it('flags Large file badge when file size > perFileWarnBytes (5 MB)', () => {
    expect(isLargeFile(5 * 1024 * 1024)).toBe(false);
    expect(isLargeFile(limits.perFileWarnBytes)).toBe(false);
    expect(isLargeFile(limits.perFileWarnBytes + 1)).toBe(true);
    expect(isLargeFile(6 * 1024 * 1024)).toBe(true);
  });

  it('shows total notice when sum of base64 sizes > totalWarnBytes (15 MB)', () => {
    // Total under 15 MB
    const smallAttachments: Attachment[] = [
      {
        id: '1',
        name: 'a.png',
        mime: 'image/png',
        kind: 'image',
        sizeBytes: 2 * 1024 * 1024,
        fingerprint: 'fp1',
        status: 'ready',
        base64: 'x'.repeat(2 * 1024 * 1024),
      },
    ];
    expect(checkTotalAttachmentWarning(smallAttachments)).toBeNull();

    // Total over 15 MB (16 MB base64)
    const largeAttachments: Attachment[] = [
      {
        id: '1',
        name: 'a.png',
        mime: 'image/png',
        kind: 'image',
        sizeBytes: 16 * 1024 * 1024,
        fingerprint: 'fp1',
        status: 'ready',
        base64: 'x'.repeat(16 * 1024 * 1024),
      },
    ];
    const notice = checkTotalAttachmentWarning(largeAttachments);
    expect(notice).toBe('Attachments total 16 MB. Some providers reject large requests.');
  });

  it('blocks request when estimated request bytes exceed non-null providerMaxRequestBytes', () => {
    // With null limit (default), returns null
    expect(checkProviderRequestSize('anthropic', 100000000, null)).toBeNull();
    expect(checkProviderRequestSize('gemini', 100000000, null)).toBeNull();

    // With non-null limit (e.g. 10 MB = 10485760 bytes)
    const limit10Mb = 10 * 1024 * 1024;
    const underLimit = checkProviderRequestSize('anthropic', 5 * 1024 * 1024, limit10Mb);
    expect(underLimit).toBeNull();

    const overLimitAnthropic = checkProviderRequestSize('anthropic', 15 * 1024 * 1024, limit10Mb);
    expect(overLimitAnthropic).toEqual({
      message: 'Too large for Anthropic (limit about 10 MB). Remove some files.',
    });

    const overLimitGemini = checkProviderRequestSize('gemini', 15 * 1024 * 1024, limit10Mb);
    expect(overLimitGemini).toEqual({
      message: 'Too large for Gemini (limit about 10 MB). Remove some files.',
    });
  });
});
