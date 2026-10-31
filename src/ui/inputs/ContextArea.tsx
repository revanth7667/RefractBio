import { useRef, useEffect } from 'react';
import { Label } from '../components/ui/label';
import { useJob } from '../../state/JobContext';

export function ContextArea() {
  const { jobInputs, setPastedText } = useJob();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
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
  );
}
