import React, { useState } from 'react';
import { ContextArea } from '../inputs/ContextArea';
import { OutputToggles } from '../inputs/OutputToggles';
import { QuestionsBox } from '../inputs/QuestionsBox';
import { CustomInstructions } from '../inputs/CustomInstructions';
import { SendBar } from '../inputs/SendBar';
import { EmptyDraftsState } from '../outputs/EmptyDraftsState';
import { OutputTabs } from '../outputs/OutputTabs';
import { visibleTabs } from '../../generation/visibleTabs';
import { sendBlockers } from '../../prompt/sendBlockers';
import { useSettings } from '../../state/SettingsContext';
import { useMasterInfo } from '../../state/MasterInfoContext';
import { useJob } from '../../state/JobContext';
import { useGeneration } from '../../state/GenerationContext';
import { extractPastedImageFiles } from '../../files/paste';

export function MainWorkspace() {
  const { settings, apiKeys, models } = useSettings();
  const { effectiveMasterInfo, hasUnsavedChanges: hasUnsavedMasterInfo } = useMasterInfo();
  const { jobInputs, addFiles } = useJob();
  const { tabs, isGenerating, sendRun } = useGeneration();

  // Active narrow screen tab (Inputs or Outputs)
  const [narrowTab, setNarrowTab] = useState<'inputs' | 'outputs'>('inputs');

  const selectedProvider = settings.selectedProvider;
  const currentKey = apiKeys[selectedProvider];
  const hasApiKey = Boolean(currentKey && currentKey.trim());
  const selectedModel = settings.selectedModel[selectedProvider] || null;
  const currentModels = models[selectedProvider] || [];
  const modelInfo = currentModels.find((m) => m.id === selectedModel) || null;

  const { blocker } = sendBlockers({
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

  const canSend = blocker === null;

  const handleSend = () => {
    if (!canSend || isGenerating) return;
    setNarrowTab('outputs');
    sendRun();
  };

  const handleTablistKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const nextTab = narrowTab === 'inputs' ? 'outputs' : 'inputs';
      setNarrowTab(nextTab);
      const targetId = nextTab === 'inputs' ? 'inputs-tab' : 'outputs-tab';
      document.getElementById(targetId)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setNarrowTab('inputs');
      document.getElementById('inputs-tab')?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setNarrowTab('outputs');
      document.getElementById('outputs-tab')?.focus();
    }
  };

  const handleLeftPaneKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (canSend && !isGenerating) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const handleLeftPanePaste = (e: React.ClipboardEvent) => {
    const existingNames = jobInputs.attachments.map((a) => a.name);
    const pastedImages = extractPastedImageFiles(e.clipboardData, existingNames);
    if (pastedImages.length > 0) {
      e.preventDefault();
      addFiles(pastedImages);
    }
  };

  const displayedTabs = visibleTabs(tabs);

  const leftPaneContent = (
    <div
      onKeyDown={handleLeftPaneKeyDown}
      onPaste={handleLeftPanePaste}
      className="space-y-6"
      tabIndex={-1}
    >
      <ContextArea />
      <OutputToggles />
      <QuestionsBox />
      <CustomInstructions />
      <SendBar onSend={handleSend} />
    </div>
  );

  const rightPaneContent = (
    <div className="h-full">
      {displayedTabs.length === 0 ? (
        <EmptyDraftsState />
      ) : (
        <OutputTabs />
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Narrow screens (< 768px): tabs for Inputs and Outputs per §17.1 */}
      <div className="md:hidden mb-4">
        <div
          className="grid grid-cols-2 rounded-lg bg-muted p-1 text-muted-foreground"
          role="tablist"
          aria-label="Workspace views"
          onKeyDown={handleTablistKeyDown}
        >
          <button
            type="button"
            role="tab"
            id="inputs-tab"
            aria-selected={narrowTab === 'inputs'}
            aria-controls="inputs-panel"
            tabIndex={narrowTab === 'inputs' ? 0 : -1}
            onClick={() => setNarrowTab('inputs')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              narrowTab === 'inputs'
                ? 'bg-background text-foreground shadow'
                : 'hover:text-foreground'
            }`}
          >
            Inputs
          </button>
          <button
            type="button"
            role="tab"
            id="outputs-tab"
            aria-selected={narrowTab === 'outputs'}
            aria-controls="outputs-panel"
            tabIndex={narrowTab === 'outputs' ? 0 : -1}
            onClick={() => setNarrowTab('outputs')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              narrowTab === 'outputs'
                ? 'bg-background text-foreground shadow'
                : 'hover:text-foreground'
            }`}
          >
            <span>Outputs</span>
            {isGenerating && (
              <span
                className="ml-1.5 h-2 w-2 rounded-full bg-primary shrink-0"
                aria-label="Generating"
                role="img"
              >
                <span className="sr-only">(generating)</span>
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main two-pane layout: collapsed to active tab on <768px, 40/60 side-by-side on ≥768px */}
      <div className="flex flex-col md:flex-row md:gap-8 w-full">
        {/* Left pane: Inputs */}
        <div
          id="inputs-panel"
          role="tabpanel"
          aria-labelledby="inputs-tab"
          className={`${
            narrowTab === 'inputs' ? 'block' : 'hidden'
          } md:block md:w-[40%] md:overflow-y-auto md:max-h-[calc(100vh-10rem)] md:pr-2`}
        >
          {leftPaneContent}
        </div>

        {/* Right pane: Outputs */}
        <div
          id="outputs-panel"
          role="tabpanel"
          aria-labelledby="outputs-tab"
          className={`${
            narrowTab === 'outputs' ? 'block' : 'hidden'
          } md:block md:w-[60%] md:overflow-y-auto md:max-h-[calc(100vh-10rem)] md:pl-2 md:border-l md:border-border/40`}
        >
          {rightPaneContent}
        </div>
      </div>
    </div>
  );
}
