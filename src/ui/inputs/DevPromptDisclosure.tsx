import type { EffectiveMasterInfo, JobInputs, OutputKind, ResolvedInstructions } from '../../types';
import { assemble, OUTPUT_LABEL } from '../../prompt/assemble';
import { formatLocalDate } from '../../prompt/formatDate';

interface DevPromptDisclosureProps {
  selectedOutputs: readonly OutputKind[];
  jobInputs: JobInputs;
  effectiveMasterInfo: EffectiveMasterInfo;
  instructions: ResolvedInstructions;
}

export function DevPromptDisclosure({
  selectedOutputs,
  jobInputs,
  effectiveMasterInfo,
  instructions,
}: DevPromptDisclosureProps) {
  if (!import.meta.env.DEV) {
    return null;
  }

  const today = formatLocalDate(new Date());

  return (
    <details className="mt-4 rounded border border-dashed border-amber-500/50 p-3 text-xs bg-amber-500/5">
      <summary className="cursor-pointer font-semibold text-amber-900 dark:text-amber-200">
        Show prompt
      </summary>
      <div className="mt-3 space-y-4 font-mono">
        {selectedOutputs.length === 0 ? (
          <p className="text-muted-foreground">No outputs selected.</p>
        ) : (
          selectedOutputs.map((kind) => {
            const prompt = assemble(
              kind,
              jobInputs,
              effectiveMasterInfo.text,
              instructions,
              today,
            );

            const firstPart = prompt.userParts[0];
            const partA = firstPart && firstPart.type === 'text' ? firstPart.text : '';

            const lastPart = prompt.userParts[prompt.userParts.length - 1];
            const partC = lastPart && lastPart.type === 'text' ? lastPart.text : '';

            const binaryParts = prompt.userParts.slice(1, -1);

            return (
              <div key={kind} className="space-y-2 border-t pt-3">
                <h4 className="font-bold text-sm text-foreground">
                  {OUTPUT_LABEL[kind]} ({kind})
                </h4>
                <div className="space-y-1">
                  <div className="font-semibold text-muted-foreground">System:</div>
                  <pre className="whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px]">
                    {prompt.system}
                  </pre>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-muted-foreground">Part A (User text):</div>
                  <pre className="whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px]">
                    {partA}
                  </pre>
                </div>
                {binaryParts.length > 0 && (
                  <div className="space-y-1">
                    <div className="font-semibold text-muted-foreground">Binary attachments:</div>
                    <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
                      {binaryParts.map((part, idx) => (
                        <li key={idx}>
                          {part.type === 'image' && `[Image: ${part.name} (${part.mime})]`}
                          {part.type === 'pdf' && `[PDF: ${part.name}]`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="space-y-1">
                  <div className="font-semibold text-muted-foreground">Part C (User text):</div>
                  <pre className="whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px]">
                    {partC}
                  </pre>
                </div>
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}
