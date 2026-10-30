import React, { useState, useEffect } from 'react';
import type { ModelInfo, AppError } from '../../types';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { getDefaultModels } from '../../providers/modelFilter';

interface ModelPickerProps {
  id?: string;
  provider: 'anthropic' | 'gemini';
  selectedModel?: string;
  onSelectModel: (modelId: string) => void;
  models: ModelInfo[];
  isLoading?: boolean;
  error?: AppError | null;
  showAllModels: boolean;
  onToggleShowAll: (showAll: boolean) => void;
}

export function ModelPicker({
  id = 'model-picker',
  selectedModel = '',
  onSelectModel,
  models,
  isLoading = false,
  error = null,
  showAllModels,
  onToggleShowAll,
  provider,
}: ModelPickerProps) {
  const [isManual, setIsManual] = useState<boolean>(() => {
    if (!selectedModel) return false;
    return !models.some((m) => m.id === selectedModel);
  });
  const [manualValue, setManualValue] = useState<string>(selectedModel);

  // Filter models based on showAllModels:
  // When false: default choices (latest Sonnet, Haiku, Opus for Anthropic; latest Flash, Flash-lite, Pro for Gemini)
  // When true: all models
  const visibleModels = showAllModels ? models : getDefaultModels(models, provider);

  // Group into recommended ("Suggested") and others ("Models")
  // For UI grouping, recommended models are capabilitySource !== 'none' or pre-sorted
  // In modelFilter, recommended entries are ordered first
  const currentModelInfo = models.find((m) => m.id === selectedModel);

  useEffect(() => {
    if (selectedModel && !models.some((m) => m.id === selectedModel)) {
      setIsManual(true);
      setManualValue(selectedModel);
    }
  }, [selectedModel, models]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__manual__') {
      setIsManual(true);
      if (manualValue) {
        onSelectModel(manualValue);
      }
    } else {
      setIsManual(false);
      onSelectModel(val);
    }
  };

  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setManualValue(val);
    onSelectModel(val);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-sm font-medium">
          Model
        </Label>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={`${id}-show-all`}
            checked={showAllModels}
            onChange={(e) => onToggleShowAll(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <Label htmlFor={`${id}-show-all`} className="text-xs text-muted-foreground font-normal cursor-pointer">
            Show all models
          </Label>
        </div>
      </div>

      <select
        id={id}
        value={isManual ? '__manual__' : selectedModel}
        onChange={handleSelectChange}
        disabled={isLoading}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-950"
      >
        {isLoading && (
          <option value="" disabled>
            Loading models…
          </option>
        )}

        {!isLoading && visibleModels.length === 0 && !error && (
          <option value="" disabled>
            No chat models found. Check Show all models, or choose Other and type a model ID.
          </option>
        )}

        {!isLoading && visibleModels.length > 0 && (
          <optgroup label="Models">
            {visibleModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </optgroup>
        )}

        <option value="__manual__">Other (type a model ID)…</option>
      </select>

      {isManual && (
        <div className="pt-1">
          <Input
            placeholder="Type a model ID (e.g. claude-3-5-sonnet-20241022)"
            value={manualValue}
            onChange={handleManualChange}
            className="h-8 text-xs font-mono"
            aria-label="Custom model ID"
          />
        </div>
      )}

      {currentModelInfo?.smallTierGuess && (
        <p className="text-xs text-muted-foreground">
          This model&apos;s name suggests a smaller, faster tier that may write weaker resumes. This is a guess based on the name only.
        </p>
      )}

      {error && (
        <div className="rounded border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
          {error.message}
        </div>
      )}
    </div>
  );
}

