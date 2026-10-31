import type { AttachmentKind } from '../types';

export const ACCEPTED_FILE_TYPES =
  '.png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.txt,.md,image/png,image/jpeg,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';

export const REJECTION_MESSAGE_SUFFIX =
  "this file type isn't supported. Use PNG, JPEG, WEBP, GIF, PDF, DOCX, TXT or MD.";

export function getRejectionMessage(fileName: string): string {
  return `${fileName}: ${REJECTION_MESSAGE_SUFFIX}`;
}

export interface ClassifySuccess {
  ok: true;
  kind: AttachmentKind;
  mime: string;
}

export interface ClassifyError {
  ok: false;
  error: string;
}

export type ClassifyResult = ClassifySuccess | ClassifyError;

const EXTENSION_MAP: Record<string, { kind: AttachmentKind; mime: string }> = {
  '.png': { kind: 'image', mime: 'image/png' },
  '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' },
  '.webp': { kind: 'image', mime: 'image/webp' },
  '.gif': { kind: 'image', mime: 'image/gif' },
  '.pdf': { kind: 'pdf', mime: 'application/pdf' },
  '.docx': {
    kind: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  '.txt': { kind: 'text', mime: 'text/plain' },
  '.md': { kind: 'text', mime: 'text/markdown' },
};

const MIME_MAP: Record<string, { kind: AttachmentKind; mime: string }> = {
  'image/png': { kind: 'image', mime: 'image/png' },
  'image/jpeg': { kind: 'image', mime: 'image/jpeg' },
  'image/webp': { kind: 'image', mime: 'image/webp' },
  'image/gif': { kind: 'image', mime: 'image/gif' },
  'application/pdf': { kind: 'pdf', mime: 'application/pdf' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    kind: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  'text/plain': { kind: 'text', mime: 'text/plain' },
  'text/markdown': { kind: 'text', mime: 'text/markdown' },
};

/**
 * Classifies a file per SPEC §15.2.
 * Checks extension first, then MIME; on conflict, extension wins.
 */
export function classifyFile(file: { name: string; type?: string }): ClassifyResult {
  const name = file.name || '';
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot >= 0 ? name.slice(lastDot).toLowerCase() : '';

  if (ext) {
    const extMatch = EXTENSION_MAP[ext];
    if (extMatch) {
      return {
        ok: true,
        kind: extMatch.kind,
        mime: extMatch.mime,
      };
    }
    // File has an extension that is unsupported. Extension wins over MIME.
    return {
      ok: false,
      error: getRejectionMessage(name),
    };
  }

  // No extension; check MIME
  const rawMime = (file.type || '').toLowerCase().trim();
  const mimeMatch = MIME_MAP[rawMime];
  if (mimeMatch) {
    return {
      ok: true,
      kind: mimeMatch.kind,
      mime: mimeMatch.mime,
    };
  }

  return {
    ok: false,
    error: getRejectionMessage(name),
  };
}
