import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeFileFingerprint,
  readTextFile,
  readAttachmentContent,
} from '../../src/files/read';
import { extractDocxText } from '../../src/files/docx';

describe('File Reading (§15.2, Task 3)', () => {
  it('reads image file as base64 without data: prefix', async () => {
    const pngPath = path.resolve(__dirname, '../fixtures/jobs/posting.png');
    const pngBuf = fs.readFileSync(pngPath);
    const file = new File([pngBuf], 'posting.png', { type: 'image/png' });

    const res = await readAttachmentContent(file, 'image');
    expect(res.base64).toBeDefined();
    expect(res.base64?.startsWith('data:')).toBe(false);
    expect(res.base64).toBe(pngBuf.toString('base64'));
  });

  it('reads PDF file as base64 without data: prefix', async () => {
    const pdfPath = path.resolve(__dirname, '../fixtures/jobs/posting.pdf');
    const pdfBuf = fs.readFileSync(pdfPath);
    const file = new File([pdfBuf], 'posting.pdf', { type: 'application/pdf' });

    const res = await readAttachmentContent(file, 'pdf');
    expect(res.base64).toBeDefined();
    expect(res.base64?.startsWith('data:')).toBe(false);
    expect(res.base64).toBe(pdfBuf.toString('base64'));
  });

  it('reads txt and md files using text()', async () => {
    const txtFile = new File(['Hello plain text world'], 'notes.txt', { type: 'text/plain' });
    const txtRes = await readAttachmentContent(txtFile, 'text');
    expect(txtRes.text).toBe('Hello plain text world');

    const mdFile = new File(['# Title\nSome **markdown**'], 'notes.md', { type: 'text/markdown' });
    const mdRes = await readAttachmentContent(mdFile, 'text');
    expect(mdRes.text).toBe('# Title\nSome **markdown**');
  });

  it('fails with exact error when UTF-8 replacement characters exceed 1%', async () => {
    // 98 valid chars + 2 replacement chars (2 / 100 = 2% > 1%)
    const badText = 'a'.repeat(98) + '\uFFFD\uFFFD';
    const badFile = new Blob([badText], { type: 'text/plain' });

    await expect(readTextFile(badFile)).rejects.toThrow(
      "This file doesn't look like plain text.",
    );
  });

  it('computes fingerprint using name + size + lastModified + first 64 KB FNV-1a hash', async () => {
    const content = 'a'.repeat(70000); // > 64 KB
    const file = new File([content], 'large.txt', {
      type: 'text/plain',
      lastModified: 1700000000000,
    });

    const fp1 = await computeFileFingerprint(file);
    expect(fp1).toContain('large.txt:70000:1700000000000:');

    // Modifying lastModified changes fingerprint
    const file2 = new File([content], 'large.txt', {
      type: 'text/plain',
      lastModified: 1700000000001,
    });
    const fp2 = await computeFileFingerprint(file2);
    expect(fp2).not.toBe(fp1);

    // Modifying first 64 KB changes fingerprint
    const modifiedContent = 'b' + 'a'.repeat(69999);
    const file3 = new File([modifiedContent], 'large.txt', {
      type: 'text/plain',
      lastModified: 1700000000000,
    });
    const fp3 = await computeFileFingerprint(file3);
    expect(fp3).not.toBe(fp1);
  });

  it('extracts DOCX text via the REAL mammoth on notes.docx once (V15)', async () => {
    const docxPath = path.resolve(__dirname, '../fixtures/jobs/notes.docx');
    const docxBuf = fs.readFileSync(docxPath);
    const docxBlob = new Blob([docxBuf], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const extracted = await extractDocxText(docxBlob);
    expect(extracted).toContain('Project notes: Led migration of reporting database to Postgres.');
    expect(extracted).toContain('Built automated data quality pipelines with Python.');
  });
});
