import { readBlobAsArrayBuffer } from './read';

/**
 * Extracts raw text from a DOCX file using mammoth via dynamic import per SPEC §15.2 (V15).
 * Loaded dynamically only when a DOCX is added to avoid bloating the main bundle.
 * Mammoth warnings are ignored.
 */
export async function extractDocxText(file: Blob): Promise<string> {
  const arrayBuffer = await readBlobAsArrayBuffer(file);
  const mammothModule = await import('mammoth');
  const extractFn =
    mammothModule.extractRawText ||
    mammothModule.default?.extractRawText;

  if (typeof extractFn !== 'function') {
    throw new Error('Could not load extractRawText from mammoth');
  }

  const result = await extractFn({ arrayBuffer });
  return result.value || '';
}
