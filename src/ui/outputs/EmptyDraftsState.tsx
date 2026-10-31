import { useMasterInfo } from '../../state/MasterInfoContext';
import { useJob } from '../../state/JobContext';
import { hasTemplateMarker } from '../../masterInfo/masterInfo';

interface EmptyDraftsStateProps {
  step3Done?: boolean;
}

export function EmptyDraftsState({ step3Done = false }: EmptyDraftsStateProps) {
  const { effectiveMasterInfo } = useMasterInfo();
  const { jobInputs } = useJob();

  const step1Done =
    !hasTemplateMarker(effectiveMasterInfo.text) &&
    effectiveMasterInfo.text.trim().length > 0;
  const step2Done = jobInputs.pastedText.trim().length > 0;

  return (
    <div className="flex h-full min-h-[350px] items-center justify-center p-6 text-center">
      <div className="w-full max-w-md rounded-xl border border-dashed border-border bg-muted/20 p-8 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Your drafts will appear here
        </h2>
        <div className="space-y-2.5 text-sm text-muted-foreground text-left max-w-xs mx-auto">
          <div className="flex items-center justify-between">
            <span>1. Fill in your Master Info (Settings).</span>
            {step1Done && <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-2">✓</span>}
          </div>
          <div className="flex items-center justify-between">
            <span>2. Add job context.</span>
            {step2Done && <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-2">✓</span>}
          </div>
          <div className="flex items-center justify-between">
            <span>3. Pick outputs and press Send.</span>
            {step3Done && <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-2">✓</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
