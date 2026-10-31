import { describe, it, expect } from 'vitest';
import {
  ACCEPTED_FILE_TYPES,
  classifyFile,
  getRejectionMessage,
} from '../../src/files/classify';

describe('classifyFile (§15.1, §15.2)', () => {
  it('accepts exact string from §15.1', () => {
    expect(ACCEPTED_FILE_TYPES).toBe(
      '.png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.txt,.md,image/png,image/jpeg,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown',
    );
  });

  describe('Every row of §15.2', () => {
    it('classifies .png as image', () => {
      const res = classifyFile({ name: 'photo.png', type: 'image/png' });
      expect(res).toEqual({ ok: true, kind: 'image', mime: 'image/png' });
    });

    it('classifies .jpg and .jpeg as image', () => {
      expect(classifyFile({ name: 'photo.jpg' })).toEqual({
        ok: true,
        kind: 'image',
        mime: 'image/jpeg',
      });
      expect(classifyFile({ name: 'photo.JPEG' })).toEqual({
        ok: true,
        kind: 'image',
        mime: 'image/jpeg',
      });
    });

    it('classifies .webp as image', () => {
      expect(classifyFile({ name: 'pic.webp' })).toEqual({
        ok: true,
        kind: 'image',
        mime: 'image/webp',
      });
    });

    it('classifies .gif as image', () => {
      expect(classifyFile({ name: 'anim.gif' })).toEqual({
        ok: true,
        kind: 'image',
        mime: 'image/gif',
      });
    });

    it('classifies .pdf as pdf', () => {
      expect(classifyFile({ name: 'doc.pdf' })).toEqual({
        ok: true,
        kind: 'pdf',
        mime: 'application/pdf',
      });
    });

    it('classifies .docx as docx', () => {
      expect(classifyFile({ name: 'resume.docx' })).toEqual({
        ok: true,
        kind: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    });

    it('classifies .txt and .md as text', () => {
      expect(classifyFile({ name: 'notes.txt' })).toEqual({
        ok: true,
        kind: 'text',
        mime: 'text/plain',
      });
      expect(classifyFile({ name: 'README.md' })).toEqual({
        ok: true,
        kind: 'text',
        mime: 'text/markdown',
      });
    });
  });

  describe('Extension-vs-MIME conflict (extension wins)', () => {
    it('extension wins when supported extension has wrong MIME', () => {
      const res = classifyFile({ name: 'document.pdf', type: 'image/png' });
      expect(res).toEqual({ ok: true, kind: 'pdf', mime: 'application/pdf' });
    });

    it('extension wins when unsupported extension has supported MIME', () => {
      const res = classifyFile({ name: 'photo.heic', type: 'image/jpeg' });
      expect(res).toEqual({
        ok: false,
        error: getRejectionMessage('photo.heic'),
      });
    });

    it('classifies by MIME when file has no extension', () => {
      const res = classifyFile({ name: 'pasted-image', type: 'image/png' });
      expect(res).toEqual({ ok: true, kind: 'image', mime: 'image/png' });
    });
  });

  describe('Rejected types (.doc, .heic, .rtf, others)', () => {
    it('rejects .doc with exact message', () => {
      const res = classifyFile({ name: 'old.doc' });
      expect(res).toEqual({
        ok: false,
        error: "old.doc: this file type isn't supported. Use PNG, JPEG, WEBP, GIF, PDF, DOCX, TXT or MD.",
      });
    });

    it('rejects .heic with exact message', () => {
      const res = classifyFile({ name: 'camera.HEIC' });
      expect(res).toEqual({
        ok: false,
        error: "camera.HEIC: this file type isn't supported. Use PNG, JPEG, WEBP, GIF, PDF, DOCX, TXT or MD.",
      });
    });

    it('rejects .rtf with exact message', () => {
      const res = classifyFile({ name: 'styled.rtf' });
      expect(res).toEqual({
        ok: false,
        error: "styled.rtf: this file type isn't supported. Use PNG, JPEG, WEBP, GIF, PDF, DOCX, TXT or MD.",
      });
    });
  });
});
