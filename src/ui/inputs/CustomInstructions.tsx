import { useJob } from '../../state/JobContext';

export function CustomInstructions() {
  const { jobInputs, setCustomInstructions } = useJob();

  return (
    <details className="group rounded-md border border-border p-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer items-center justify-between font-medium text-sm text-foreground">
        <span id="custom-instructions-label">Custom instructions (this job only)</span>
        <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">
          ▼
        </span>
      </summary>
      <div className="mt-3 space-y-1.5">
        <textarea
          id="custom-instructions-input"
          aria-labelledby="custom-instructions-label"
          rows={3}
          value={jobInputs.customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="e.g. Emphasise reporting automation. Keep the cover letter under 250 words."
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y min-h-[75px]"
        />
        <p className="text-xs text-muted-foreground">
          Applies to every output for this job. Cleared with Clear job.
        </p>
      </div>
    </details>
  );
}
