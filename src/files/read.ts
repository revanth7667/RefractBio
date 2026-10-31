import { fnv1a32 } from '../prompt/snapshot';
import type { AttachmentKind } from '../types';
import { extractDocxText } from './docx';

/**
 * Reads a Blob as ArrayBuffer in any environment (browser or jsdom).
 */
export function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file as ArrayBuffer'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Reads a Blob as text in any environment (browser or jsdom).
 */
export function readBlobAsText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file as text'));
    reader.readAsText(blob);
  });
}

/**
 * Computes a file fingerprint per SPEC §8:
 * name + size + lastModified + hash of the first 64 KB.
 */
export async function computeFileFingerprint(file: {
  name: string;
  size: number;
  lastModified?: number;
  slice: (start?: number, end?: number) => Blob;
}): Promise<string> {
  const sliceBlob = file.slice(0, 64 * 1024);
  const buffer = await readBlobAsArrayBuffer(sliceBlob);
  const first64kHash = fnv1a32(new Uint8Array(buffer));
  const lastModified = file.lastModified ?? 0;
  return `${file.name}:${file.size}:${lastModified}:${first64kHash}`;
}

/**
 * Reads binary file as base64 without the data: prefix.
 */
export function readBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Reads text file with UTF-8 replacement character check per §15.2:
 * Replacement characters > 1% -> error "This file doesn't look like plain text."
 */
export async function readTextFile(blob: Blob): Promise<string> {
  const text = await readBlobAsText(blob);
  let replacementCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0xfffd) {
      replacementCount++;
    }
  }
  if (text.length > 0 && replacementCount / text.length > 0.01) {
    throw new Error("This file doesn't look like plain text.");
  }
  return text;
}

export interface ReadAttachmentContentResult {
  base64?: string;
  text?: string;
}

/**
 * Reads the content of an attachment according to its classified kind.
 */
export async function readAttachmentContent(
  file: Blob,
  kind: AttachmentKind,
): Promise<ReadAttachmentContentResult> {
  if (kind === 'image' || kind === 'pdf') {
    const base64 = await readBlobAsBase64(file);
    return { base64 };
  }

  if (kind === 'docx') {
    const text = await extractDocxText(file);
    return { text };
  }

  if (kind === 'text') {
    const text = await readTextFile(file);
    return { text };
  }

  throw new Error(`Unsupported attachment kind: ${kind}`);
}
