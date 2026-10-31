import { useState, useEffect } from 'react';
import { Eye, EyeOff, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { ModelPicker } from '../inputs/ModelPicker';
import { useSettings } from '../../state/SettingsContext';
import { getAdapter } from '../../providers/registry';
import { getDefaultModels } from '../../providers/modelFilter';
import { APP_ID } from '../../config';
import type { ProviderId, ModelInfo, ConnectionTestResult, AppError } from '../../types';

interface ProviderMeta {
  id: ProviderId;
  name: string;
  keyUrl: string;
  keyUrlLabel: string;
  freeTierNote?: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyUrlLabel: 'Anthropic Console',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyUrlLabel: 'Google AI Studio',
    freeTierNote:
      'On the Gemini API Free Tier (Unpaid Services), prompts, context, and generated content may be read, annotated, and processed by human reviewers and used by Google to improve and train Google products and AI models (do not submit sensitive, confidential, or personal information). On Paid Tiers, data is not used for model training and is not subject to human review. See Help for details.',
  },
];

export function ProvidersPanel() {
  const {
    settings,
    apiKeys,
    setApiKey,
    setRememberKeys,
    setSelectedModel,
    setShowAllModels,
    models: sharedModels,
    loadingModels,
    modelErrors,
    loadModels,
  } = useSettings();

  const [showKeys, setShowKeys] = useState<Record<ProviderId, boolean>>({
    anthropic: false,
    gemini: false,
  });

  const [testing, setTesting] = useState<Record<ProviderId, boolean>>({
    anthropic: false,
    gemini: false,
  });

  const [testResults, setTestResults] = useState<Record<ProviderId, ConnectionTestResult | null>>({
    anthropic: null,
    gemini: null,
  });

  const toggleShowKey = (id: ProviderId) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleTestConnection = async (providerId: ProviderId) => {
    const key = apiKeys[providerId];
    if (!key.trim()) return;

    setTesting((prev) => ({ ...prev, [providerId]: true }));
    setTestResults((prev) => ({ ...prev, [providerId]: null }));

    try {
      const adapter = getAdapter(providerId);
      const res = await adapter.testConnection({ id: providerId, apiKey: key });
      setTestResults((prev) => ({ ...prev, [providerId]: res }));

      if (res.ok) {
        // Refresh shared models cache
        await loadModels(providerId, key);
      }
    } catch {
      // Should not throw as testConnection catches, but guard anyway
    } finally {
      setTesting((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  return (
    <div className="space-y-8">
      {/* Global remember keys toggle */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="remember-keys" className="text-sm font-medium cursor-pointer">
            Remember my API keys on this device
          </Label>
          <Switch
            id="remember-keys"
            checked={settings.rememberKeys}
            onCheckedChange={setRememberKeys}
          />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Keys are sent only to the provider you choose. If you turn this on, keys are saved in this browser, where anyone using this device or browser profile, or a malicious browser extension, could read them. Set a monthly spending limit in your provider&apos;s dashboard. Turning this off deletes saved keys immediately.
        </p>
      </div>

      {/* Per-provider sections */}
      {PROVIDERS.map((provider) => {
        const apiKey = apiKeys[provider.id] || '';
        const isTesting = testing[provider.id];
        const testResult = testResults[provider.id];
        const currentModel = settings.selectedModel[provider.id] || '';
        const models = sharedModels[provider.id] || [];
        const isLoadingModels = loadingModels[provider.id];
        const modelError = modelErrors[provider.id];

        return (
          <div key={provider.id} className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">{provider.name}</h3>
              <a
                href={provider.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Get API key in {provider.keyUrlLabel}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* API Key field */}
            <div className="space-y-1.5">
              <Label htmlFor={`${APP_ID}-provider-key-${provider.id}`} className="text-xs font-medium">
                API Key
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id={`${APP_ID}-provider-key-${provider.id}`}
                    name={`${APP_ID}-provider-key-${provider.id}`}
                    type={showKeys[provider.id] ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(provider.id, e.target.value)}
                    placeholder={`Enter your ${provider.name} API key`}
                    autoComplete="off"
                    spellCheck={false}
                    data-1p-ignore="true"
                    data-lpignore="true"
                    className="font-mono text-xs pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleShowKey(provider.id)}
                    className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground"
                    aria-label={showKeys[provider.id] ? 'Hide API key' : 'Show API key'}
                  >
                    {showKeys[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isTesting || !apiKey.trim()}
                  onClick={() => handleTestConnection(provider.id)}
                  className="whitespace-nowrap min-w-[120px]"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Testing…
                    </>
                  ) : (
                    'Test connection'
                  )}
                </Button>
              </div>

              {provider.freeTierNote && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {provider.freeTierNote}
                </p>
              )}
            </div>

            {/* Test Connection Result */}
            {testResult && (
              <div
                className={`rounded-md p-3 text-xs ${
                  testResult.ok
                    ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    : 'border border-destructive/20 bg-destructive/10 text-destructive'
                }`}
              >
                {testResult.ok ? (
                  <div className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Connected, {testResult.modelsFound ?? 0} models found</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-start gap-1.5 font-medium">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{testResult.error?.message || 'Connection test failed'}</span>
                    </div>
                    {testResult.suggestions && testResult.suggestions.length > 0 && (
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        {testResult.suggestions.map((s, idx) => (
                          <li key={idx}>{s}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Reusable Model Picker mounted for now */}
            <div className="pt-2 border-t">
              <ModelPicker
                id={`model-picker-${provider.id}`}
                provider={provider.id}
                selectedModel={currentModel}
                onSelectModel={(model) => setSelectedModel(provider.id, model)}
                models={models}
                isLoading={isLoadingModels}
                error={modelError}
                showAllModels={settings.showAllModels}
                onToggleShowAll={setShowAllModels}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

