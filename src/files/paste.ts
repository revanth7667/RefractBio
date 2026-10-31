const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Extracts the highest `n` from existing `pasted-image-{n}.{ext}` filenames.
 */
export function getNextPastedImageNumber(existingNames: readonly string[]): number {
  let maxN = 0;
  const pattern = /^pasted-image-(\d+)\.[a-z0-9]+$/i;
  for (const name of existingNames) {
    const match = name.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxN) {
        maxN = num;
      }
    }
  }
  return maxN + 1;
}

/**
 * Extracts image files from clipboardData per SPEC §15.1 (V19).
 * For each clipboardData.items entry with kind === 'file' and an accepted image type,
 * creates a File named pasted-image-{n}.{ext}.
 * Spec-silent decision on picking n and ext:
 * - n is determined by finding the max n among existing attachments matching pasted-image-(\d+).{ext} + 1.
 * - ext is mapped from item.type (image/png -> png, image/jpeg -> jpg, image/webp -> webp, image/gif -> gif).
 */
export function extractPastedImageFiles(
  clipboardData: DataTransfer | null,
  existingNames: readonly string[],
): File[] {
  if (!clipboardData || !clipboardData.items) {
    return [];
  }

  const result: File[] = [];
  let nextN = getNextPastedImageNumber(existingNames);

  for (let i = 0; i < clipboardData.items.length; i++) {
    const item = clipboardData.items[i];
    if (item.kind === 'file') {
      const mime = (item.type || '').toLowerCase();
      const ext = MIME_TO_EXT[mime];
      if (ext) {
        const rawFile = item.getAsFile();
        if (rawFile) {
          const fileName = `pasted-image-${nextN}.${ext}`;
          nextN++;
          const newFile = new File([rawFile], fileName, {
            type: mime,
            lastModified: rawFile.lastModified || Date.now(),
          });
          result.push(newFile);
        }
      }
    }
  }

  return result;
}
