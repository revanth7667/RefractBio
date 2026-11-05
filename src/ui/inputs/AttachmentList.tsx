import { useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  FileCode,
  X,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useJob } from '../../state/JobContext';
import { isLargeFile, LARGE_FILE_WARNING } from '../../files/sizeChecks';
import { NUMBER_LOCALE, DOCX_PREVIEW_LIMIT } from '../../config';
import type { Attachment, AttachmentKind } from '../../types';

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    const kb = (bytes / 1024).toFixed(0);
    return `${kb} KB`;
  }
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `${mb} MB`;
}

function AttachmentIcon({ kind }: { kind: AttachmentKind }) {
  switch (kind) {
    case 'image':
      return <ImageIcon className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />;
    case 'pdf':
      return <FileText className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />;
    case 'docx':
      return <FileCode className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />;
    case 'text':
    default:
      return <FileText className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />;
  }
}

function StatusDisplay({ attachment }: { attachment: Attachment }) {
  if (attachment.status === 'reading') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span>Reading…</span>
      </span>
    );
  }

  if (attachment.status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Error{attachment.error ? `: ${attachment.error}` : ''}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" aria-hidden="true" />
      <span>Ready</span>
    </span>
  );
}

function DocxPreviewDisclosure({ text }: { text?: string }) {
  const [open, setOpen] = useState(false);
  const rawText = text || '';
  const previewText = rawText.slice(0, DOCX_PREVIEW_LIMIT);
  const isTruncated = rawText.length > DOCX_PREVIEW_LIMIT;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        aria-expanded={open}
      >
        {open ? 'Hide preview' : 'Preview text'}
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          <pre className="max-h-48 overflow-y-auto rounded border bg-muted/50 p-2 font-mono text-xs text-foreground whitespace-pre-wrap break-words">
            {previewText}
          </pre>
          {isTruncated && (
            <p className="text-xs text-muted-foreground">
              Showing the first {DOCX_PREVIEW_LIMIT.toLocaleString(NUMBER_LOCALE)} of {rawText.length.toLocaleString(NUMBER_LOCALE)} characters. The full text is sent to the model.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AttachmentList() {
  const { jobInputs, removeAttachment } = useJob();
  const attachments = jobInputs.attachments;

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 pt-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Attachments ({attachments.length})
      </h3>
      <ul className="space-y-2">
        {attachments.map((att) => {
          const large = isLargeFile(att.sizeBytes);
          return (
            <li
              key={att.id}
              className="flex flex-col gap-2 rounded-md border bg-card p-2.5 text-card-foreground shadow-sm"
            >
              <div className="flex items-center gap-3">
                {/* Thumbnail if image and objectUrl exists (max 64x64 px per §15.4) */}
                {att.kind === 'image' && att.objectUrl ? (
                  <img
                    src={att.objectUrl}
                    alt={att.name}
                    className="h-16 w-16 max-h-16 max-w-16 rounded object-cover border bg-muted shrink-0"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border bg-muted">
                    <AttachmentIcon kind={att.kind} />
                  </div>
                )}

                {/* Details */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {att.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({formatFileSize(att.sizeBytes)})
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusDisplay attachment={att} />

                    {large && (
                      <Badge
                        variant="outline"
                        title={LARGE_FILE_WARNING}
                        className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-[10px] px-1.5 py-0"
                      >
                        Large file
                      </Badge>
                    )}

                    {att.kind === 'docx' && att.status === 'ready' && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        Text extracted
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Remove button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAttachment(att.id)}
                  aria-label={`Remove ${att.name}`}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              {/* DOCX preview disclosure (first 2,000 chars rendered as text) */}
              {att.kind === 'docx' && att.status === 'ready' && (
                <DocxPreviewDisclosure text={att.text} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
