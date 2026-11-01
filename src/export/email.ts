export interface EmailParts {
  found: boolean;
  subject: string;
  body: string;
}

/**
 * Splits an Email draft into subject and body per SPEC §16.2:
 * - A draft not starting with "Subject:" gives found = false.
 * - Subject = text after "Subject:" on the first line, trimmed.
 * - Body = text after the first blank line following the Subject line, trimmed.
 * - Handle CRLF.
 * - A Subject line with no blank line gives body = everything after that line, trimmed.
 */
export function splitEmailDraft(text: string): EmailParts {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || !lines[0].startsWith('Subject:')) {
    return {
      found: false,
      subject: '',
      body: '',
    };
  }

  const subject = lines[0].slice('Subject:'.length).trim();
  const remaining = lines.slice(1);
  const firstBlankIndex = remaining.findIndex((line) => line.trim() === '');

  let body = '';
  if (firstBlankIndex !== -1) {
    body = remaining.slice(firstBlankIndex + 1).join('\n').trim();
  } else {
    body = remaining.join('\n').trim();
  }

  return {
    found: true,
    subject,
    body,
  };
}
