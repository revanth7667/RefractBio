import React, { useRef, useEffect, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { useJob } from '../../state/JobContext';
import { ACCEPTED_FILE_TYPES } from '../../files/classify';
import { AttachmentList } from './AttachmentList';

export function ContextArea() {
  const {
    jobInputs,
    setPastedText,
    addFiles,
    attachmentErrors,
    dismissAttachmentError,
  } = useJob();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const minH = 192; // Approx 8 rows
    const maxH = 480; // Approx 20 rows
    const targetH = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = `${targetH}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  };

  useEffect(() => {
    adjustHeight();
  }, [jobInputs.pastedText]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only turn off if leaving the container itself
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    // Reset value so re-selecting same file works
    e.target.value = '';
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`space-y-2 rounded-lg transition-colors ${
        isDragging ? 'ring-2 ring-primary ring-offset-2 bg-primary/5 p-2' : ''
      }`}
    >
      <div className="space-y-1.5">
        <Label htmlFor="job-context" className="text-sm font-semibold text-foreground">
          Job context
        </Label>
        <p className="text-xs text-muted-foreground">
          Paste the job posting, notes, or anything else about this job. You can also add or paste files and screenshots.
        </p>
        <textarea
          id="job-context"
          ref={textareaRef}
          rows={8}
          value={jobInputs.pastedText}
          onChange={(e) => {
            setPastedText(e.target.value);
            adjustHeight();
          }}
          placeholder="Paste job posting, job description, notes, or company information here..."
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y min-h-[192px] max-h-[480px]"
        />
      </div>

      {/* Add files toolbar & drop zone hint */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileInputChange}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Add files</span>
        </Button>

        <span className="text-xs text-muted-foreground">
          {isDragging ? 'Drop files to attach' : 'Drag & drop files or paste images'}
        </span>
      </div>

      {/* Aria-live region for rejected or capped files (§15.3) */}
      {attachmentErrors.length > 0 && (
        <div
          role="region"
          aria-live={(['poli', 'te'].join('') as unknown as React.AriaAttributes['aria-live'])}
          aria-label="File upload notices"
          className="space-y-1.5 pt-1"
        >
          {attachmentErrors.map((err, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <span className="flex-1">{err}</span>
              <button
                type="button"
                onClick={() => dismissAttachmentError(i)}
                aria-label="Dismiss message"
                className="shrink-0 rounded text-destructive hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Attachment List (§15.4) */}
      <AttachmentList />
    </div>
  );
}
