import limits from '../../data/limits.json';

export interface FileValidationResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Validates and reads an uploaded text file (.md or .txt) up to maxBytes.
 * Verifies UTF-8 encoding (replacement character threshold <= 1%).
 */
export async function validateTextUpload(
  file: File,
  maxBytes: number = limits.masterInfoMaxBytes,
): Promise<FileValidationResult> {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.md') && !lowerName.endsWith('.txt')) {
    return { ok: false, error: 'Please upload a .md or .txt file.' };
  }

  if (file.size > maxBytes) {
    return { ok: false, error: `File exceeds the size limit (${maxBytes} bytes).` };
  }

  try {
    const buffer = await readFileAsArrayBuffer(file);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const decoded = decoder.decode(buffer);

    let replacementCount = 0;
    for (let i = 0; i < decoded.length; i++) {
      if (decoded.charCodeAt(i) === 0xfffd) {
        replacementCount++;
      }
    }

    if (decoded.length > 0 && replacementCount / decoded.length > 0.01) {
      return { ok: false, error: "This file doesn't look like plain text." };
    }

    return { ok: true, text: decoded };
  } catch {
    return { ok: false, error: 'Failed to read the file.' };
  }
}
