import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { ModelPicker } from './ModelPicker';
import { DevPromptDisclosure } from './DevPromptDisclosure';
import { useSettings } from '../../state/SettingsContext';
import { useMasterInfo } from '../../state/MasterInfoContext';
import { useInstructions } from '../../state/InstructionsContext';
import { useJob } from '../../state/JobContext';
import { sendBlockers } from '../../prompt/sendBlockers';
import { aggregateEstimates } from '../../prompt/estimate';
import { formatLocalDate } from '../../prompt/formatDate';
import type { ProviderId } from '../../types';

interface SendBarProps {
  onSend?: () => void;
}

export function SendBar({ onSend }: SendBarProps) {
  const {
    settings,
    apiKeys,
    models,
    loadingModels,
    modelErrors,
    setSelectedProvider,
    setSelectedModel,
    setShowAllModels,
    openSettings,
  } = useSettings();

  const { effectiveMasterInfo, hasUnsavedChanges: hasUnsavedMasterInfo } = useMasterInfo();
  const { resolvedSaved } = useInstructions();
  const { jobInputs, clearJob } = useJob();

  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [estimateLine, setEstimateLine] = useState('');

  const selectedProvider = settings.selectedProvider;
  const currentKey = apiKeys[selectedProvider];
  const hasApiKey = Boolean(currentKey && currentKey.trim());
  const selectedModel = settings.selectedModel[selectedProvider] || null;
  const currentModels = models[selectedProvider] || [];
  const modelInfo = currentModels.find((m) => m.id === selectedModel) || null;

  // Compute blockers and notices per §14.6
  const { blocker, notices } = sendBlockers({
    selectedOutputs: jobInputs.selectedOutputs,
    effectiveMasterInfo,
    pastedText: jobInputs.pastedText,
    questions: jobInputs.questions,
    customInstructions: jobInputs.customInstructions,
    attachments: jobInputs.attachments,
    provider: selectedProvider,
    hasApiKey,
    selectedModel,
    modelInfo,
    hasUnsavedMasterInfo,
  });

  // Debounced token estimate update (300 ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      const today = formatLocalDate(new Date());
      const agg = aggregateEstimates(
        jobInputs.selectedOutputs,
        jobInputs,
        effectiveMasterInfo.text,
        resolvedSaved,
        today,
      );
      setEstimateLine(agg.formattedLine);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    jobInputs.selectedOutputs,
    jobInputs.pastedText,
    jobInputs.questions,
    jobInputs.customInstructions,
    jobInputs.attachments,
    effectiveMasterInfo.text,
    resolvedSaved,
  ]);

  const handleSend = () => {
    if (blocker !== null) return;
    // M7b seam: Send triggers the generation workflow
    if (onSend) {
      onSend();
    }
  };

  const handleConfirmClear = () => {
    // M7b seam: abort requests and reset tabs
    clearJob();
    setClearDialogOpen(false);
  };

  const fallbackCount = resolvedSaved.fallbacks.length;

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      {/* Provider & Model Selectors */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sendbar-provider-select" className="text-sm font-medium">
            Provider
          </Label>
          <select
            id="sendbar-provider-select"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value as ProviderId)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>

        <div>
          <ModelPicker
            id="sendbar-model-picker"
            provider={selectedProvider}
            selectedModel={selectedModel || ''}
            onSelectModel={(modelId) => setSelectedModel(selectedProvider, modelId)}
            models={currentModels}
            isLoading={loadingModels[selectedProvider]}
            error={modelErrors[selectedProvider]}
            showAllModels={settings.showAllModels}
            onToggleShowAll={setShowAllModels}
          />
        </div>
      </div>

      {/* Instructions badge & Token Estimate */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t text-xs">
        {fallbackCount > 0 && (
          <Badge variant="outline" className="text-amber-800 dark:text-amber-200 border-amber-500/40 bg-amber-500/10">
            Instructions: {fallbackCount} {fallbackCount === 1 ? 'section' : 'sections'} using default
          </Badge>
        )}
        {estimateLine && (
          <span className="text-muted-foreground">{estimateLine}</span>
        )}
      </div>

      {/* Notices */}
      {notices.length > 0 && (
        <div className="space-y-1 text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 p-2.5 rounded border border-amber-500/30">
          {notices.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}

      {/* Blocker reason & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <div className="flex-1">
          {blocker && (
            <div
              id="send-blocker-reason"
              role="alert"
              className="text-xs text-destructive flex flex-wrap items-center gap-2 font-medium"
            >
              <span>{blocker.message}</span>
              {blocker.action === 'open-master-info' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    openSettings('masterInfo');
                  }}
                  className="h-7 px-2 text-xs"
                >
                  Open Master Info
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setClearDialogOpen(true)}
          >
            Clear job
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={blocker !== null}
            onClick={handleSend}
            aria-describedby={blocker ? 'send-blocker-reason' : undefined}
          >
            Send
          </Button>
        </div>
      </div>

      {/* Clear Job Confirmation AlertDialog (§14.5) */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this job?</AlertDialogTitle>
            <AlertDialogDescription>
              Clear this job? This removes the job context, questions, attachments, custom instructions and all generated outputs, including previous versions. Your Master Info, instructions file and API keys are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClear}>
              Clear job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dev-only Show prompt disclosure */}
      {import.meta.env.DEV && (
        <DevPromptDisclosure
          selectedOutputs={jobInputs.selectedOutputs}
          jobInputs={jobInputs}
          effectiveMasterInfo={effectiveMasterInfo}
          instructions={resolvedSaved}
        />
      )}
    </div>
  );
}
